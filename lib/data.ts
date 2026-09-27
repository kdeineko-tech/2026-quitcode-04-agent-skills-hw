import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { SESSION_COOKIE } from "./session";

export const getCurrentUser = cache(async () => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) redirect("/login");

  const user = await db.getUserBySession(sessionId);
  if (!user) redirect("/login");

  return user;
});

export const getWorkspace = cache(async ({ slug }: { slug: string }) => {
  const workspace = await db.getWorkspace(slug);
  if (!workspace) throw new Error(`Workspace "${slug}" not found`);
  return workspace;
});

export async function getLeads(workspaceId: string) {
  return db.getLeads(workspaceId);
}

export async function getLeadStats(workspaceId: string) {
  return db.getLeadStats(workspaceId);
}

export async function getSourceBreakdown(workspaceId: string) {
  return db.getSourceBreakdown(workspaceId);
}

export async function getLead(id: string) {
  return db.getLead(id);
}

export async function getQuoteRequest(id: string) {
  return db.getQuoteRequest(id);
}
