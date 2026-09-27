"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { getCurrentUser, getLead, getWorkspace } from "@/lib/data";
import { parseLeadForm, type LeadFormField } from "@/lib/lead-form";
import { callWebhook } from "@/lib/n8n/client";
import type { LeadStatus } from "@/lib/types";

const PUBLIC_FORM_WORKSPACE_ID = "ws_studio_nova";
const LEAD_NOTE_MAX_LENGTH = 500;

export type SubmitLeadState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<LeadFormField, string>> }
  | { status: "ok" };

export async function submitLead(
  _prevState: SubmitLeadState,
  formData: FormData,
): Promise<SubmitLeadState> {
  const parsed = parseLeadForm(formData);
  if (!parsed.ok) {
    return { status: "invalid", errors: parsed.errors };
  }

  const requestHeaders = await headers();
  const ipAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1";
  const userAgent = requestHeaders.get("user-agent") ?? "";

  const lead = await db.insertLead({
    ...parsed.data,
    workspaceId: PUBLIC_FORM_WORKSPACE_ID,
    jobTitle: "",
    city: "",
    country: "",
    source: "website",
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    ipAddress,
    userAgent,
    rawPayload: {
      form: { id: "contact-main", version: "2026-07", fields: parsed.data },
      request: {
        ip: ipAddress,
        userAgent,
        acceptLanguage: requestHeaders.get("accept-language"),
        receivedAt: new Date().toISOString(),
      },
    },
  });

  after(async () => {
    try {
      await callWebhook(
        "lead-created",
        {
          leadId: lead.id,
          fullName: lead.fullName,
          email: lead.email,
          phone: lead.phone,
          company: lead.company,
          budget: lead.budget,
          message: lead.message,
          source: lead.source,
        },
        { idempotencyKey: randomUUID(), correlationId: randomUUID() },
      );
    } catch (error) {
      console.error(`Failed to send lead ${lead.id} to n8n`, error);
    }
  });

  await logAudit("lead.created", lead.id);

  return { status: "ok" };
}

export type AddLeadNoteState =
  | { status: "idle" }
  | { status: "invalid"; errors: { note?: string } }
  | { status: "ok" };

export async function addLeadNote(
  _prevState: AddLeadNoteState,
  formData: FormData,
): Promise<AddLeadNoteState> {
  const leadIdValue = formData.get("leadId");
  const leadId = typeof leadIdValue === "string" ? leadIdValue : "";
  const noteValue = formData.get("note");
  const note = typeof noteValue === "string" ? noteValue.trim() : "";

  if (!note) {
    return { status: "invalid", errors: { note: "Введіть текст нотатки" } };
  }
  if (note.length > LEAD_NOTE_MAX_LENGTH) {
    return { status: "invalid", errors: { note: `Максимум ${LEAD_NOTE_MAX_LENGTH} символів` } };
  }

  const user = await getCurrentUser();
  const [workspace, lead] = await Promise.all([
    getWorkspace({ slug: user.workspaceSlug }),
    getLead(leadId),
  ]);

  if (!lead || lead.workspaceId !== workspace.id) {
    return { status: "invalid", errors: { note: "Лід не знайдено" } };
  }

  const added = await db.appendLeadNote(leadId, note);
  if (!added) {
    return { status: "invalid", errors: { note: "Не вдалося зберегти нотатку" } };
  }

  after(() => logAudit("lead.note_added", leadId));

  revalidatePath(`/dashboard/leads/${leadId}`);
  return { status: "ok" };
}

export async function updateLeadStatus(id: string, status: LeadStatus) {
  await db.updateLeadStatus(id, status);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/leads/${id}`);
}

export async function deleteLead(id: string) {
  await db.deleteLead(id);
  revalidatePath("/dashboard");
}
