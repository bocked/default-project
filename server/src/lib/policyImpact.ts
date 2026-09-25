import { prisma } from "./prisma.js";
import { bus } from "./bus.js";
import { recordAudit } from "./audit.js";
import { addLog } from "./logstore.js";
import type { PolicyType } from "@prisma/client";
import { openDraft, publicPolicy, nextFreeVersion, POLICY_LABELS } from "./policies.js";
import { sendPolicyReviewMessage } from "./telegram.js";

/** Site settings whose change is important enough to start a policy review. */
export const IMPORTANT_SETTING_KEYS = [
  "site.name",
  "site.description",
  "contact.email",
  "contact.phone",
  "social.telegram",
  "social.instagram",
  "social.facebook",
];

export interface PolicyImpactInput {
  trigger: "feature" | "setting" | "manual";
  type?: PolicyType;
  reason: string;
  actor?: { id: string | null; email: string | null } | null;
}

export interface PolicyImpactResult {
  draft: { id: string; type: string; version: string; changeSummary: string | null } | null;
  created: boolean;
}

/**
 * Policy impact review: whenever a user/data/feature change happens this
 * analyses the current SitePolicy/SiteSetting state, prepares an open Draft
 * Policy for the SUPER_ADMIN and pushes [Tasdiqlash] / [Taklif kiritish bilan
 * tasdiqlash] / [Rad etish + sabab] to Telegram plus an admin-panel socket
 * broadcast. Never throws.
 */
export async function runPolicyImpactReview(input: PolicyImpactInput): Promise<PolicyImpactResult> {
  try {
    const type: PolicyType = input.type ?? "TERMS";
    const reason = String(input.reason ?? "").trim().slice(0, 300);
    if (!reason) return { draft: null, created: false };

    // Merge into an existing open draft of the same type; otherwise seed a new
    // draft from the last published content so the admin edits a real starting
    // point.
    const existing = await openDraft(type);
    let draft;
    let created = false;
    if (existing) {
      draft = await prisma.sitePolicy.update({
        where: { id: existing.id },
        data: {
          changeSummary: existing.changeSummary
            ? `${existing.changeSummary} | ${reason}`.slice(0, 300)
            : reason,
        },
      });
    } else {
      const base = await publicPolicy(type);
      const version = await nextFreeVersion(type);
      draft = await prisma.sitePolicy.create({
        data: {
          type,
          version,
          content: base.content,
          changeSummary: reason,
          isApproved: false,
        },
      });
      created = true;
    }

    await recordAudit({
      adminId: input.actor?.id ?? null,
      adminEmail: input.actor?.email ?? null,
      action: "policy.review",
      targetType: "policy",
      targetId: draft.id,
      detail: `${draft.type} v${draft.version} ko'rib chiqishga tayyorlandi: ${reason}`,
      ip: null,
    });
    addLog("info", `${POLICY_LABELS[draft.type]} v${draft.version} — ko'rib chiqish kutilmoqda`);

    // PUSH to the SUPER_ADMIN: admin-panel socket banner + Telegram buttons.
    void bus.publish("admin:policy:review", {
      id: draft.id,
      type: draft.type,
      version: draft.version,
      changeSummary: draft.changeSummary,
    });
    const telegramMessageId = await sendPolicyReviewMessage(
      {
        type: draft.type,
        label: POLICY_LABELS[draft.type],
        version: draft.version,
        changeSummary: draft.changeSummary,
      },
      draft.id
    );
    if (telegramMessageId) {
      await prisma.sitePolicy
        .update({ where: { id: draft.id }, data: { telegramMessageId } })
        .catch(() => undefined);
    }

    return {
      draft: { id: draft.id, type: draft.type, version: draft.version, changeSummary: draft.changeSummary },
      created,
    };
  } catch {
    return { draft: null, created: false };
  }
}