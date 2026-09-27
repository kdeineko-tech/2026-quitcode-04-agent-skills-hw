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

// C3: n8n webhook calls confined to one server module (a file whose name/path
// suggests it IS the designated n8n client, e.g. lib/n8n/client.ts, is allowed).
{
  const violations = [];
  const callSitePattern = /N8N_WEBHOOK_(BASE_)?URL|\/webhook\//;
  const allowedModule = /(^|\/)lib\/n8n\/client\.(ts|js|mjs)$/;
  for (const file of sourceFiles) {
    if (allowedModule.test(rel(file))) continue;
    const lines = readLines(file);
    lines.forEach((line, i) => {
      if (callSitePattern.test(line) && /fetch\s*\(/.test(line)) {
        violations.push(`${rel(file)}:${i + 1}`);
      }
    });
  }
  record("C3", "n8n webhook fetch() calls live only in lib/n8n/client.*", violations);
}

// C4: every n8n webhook fetch() call has AbortSignal.timeout nearby (within 5 lines after).
{
  const violations = [];
  const callSitePattern = /N8N_WEBHOOK_(BASE_)?URL|\/webhook\//;
  for (const file of sourceFiles) {
    const lines = readLines(file);
    for (let i = 0; i < lines.length; i++) {
      if (callSitePattern.test(lines[i]) && /fetch\s*\(/.test(lines[i])) {
        const window = lines.slice(i, i + 6).join("\n");
        if (!/AbortSignal\.timeout\s*\(/.test(window)) {
          violations.push(`${rel(file)}:${i + 1}`);
        }
      }
    }
  }
  record("C4", "n8n webhook fetch() calls have AbortSignal.timeout(...)", violations);
}

// C5: a callback route (path contains api/n8n or filename suggests a webhook callback
// handler) must not call req.json()/JSON.parse before a signature check appears.
{
  const violations = [];
  const routePattern = /(^|\/)app\/api\/n8n\//;
  for (const file of sourceFiles) {
    if (!routePattern.test(rel(file))) continue;
    const lines = readLines(file);
    let sawParseBeforeSignatureCheck = false;
    let sawSignatureCheck = false;
    lines.forEach((line, i) => {
      const isParse = /\.json\(\)|JSON\.parse\(/.test(line);
      const isSigCheck = /timingSafeEqual|x-n8n-signature|signature/i.test(line);
      if (isParse && !sawSignatureCheck) {
        sawParseBeforeSignatureCheck = true;
        violations.push(`${rel(file)}:${i + 1}`);
      }
      if (isSigCheck) sawSignatureCheck = true;
    });
    void sawParseBeforeSignatureCheck;
  }
  record("C5", "callback route verifies signature before JSON.parse", violations);
}

// C6: no ===/!== comparison against something named signature/token/secret.
{
  const violations = [];
  const pattern = /\b(signature|token|secret)\w*\s*(===|!==)|(===|!==)\s*\w*\b(signature|token|secret)\b/i;
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
