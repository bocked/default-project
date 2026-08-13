import { prisma } from "./prisma.js";

export interface ActivityEntry {
  userId: string;
  action:
    | "REGISTER"
    | "LOGIN"
    | "QUOTE_CREATE"
    | "QUOTE_LIKE"
    | "QUOTE_COMMENT"
    | "PROFILE_UPDATE"
    | "FEEDBACK";
  detail?: string;
  targetId?: string;
}

/**
 * Records a per-user activity event (Activity Tracker). Failures are
 * non-fatal: a tracking hiccup must not break the main flow.
 */
export async function recordActivity(entry: ActivityEntry): Promise<void> {
  try {
    await prisma.userActivity.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        detail: entry.detail ?? null,
        targetId: entry.targetId ?? null,
      },
    });
  } catch {
    /* activity tracking is best-effort */
  }
}
