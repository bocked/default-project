import { prisma } from "./prisma.js";
import { addLog } from "./logstore.js";

export interface AuditEntry {
  adminId?: string | null;
  adminEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  detail?: string | null;
  ip?: string | null;
}

/**
 * Persists an important admin action to the AuditLog table and mirrors it to
 * the in-memory log store so connected admin sockets see it live.
 * Failures are non-fatal: moderation must not break because auditing failed.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const message = entry.detail
    ? `${entry.action}: ${entry.detail}`
    : entry.action;
  addLog("info", message);
  try {
    await prisma.adminLog.create({
      data: {
        adminId: entry.adminId ?? null,
        adminEmail: entry.adminEmail ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        detail: entry.detail ?? null,
        ip: entry.ip ?? null,
      },
    });
  } catch {
    /* auditing is best-effort */
  }
}
