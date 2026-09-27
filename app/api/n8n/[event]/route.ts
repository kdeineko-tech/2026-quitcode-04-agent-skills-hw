import { createHmac, timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";

// Callback contract: .claude/skills/integrating-n8n-webhooks/references/callback-processing.md
// Maps the public path segment to the `event` value n8n's callback body must carry.
const EXPECTED_BODY_EVENT: Record<string, string> = {
  "quote-request": "quote-request.completed",
};

const MAX_BODY_BYTES = 64 * 1024;
const TIMESTAMP_WINDOW_SECONDS = 300;

export async function POST(request: Request, { params }: RouteContext<"/api/n8n/[event]">) {
  const { event } = await params;
  const expectedBodyEvent = EXPECTED_BODY_EVENT[event];
  if (!expectedBodyEvent) {
    return Response.json({ error: "unknown event" }, { status: 404 });
  }
  if (request.headers.get("content-type") !== "application/json") {
    return Response.json({ error: "unsupported media type" }, { status: 415 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ error: "payload too large" }, { status: 413 });
  }

  const timestampHeader = request.headers.get("x-n8n-timestamp") ?? "";
  const timestamp = Number(timestampHeader);
  const nowSeconds = Date.now() / 1000;
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > TIMESTAMP_WINDOW_SECONDS) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // Bytes of the provided vs. expected signature header. Compared for equal length before
  // timingSafeEqual, which throws on a length mismatch instead of reporting one.
  const providedBytes = Buffer.from(request.headers.get("x-n8n-signature") ?? "", "utf8");
  const computedDigest = createHmac("sha256", process.env.N8N_CALLBACK_SECRET ?? "")
    .update(`${timestampHeader}.${raw}`)
    .digest("hex");
  const expectedBytes = Buffer.from(`sha256=${computedDigest}`, "utf8");
  const sameLength = providedBytes.length === expectedBytes.length;
  if (!sameLength || !timingSafeEqual(providedBytes, expectedBytes)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const idempotencyHeader = request.headers.get("idempotency-key") ?? "";
  const claimed = await db.claimCallbackKey(idempotencyHeader);
  if (!claimed) {
    return Response.json({ duplicate: true }, { status: 200 });
  }

  const parsed = parseCallbackBody(raw);
  const bodyMatchesPath =
    parsed !== null &&
    parsed.event === expectedBodyEvent &&
    idempotencyHeader === `${parsed.data.jobId}:${parsed.event}`;

  if (!bodyMatchesPath) {
    await db.releaseCallbackKey(idempotencyHeader);
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const quote = await db.getQuoteRequestByIdempotencyKey(parsed.data.requestIdempotencyKey);
  if (!quote) {
    await db.releaseCallbackKey(idempotencyHeader);
    return Response.json({ error: "unknown request" }, { status: 400 });
  }

  if (parsed.data.status === "completed" && !isHttpUrl(parsed.data.result?.documentUrl)) {
    await db.releaseCallbackKey(idempotencyHeader);
    return Response.json({ error: "invalid body" }, { status: 400 });
  }

  const saved =
    parsed.data.status === "completed"
      ? await db.markQuoteRequestReady(quote.id, parsed.data.result!.documentUrl!)
      : await db.markQuoteRequestFailed(quote.id, parsed.data.error?.code ?? "workflow_failed");

  if (!saved) {
    await db.releaseCallbackKey(idempotencyHeader);
    return Response.json({ error: "storage error" }, { status: 500 });
  }

  after(() => logAudit(`quote.${parsed.data.status}`, quote.id));

  return Response.json({ ok: true }, { status: 202 });
}

type CallbackBody = {
  event: string;
  data: {
    jobId: string;
    status: "completed" | "failed";
    requestIdempotencyKey: string;
    result?: { documentUrl?: string };
    error?: { code?: string };
  };
};

// Accepts http/https strings only -- rejects javascript:, data:, etc., and rejects
// non-string values outright (parseCallbackBody's `as CallbackBody["data"]` cast means
// TypeScript's `string | undefined` here isn't actually verified at runtime -- e.g. an
// array like ["https://x"] would otherwise sail through `new URL()` via implicit
// coercion) before the value is ever passed to markQuoteRequestReady and, from there,
// into an <a href>.
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseCallbackBody(raw: string): CallbackBody | null {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  if (typeof body.event !== "string") return null;

  const data = body.data;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.jobId !== "string" || typeof d.requestIdempotencyKey !== "string") return null;
  if (d.status !== "completed" && d.status !== "failed") return null;

  return { event: body.event, data: d as CallbackBody["data"] };
}
