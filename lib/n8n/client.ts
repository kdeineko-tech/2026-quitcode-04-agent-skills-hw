import "server-only";

// Single module allowed to call the client's n8n webhooks (see
// .claude/skills/integrating-n8n-webhooks/references/contract.md).

export type WebhookEvent = "lead-created" | "quote-request";

type CallWebhookOptions = {
  idempotencyKey: string;
  correlationId: string;
  callbackUrl?: string;
};

type CallWebhookResult = { ok: boolean; status: number };

const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 3_000];

function isRetryableStatus(status: number) {
  return status >= 500 || status === 524;
}

async function postOnce(event: WebhookEvent, body: string, options: CallWebhookOptions) {
  return fetch(`${process.env.N8N_WEBHOOK_BASE_URL}/${event}`, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "x-n8n-token": process.env.N8N_WEBHOOK_TOKEN ?? "",
      "idempotency-key": options.idempotencyKey,
      "x-correlation-id": options.correlationId,
    },
    body,
  });
}

export async function callWebhook<T>(
  event: WebhookEvent,
  data: T,
  options: CallWebhookOptions,
): Promise<CallWebhookResult> {
  const body = JSON.stringify({
    version: 1,
    event,
    data,
    ...(options.callbackUrl ? { callbackUrl: options.callbackUrl } : {}),
  });

  let lastStatus = 0;
  const attempts = RETRY_DELAYS_MS.length + 1;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await postOnce(event, body, options);
      lastStatus = response.status;
      if (response.ok || !isRetryableStatus(response.status)) {
        return { ok: response.ok, status: response.status };
      }
    } catch (error) {
      if (attempt === attempts - 1) throw error;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }

  return { ok: false, status: lastStatus };
}
