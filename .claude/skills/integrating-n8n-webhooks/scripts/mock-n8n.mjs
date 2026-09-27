#!/usr/bin/env node
// Offline stand-in for an n8n instance: Webhook node (test and production URLs,
// Header Auth, response modes), n8n Cloud's timeout, and a signed callback sent
// by an HTTP Request node. Zero dependencies. Never logs bodies or header values.

import http from "node:http";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { parseArgs } from "node:util";

const USAGE = `Offline n8n mock (Webhook + Respond to Webhook + signed HTTP Request callback)

Usage:
  node tools/mock-n8n.mjs [options]
  node --env-file=.env.local tools/mock-n8n.mjs [options]   (reads the secrets below)

Options:
  --port <n>             Port to listen on (default 5678, like n8n).
  --host <addr>          Address to bind (default 127.0.0.1).
  --mode <mode>          How the Webhook node responds (default immediately):
                           immediately   200 {"message":"Workflow was started"} at once
                           last-node     200 with the result after the workflow finishes
                           respond-202   202 {"job_id":"<uuid>"} at once (Respond to Webhook)
                           slow          like last-node, but the workflow takes 60 s
  --delay <ms>           How long the workflow runs. Defaults: last-node 2000,
                         slow 60000, immediately and respond-202 3000 (then the callback).
  --cloud-timeout <ms>   Emulate n8n Cloud: a synchronous response that is not ready
                         within <ms> fails with 524 (real Cloud limit: 100000; use
                         e.g. 5000 to see it quickly).
  --listen               Register the test URLs /webhook-test/<path> for 120 s, like
                         "Listen for test event" in the editor. Without it they are 404.
  --callback-url <url>   Where the workflow sends its signed callback when it finishes
                         (async modes). Default: "callbackUrl" from the request body.
  --callback-event <e>   "event" in the callback body (default "<path>.completed").
  -h, --help             Show this help.

Environment (never pass secrets as flags):
  N8N_WEBHOOK_TOKEN      If set, every webhook requires header x-n8n-token with this
                         value (n8n Header Auth). Missing or wrong -> 403.
  N8N_CALLBACK_SECRET    HMAC secret for callbacks (n8n Crypto credential). Without it
                         no callbacks are sent.

Endpoints:
  POST /webhook/<path>        production URL (always registered here)
  POST /webhook-test/<path>   test URL (only with --listen, for 120 s)
  GET  /healthz               200 {"status":"ok"}

Callback (async modes): POST <callback url>, body
  {"version":1,"event":"<event>","data":{"jobId",...}}
  headers x-n8n-timestamp: <unix seconds>,
          x-n8n-signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>,
          idempotency-key: <data.jobId>:<event> (the same values as in the signed
            body above), x-correlation-id (copied from the trigger)
  Retried like "Retry On Fail" (3 tries, 1000 ms apart) on network errors and 5xx.

The log shows method, path, status, duration, header NAMES, body size and sha256.
Bodies and header values are never printed.
`;

const MODES = ["immediately", "last-node", "respond-202", "slow"];
const DEFAULT_DELAY = { immediately: 3000, "last-node": 2000, "respond-202": 3000, slow: 60000 };
const TEST_WINDOW_MS = 120_000;
const MAX_BODY_BYTES = 16 * 1024 * 1024;
const CALLBACK_TRIES = 3;
const CALLBACK_WAIT_MS = 1000;
const CALLBACK_TIMEOUT_MS = 10_000;
const QUIET_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
  "sec-fetch-mode",
]);

function fail(message) {
  console.error(`mock-n8n: ${message}\nRun with --help for usage.`);
  process.exit(2);
}

function parseMs(name, raw) {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) fail(`--${name} must be a whole number of milliseconds`);
  return value;
}

let args;
try {
  args = parseArgs({
    options: {
      port: { type: "string", default: "5678" },
      host: { type: "string", default: "127.0.0.1" },
      mode: { type: "string", default: "immediately" },
      delay: { type: "string" },
      "cloud-timeout": { type: "string" },
      listen: { type: "boolean", default: false },
      "callback-url": { type: "string" },
      "callback-event": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  }).values;
} catch (error) {
  fail(error.message);
}

if (args.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}

if (!MODES.includes(args.mode)) fail(`unknown --mode "${args.mode}" (use ${MODES.join(", ")})`);
const port = Number(args.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail("--port must be 0-65535");
const mode = args.mode;
const delayMs = parseMs("delay", args.delay) ?? DEFAULT_DELAY[mode];
const cloudTimeoutMs = parseMs("cloud-timeout", args["cloud-timeout"]);
const callbackUrlFlag = args["callback-url"];
if (callbackUrlFlag !== undefined && !isHttpUrl(callbackUrlFlag)) fail("--callback-url must be an http(s) URL");

const token = process.env.N8N_WEBHOOK_TOKEN || "";
const callbackSecret = process.env.N8N_CALLBACK_SECRET || "";
const startedAt = Date.now();
const testUrlsUntil = args.listen ? startedAt + TEST_WINDOW_MS : 0;
const seenIdempotencyKeys = new Set();

function log(line) {
  console.log(`[mock-n8n] ${new Date().toISOString()} ${line}`);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sameSecret(given, expected) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function headerNames(headers) {
  return Object.keys(headers)
    .filter((name) => !QUIET_HEADERS.has(name))
    .sort()
    .join(",");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  if (res.writableEnded || res.destroyed) return false;
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": contentType, "content-length": Buffer.byteLength(payload) });
  res.end(payload);
  return true;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= MAX_BODY_BYTES) chunks.push(chunk);
  }
  return { body: Buffer.concat(chunks), size };
}

function parseEnvelope(body, contentType) {
  if (!contentType?.includes("json") || body.length === 0) return null;
  try {
    const value = JSON.parse(body.toString("utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

async function sendCallback({ target, event, jobId, correlationId, requestKey }) {
  const body = JSON.stringify({
    version: 1,
    event,
    data: {
      jobId,
      status: "completed",
      correlationId,
      requestIdempotencyKey: requestKey,
      result: { documentUrl: `https://files.example.test/n8n/${jobId}.pdf` },
      completedAt: new Date().toISOString(),
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", callbackSecret).update(`${timestamp}.${body}`).digest("hex");
  const headers = {
    "content-type": "application/json",
    "x-n8n-timestamp": timestamp,
    "x-n8n-signature": `sha256=${signature}`,
    "idempotency-key": `${jobId}:${event}`,
  };
  if (correlationId) headers["x-correlation-id"] = correlationId;
  const where = new URL(target);
  const label = `${where.origin}${where.pathname}`;

  for (let attempt = 1; attempt <= CALLBACK_TRIES; attempt++) {
    const started = Date.now();
    try {
      const response = await fetch(target, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
      });
      await response.arrayBuffer();
      log(
        `callback POST ${label} -> ${response.status} in ${Date.now() - started} ms` +
          ` (try ${attempt}/${CALLBACK_TRIES}) event=${event} body ${Buffer.byteLength(body)} B sha256=${sha256(body)}`,
      );
      if (response.status < 500) return;
    } catch (error) {
      log(`callback POST ${label} failed: ${error.cause?.code ?? error.name} (try ${attempt}/${CALLBACK_TRIES})`);
    }
    if (attempt < CALLBACK_TRIES) await sleep(CALLBACK_WAIT_MS);
  }
  log(`callback POST ${label} gave up after ${CALLBACK_TRIES} tries`);
}

function scheduleCallback({ envelope, path, jobId, correlationId, requestKey }) {
  const envelopeTarget = typeof envelope?.callbackUrl === "string" ? envelope.callbackUrl : undefined;
  const target = callbackUrlFlag ?? (envelopeTarget && isHttpUrl(envelopeTarget) ? envelopeTarget : undefined);
  if (!target) return;
  if (!callbackSecret) {
    log("callback skipped: N8N_CALLBACK_SECRET is not set (the Hmac Secret of n8n's Crypto credential)");
    return;
  }
  const event = args["callback-event"] ?? `${path}.completed`;
  log(`workflow ${jobId} running for ${delayMs} ms, then callback event=${event}`);
  setTimeout(() => {
    sendCallback({ target, event, jobId, correlationId, requestKey }).catch((error) =>
      log(`callback error: ${error.message}`),
    );
  }, delayMs);
}

async function handleWebhook(req, res, kind, path, body, size, started) {
  const extra = [];
  const finish = (status) => {
    log(
      `${req.method} /${kind}/${path} -> ${status} in ${Date.now() - started} ms ${extra.join(" ")}` +
        ` | headers: ${headerNames(req.headers) || "-"} | body ${size} B sha256=${sha256(body)}`,
    );
  };

  if (kind === "webhook-test" && Date.now() > testUrlsUntil) {
    send(res, 404, {
      code: 404,
      message: `The requested webhook "${path}" is not registered.`,
      hint: args.listen
        ? "The 120 s test window is over. Restart the mock with --listen, or use the production URL /webhook/<path>."
        : "Test URLs work only after 'Listen for test event' (mock: --listen). A published workflow uses /webhook/<path>.",
    });
    return finish(404);
  }

  if (req.method !== "POST") {
    send(res, 404, {
      code: 404,
      message: `This webhook is not registered for ${req.method} requests. Did you mean to make a POST request?`,
    });
    return finish(404);
  }

  if (token) {
    const given = req.headers["x-n8n-token"];
    const ok = typeof given === "string" && sameSecret(given, token);
    extra.push(`auth=${ok ? "ok" : given === undefined ? "missing" : "wrong"}`);
    if (!ok) {
      send(res, 403, { code: 403, message: "Authorization data is wrong!" });
      return finish(403);
    }
  } else {
    extra.push("auth=none");
  }

  const requestKey = typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : null;
  if (!requestKey) {
    extra.push("idempotency=absent");
  } else {
    extra.push(`idempotency=${seenIdempotencyKeys.has(requestKey) ? "repeat" : "new"}`);
    seenIdempotencyKeys.add(requestKey);
  }

  if (size > MAX_BODY_BYTES) {
    send(res, 413, { code: 413, message: "Request body is larger than 16 MB (N8N_PAYLOAD_SIZE_MAX)." });
    return finish(413);
  }

  const envelope = parseEnvelope(body, req.headers["content-type"]);
  const correlationId = typeof req.headers["x-correlation-id"] === "string" ? req.headers["x-correlation-id"] : null;
  const jobId = randomUUID();

  if (mode === "immediately" || mode === "respond-202") {
    if (mode === "immediately") send(res, 200, { message: "Workflow was started" });
    else send(res, 202, { job_id: jobId });
    finish(mode === "immediately" ? 200 : 202);
    scheduleCallback({ envelope, path, jobId, correlationId, requestKey });
    return;
  }

  // last-node / slow: the caller waits for the whole workflow.
  const callerGone = new Promise((resolve) => {
    res.on("close", () => {
      if (!res.writableEnded) resolve("gone");
    });
  });
  const hitsCloudTimeout = cloudTimeoutMs !== undefined && delayMs > cloudTimeoutMs;
  const waitMs = hitsCloudTimeout ? cloudTimeoutMs : delayMs;
  const outcome = await Promise.race([sleep(waitMs).then(() => "ready"), callerGone]);

  if (outcome === "gone") {
    extra.push("caller closed the connection before the workflow finished (its timeout?)");
    return finish("no response");
  }
  if (hitsCloudTimeout) {
    extra.push(`cloud-timeout=${cloudTimeoutMs}ms (the workflow keeps running for another ${delayMs - cloudTimeoutMs} ms)`);
    send(res, 524, "A timeout occurred: the workflow did not respond in time (n8n Cloud limit).", "text/plain; charset=utf-8");
    return finish(524);
  }
  send(res, 200, { ok: true, jobId, workflow: path, finishedAt: new Date().toISOString() });
  finish(200);
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url ?? "/", "http://mock.local");
    const { body, size } = await readBody(req);

    if (url.pathname === "/healthz") {
      send(res, 200, { status: "ok" });
      return;
    }

    const match = /^\/(webhook|webhook-test)\/(.+)$/.exec(url.pathname);
    if (!match) {
      send(res, 404, { code: 404, message: "Not found" });
      log(`${req.method} ${url.pathname} -> 404 (not a webhook path)`);
      return;
    }

    await handleWebhook(req, res, match[1], match[2], body, size, started);
  } catch (error) {
    log(`internal error: ${error.message}`);
    send(res, 500, { code: 500, message: "Mock error" });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    fail(`port ${port} is busy. Is another mock (or a real n8n) running? Use --port.`);
  }
  fail(error.message);
});

server.listen(port, args.host, () => {
  const { port: actualPort } = server.address();
  const base = `http://${args.host}:${actualPort}`;
  const timeout = cloudTimeoutMs === undefined ? "off" : `${cloudTimeoutMs} ms -> 524`;
  log(`listening on ${base}  mode=${mode}  delay=${delayMs} ms  cloud-timeout=${timeout}`);
  log(`production URLs: POST ${base}/webhook/<path>`);
  log(
    args.listen
      ? `test URLs: POST ${base}/webhook-test/<path> until ${new Date(testUrlsUntil).toISOString()} (120 s)`
      : "test URLs: not registered (start with --listen to open them for 120 s)",
  );
  log(token ? "header auth: x-n8n-token required (N8N_WEBHOOK_TOKEN is set)" : "header auth: none (N8N_WEBHOOK_TOKEN is not set)");
  log(
    callbackSecret
      ? `callbacks: signed, sent to ${callbackUrlFlag ?? "the request's callbackUrl"} after ${delayMs} ms (async modes)`
      : "callbacks: off (N8N_CALLBACK_SECRET is not set)",
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`stopping (${signal})`);
    server.close();
    process.exit(0);
  });
}
