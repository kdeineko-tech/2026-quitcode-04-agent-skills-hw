import { db } from "./db";

export async function logAudit(action: string, entityId: string) {
  await db.insertAuditEntry({ action, entityId, at: new Date().toISOString() });
}
