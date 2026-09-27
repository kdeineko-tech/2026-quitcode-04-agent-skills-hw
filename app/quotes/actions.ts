"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { callWebhook } from "@/lib/n8n/client";
import { parseQuoteForm, type QuoteFormField } from "@/lib/quote-form";

export type SubmitQuoteRequestState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<QuoteFormField, string>> };

export async function submitQuoteRequest(
  _prevState: SubmitQuoteRequestState,
  formData: FormData,
): Promise<SubmitQuoteRequestState> {
  const parsed = parseQuoteForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors };
  }

  const idempotencyKey = randomUUID();
  const correlationId = randomUUID();

  const quote = await db.insertQuoteRequest({
    ...parsed.data,
    idempotencyKey,
    correlationId,
  });

  after(async () => {
    try {
      const { ok } = await callWebhook(
        "quote-request",
        {
          quoteId: quote.id,
          company: quote.company,
          email: quote.email,
          taskDescription: quote.taskDescription,
          budget: quote.budget,
        },
        {
          idempotencyKey,
          correlationId,
          callbackUrl: `${process.env.APP_BASE_URL}/api/n8n/quote-request`,
        },
      );
      if (!ok) await db.markQuoteRequestFailed(quote.id, "n8n_rejected");
    } catch (error) {
      console.error(`Failed to start quote-request workflow for ${quote.id}`, error);
      await db.markQuoteRequestFailed(quote.id, "n8n_unreachable");
    }
  });

  after(() => logAudit("quote.created", quote.id));
  redirect(`/quotes/${quote.id}`);
}
