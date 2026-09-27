#!/usr/bin/env node
// Static check of a project's code against the team's Next.js <-> n8n webhook contract
// (see ../references/). Node built-ins only, no dependencies. Never prints secret values
// or request bodies -- only file paths, line numbers, and the rule that fired.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parseArgs } from "node:util";

const USAGE = `check-contract.mjs -- static check of the Next.js <-> n8n webhook contract

Usage:
  node check-contract.mjs [--root <dir>] [--help]

Options:
  --root <dir>   Directory to scan (default: current directory).
  --help         Show this help.

Checks (each prints an id and PASS/FAIL; FAIL lines include file:line):
  C1  No /webhook-test/ URL in source or .env.example.
  C2  No NEXT_PUBLIC_*N8N* environment variable name.
  C3  n8n webhook calls confined to one server module.
  C4  Every n8n webhook fetch() call has a nearby AbortSignal.timeout(...).
  C5  A callback route never parses JSON before a signature check.
  C6  No ===/!== comparison against something named signature/token/secret.
  C7  .env.example uses change-me-... placeholders for N8N secrets, not real values.

Exit code is non-zero if any check FAILs.
`;

let args;
try {
  args = parseArgs({
    options: {
      root: { type: "string", default: "." },
      help: { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: false,
  }).values;
} catch (error) {
  console.error(`check-contract: ${error.message}\n\nRun with --help for usage.`);
  process.exit(2);
}

if (args.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const ROOT = args.root;
try {
  if (!statSync(ROOT).isDirectory()) throw new Error("not a directory");
} catch {
  console.error(`check-contract: --root "${ROOT}" is not a directory.`);
  process.exit(2);
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".claude", "coverage", "out", "build"]);
const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const allFiles = walk(ROOT);
const sourceFiles = allFiles.filter((f) => SOURCE_EXT.has(extOf(f)));
const envExampleFiles = allFiles.filter((f) => relative(ROOT, f).replace(/\\/g, "/") === ".env.example");

function extOf(path) {
  const i = path.lastIndexOf(".");
  return i === -1 ? "" : path.slice(i);
}

function readLines(path) {
  return readFileSync(path, "utf8").split("\n");
}

function rel(path) {
  return relative(ROOT, path).replace(/\\/g, "/");
}

const results = [];

function record(id, title, violations) {
  results.push({ id, title, violations });
}

// C1: no /webhook-test/ anywhere in source or .env.example. The mock n8n server itself
// (tools/mock-n8n.mjs or a skill's copy of it) legitimately implements that path -- it's
// standing in for n8n's own test-URL behavior, not a misconfigured webhook -- so it's excluded.
{
  const violations = [];
  const isMock = (f) => /(^|\/)mock-n8n\.mjs$/.test(rel(f));
  for (const file of [...sourceFiles, ...envExampleFiles]) {
    if (isMock(file)) continue;
    const lines = readLines(file);
    lines.forEach((line, i) => {
      if (line.includes("/webhook-test/")) violations.push(`${rel(file)}:${i + 1}`);
    });
  }
  record("C1", "no /webhook-test/ URL in code or .env.example", violations);
}

// C2: no NEXT_PUBLIC_*N8N* env var name
{
  const violations = [];
  const pattern = /NEXT_PUBLIC_[A-Z0-9_]*N8N[A-Z0-9_]*/;
  for (const file of [...sourceFiles, ...envExampleFiles]) {
    const lines = readLines(file);
    lines.forEach((line, i) => {
      if (pattern.test(line)) violations.push(`${rel(file)}:${i + 1}`);
    });
  }
  record("C2", "no NEXT_PUBLIC_* env var name referencing N8N", violations);
}

// Shared helper for C3/C4: a "call site" is a fetch(...) call whose surrounding lines
// (not necessarily the same line -- the URL is often built a few lines earlier and
// passed in as a variable) reference an n8n webhook URL or its env vars.
const N8N_URL_PATTERN = /N8N_WEBHOOK_(BASE_)?URL|\/webhook\//;
const FETCH_PATTERN = /fetch\s*\(/;
const CALL_SITE_WINDOW = 8;

function findN8nFetchCallSites(lines) {
  const urlLines = [];
  const fetchLines = [];
  lines.forEach((line, i) => {
    if (N8N_URL_PATTERN.test(line)) urlLines.push(i);
    if (FETCH_PATTERN.test(line)) fetchLines.push(i);
  });
  return fetchLines.filter((f) => urlLines.some((u) => Math.abs(u - f) <= CALL_SITE_WINDOW));
}

// C3: n8n webhook calls confined to one server module (a file whose name/path
// suggests it IS the designated n8n client, e.g. lib/n8n/client.ts, is allowed).
{
  const violations = [];
  const allowedModule = /(^|\/)lib\/n8n\/client\.(ts|js|mjs)$/;
  for (const file of sourceFiles) {
    if (allowedModule.test(rel(file))) continue;
    const lines = readLines(file);
    for (const i of findN8nFetchCallSites(lines)) violations.push(`${rel(file)}:${i + 1}`);
  }
  record("C3", "n8n webhook fetch() calls live only in lib/n8n/client.*", violations);
}

// C4: every n8n webhook fetch() call has AbortSignal.timeout nearby (either side).
{
  const violations = [];
  for (const file of sourceFiles) {
    const lines = readLines(file);
    for (const i of findN8nFetchCallSites(lines)) {
      const start = Math.max(0, i - CALL_SITE_WINDOW);
      const end = Math.min(lines.length, i + CALL_SITE_WINDOW + 1);
      const window = lines.slice(start, end).join("\n");
      if (!/AbortSignal\.timeout\s*\(/.test(window)) violations.push(`${rel(file)}:${i + 1}`);
    }
  }
  record("C4", "n8n webhook fetch() calls have AbortSignal.timeout(...)", violations);
}

// C5: a callback route (under app/api/n8n/) must not call req.json()/JSON.parse before
// an actual signature verification (a real timingSafeEqual(...) call -- not just a
// mention of "signature", which a comment or a header-read line could trigger).
// Comment-only lines are ignored on both sides so a stray "// verify signature" note
// can't be mistaken for the real check.
{
  const violations = [];
  const routePattern = /(^|\/)app\/api\/n8n\//;
  for (const file of sourceFiles) {
    if (!routePattern.test(rel(file))) continue;
    const lines = readLines(file);
    let sawSignatureCheck = false;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      const isParse = /\.json\(\)|JSON\.parse\(/.test(line);
      if (isParse && !sawSignatureCheck) violations.push(`${rel(file)}:${i + 1}`);
      if (/timingSafeEqual\s*\(/.test(line)) sawSignatureCheck = true;
    });
  }
  record("C5", "callback route verifies signature (timingSafeEqual) before JSON.parse", violations);
}

// C6: no ===/!== comparison against something named signature/token/secret, including
// camelCase identifiers (expectedSignature, providedToken, ...) -- deliberately no word
// boundary in front of the keyword so a substring match still catches those.
{
  const violations = [];
  const pattern = /(signature|token|secret)\w*\s*(===|!==)|(===|!==)\s*\w*(signature|token|secret)/i;
  for (const file of sourceFiles) {
    const lines = readLines(file);
    lines.forEach((line, i) => {
      if (pattern.test(line)) violations.push(`${rel(file)}:${i + 1}`);
    });
  }
  record("C6", "no === / !== comparison against a signature/token/secret", violations);
}

// C7: .env.example's N8N secret vars use change-me-... placeholders.
{
  const violations = [];
  const secretNames = ["N8N_WEBHOOK_TOKEN", "N8N_CALLBACK_SECRET"];
  for (const file of envExampleFiles) {
    const lines = readLines(file);
    lines.forEach((line, i) => {
      for (const name of secretNames) {
        const match = line.match(new RegExp(`^${name}\\s*=\\s*(.+)$`));
        if (match && !/^change-me-/.test(match[1].trim())) {
          violations.push(`${rel(file)}:${i + 1}`);
        }
      }
    });
  }
  record("C7", ".env.example N8N secrets use change-me-... placeholders", violations);
}

let failCount = 0;
for (const { id, title, violations } of results) {
  if (violations.length === 0) {
    console.log(`${id} PASS  ${title}`);
  } else {
    failCount++;
    console.log(`${id} FAIL  ${title}`);
    for (const loc of violations) console.log(`     ${loc}`);
  }
}

console.log(`\n${results.length} checks, ${failCount} FAIL`);
process.exit(failCount > 0 ? 1 : 0);
