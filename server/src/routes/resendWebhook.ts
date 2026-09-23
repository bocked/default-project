import crypto from "node:crypto";
import { Router } from "express";
import express from "express";
import { EmailStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { sendAdminNotification } from "../lib/telegram.js";

/**
 * Resend delivery webhook (Svix envelope). Resend signs every delivery event
 * with the endpoint signing secret (whsec_...) using the Svix HTTP signature
 * scheme; verifying it here lets only Resend itself advance an EmailLog row
 * from SENT -> DELIVERED / BOUNCED. Mounted at /api/webhooks/resend BEFORE the
 * global express.json() parser so this router can read the raw body that the
 * signature covers.
 */

// Success events hidden from the operator get the log status silently; bounce /
// complaint events additionally ping the admin Telegram chat.
const EVENT_STATUS: Record<string, EmailStatus> = {
  "email.sent": EmailStatus.SENT,
  "email.delivered": EmailStatus.DELIVERED,
  "email.bounced": EmailStatus.BOUNCED,
  "email.complained": EmailStatus.BOUNCED,
};

const BOUNCE_DETAIL: Record<string, string> = {
  "email.bounced": "Bounce — provider qaytardi",
  "email.complained": "Complaint — spam deb belgilandi",
};

const TOLERANCE_SECONDS = 5 * 60;

function secureCompare(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Verifies a Svix/Resend webhook message: signature header + replay window.
 *  The secret is the base64 `whsec_...` value from the Resend dashboard. */
function verifySvixSignature(
  headers: Record<string, unknown>,
  rawBody: string,
): boolean {
  const id = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signature = headers["svix-signature"];
  if (typeof id !== "string" || typeof timestamp !== "string" || typeof signature !== "string") {
    return false;
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  // Only replay-guard the past (mirrors the svix library); a marginally future
  // clock skew on a producer is tolerated.
  if (Date.now() / 1000 - ts > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(config.resendWebhookSecret.replace(/^whsec_/, ""), "base64");
  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", key).update(signed, "utf8").digest("base64");
  // Svix signature header may carry several `v1,<sig>` parts, space-separated.
  const parts = signature
    .split(" ")
    .filter((p) => p.startsWith("v1,"))
    .map((p) => p.slice(3));
  return parts.some((part) => secureCompare(part, expected));
}

export const resendWebhookRouter = Router();

// Raw body capture (Buffer) — the HMAC covers the exact bytes received.
resendWebhookRouter.use(express.raw({ type: () => true }));

resendWebhookRouter.post("/resend", (req, res) => {
  void (async () => {
    if (!config.resendWebhookSecret) {
      logger.warn("resend webhook: RESEND_WEBHOOK_SECRET not configured, rejecting");
      res.status(500).json({ error: "webhook signing secret not configured" });
      return;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body ?? "");
    if (!verifySvixSignature(req.headers as Record<string, unknown>, raw)) {
      logger.warn("resend webhook: signature verification failed");
      res.status(401).json({ error: "invalid signature" });
      return;
    }
    let payload: { type?: string; data?: { email_id?: string } };
    try {
      payload = JSON.parse(raw) as { type?: string; data?: { email_id?: string } };
    } catch (err) {
      logger.warn({ err }, "resend webhook: invalid JSON body");
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const messageId = payload?.data?.email_id;
    if (!messageId) {
      // Not an error for Resend (test events etc.) — acknowledge and move on.
      logger.debug({ type: payload?.type }, "resend webhook: event without email_id");
      res.json({ ok: true });
      return;
    }
    const eventType = payload.type ?? "";
    const status = EVENT_STATUS[eventType];
    const existing = await prisma.emailLog.findFirst({
      where: { messageId },
      select: { id: true, to: true, status: true },
    });
    if (!existing) {
      logger.info({ messageId, eventType }, "resend webhook: unknown messageId");
      res.json({ ok: true });
      return;
    }
    if (!status) {
      // Unmapped event (e.g. email.delivery_delayed) — keep the current status.
      res.json({ ok: true });
      return;
    }
    const detail = BOUNCE_DETAIL[eventType] ?? eventType;
    await prisma.emailLog.update({
      where: { id: existing.id },
      data: { status, error: status === EmailStatus.BOUNCED ? detail : null },
    });
    logger.info({ messageId, eventType, to: existing.to }, "resend webhook: email status updated");
    if (status === EmailStatus.BOUNCED) {
      void sendAdminNotification(`⚠️ Email qaytdi (${BOUNCE_DETAIL[eventType] ?? eventType})\nKimga: ${existing.to}\nMessageId: ${messageId}`).catch((err) => {
        logger.warn({ err }, "telegram bounce notification failed");
      });
    }
    res.json({ ok: true });
  })().catch((err: unknown) => {
    logger.error({ err }, "resend webhook failed");
    res.status(500).json({ error: "webhook failed" });
  });
});