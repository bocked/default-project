import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireSuperAdmin } from "../middleware/adminAuth.js";
import { clientIp } from "../lib/ip.js";
import { recordAudit } from "../lib/audit.js";
import { issueEmailVerification, createEmailVerificationCode } from "../lib/verifyEmail.js";
import {
  buildVerificationEmail,
  buildPasswordResetEmail,
  sendTestEmail,
  emailMode,
} from "../lib/email.js";
import {
  validateBody,
  emailTestSchema,
  emailLogQuerySchema,
  type EmailTest,
} from "../schemas.js";

/**
 * Super Admin email management dashboard backend. Mounted under the admin
 * router at /api/admin/emails and gated by requireSuperAdmin (an ADMIN role
 * alone gets 403). Provides Resend transport health, delivery log browsing,
 * template previews, a live Resend test and active-OTP monitor (masked,
 * revoke/resend).
 */
export const adminEmailsRouter = Router();
adminEmailsRouter.use(requireSuperAdmin);

// GET /api/admin/emails/health - transport configuration status for the
// dashboard cards. Never reveals credentials, only whether the transport is on.
adminEmailsRouter.get("/health", (_req, res) => {
  const mode = emailMode();
  res.json({
    mode,
    configured: mode !== "offline",
    provider: mode === "offline" ? null : mode,
    from: config.sendFrom,
    sender: config.sendFrom,
    appUrl: config.appUrl,
    testMode: process.env.NODE_ENV === "test",
    sandbox: config.resendSandbox,
    sandboxTo: config.resendSandboxTo,
  });
});

// GET /api/admin/emails/logs?page&limit&type&status - delivery history.
adminEmailsRouter.get("/logs", async (req, res) => {
  const parsed = emailLogQuerySchema.safeParse(req.query);
  const page = parsed.success ? parsed.data.page : 1;
  const limit = parsed.success ? parsed.data.limit : 50;
  const where = parsed.success ? { type: parsed.data.type, status: parsed.data.status } : {};
  const [total, logs] = await Promise.all([
    prisma.emailLog.count({ where }),
    prisma.emailLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        type: true,
        to: true,
        subject: true,
        status: true,
        messageId: true,
        error: true,
        createdAt: true,
      },
    }),
  ]);
  res.json({ logs, total, page, limit });
});

// GET /api/admin/emails/templates - rendered HTML/text previews of the two
// styled transactional templates (sample data substituted).
adminEmailsRouter.get("/templates", (_req, res) => {
  const sampleCode = "482719";
  const sampleToken = "a".repeat(64);
  const verification = buildVerificationEmail(sampleToken, sampleCode);
  const passwordReset = buildPasswordResetEmail(sampleToken);
  res.json({
    templates: [
      { id: "verification", label: "Registration OTP", ...verification },
      { id: "password-reset", label: "Parolni tiklash", ...passwordReset },
    ],
  });
});

// POST /api/admin/emails/test - deliver a live SMTP test message (defaults to
// the acting admin's own inbox). Result includes the provider messageId.
adminEmailsRouter.post("/test", validateBody(emailTestSchema), async (req, res) => {
  const body = res.locals.body as EmailTest;
  const to = body.to ?? req.admin?.email ?? "";
  if (!to) {
    res.status(400).json({ error: "Qabul qiluvchi email ko'rsatilmadi" });
    return;
  }
  const result = await sendTestEmail(to);
  void recordAudit({
    adminId: req.admin?.id ?? null,
    adminEmail: req.admin?.email ?? null,
    action: "email.test",
    targetType: "email",
    detail: to,
    ip: clientIp(req.headers),
  });
  res.json({ ok: result.ok, to, messageId: result.messageId ?? null, error: result.error ?? null });
});

// GET /api/admin/emails/otp - monitor currently active email-verification OTPs.
// Codes are stored as SHA-256 digests only, so the list exposes a masked value
// (the intent is presence + expiry, not the code itself).
adminEmailsRouter.get("/otp", async (_req, res) => {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: {
      emailVerifyCodeHash: { not: null },
      emailVerifyCodeExpiresAt: { gt: now },
    },
    select: {
      id: true,
      email: true,
      emailVerifyCodeExpiresAt: true,
      updatedAt: true,
      emailVerified: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  res.json({
    otps: users.map((u) => ({
      userId: u.id,
      email: u.email ?? "(telegram)",
      masked: "••••••",
      issuedAt: u.updatedAt.toISOString(),
      expiresAt: (u.emailVerifyCodeExpiresAt as Date).toISOString(),
    })),
  });
});

// POST /api/admin/emails/otp/:userId/revoke - invalidate an active OTP (and
// the emailed link) so the pending code can no longer be redeemed.
adminEmailsRouter.post("/otp/:userId/revoke", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerifyCodeHash: null,
      emailVerifyCodeExpiresAt: null,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    },
  });
  void recordAudit({
    adminId: req.admin?.id ?? null,
    adminEmail: req.admin?.email ?? null,
    action: "email.otp.revoke",
    targetType: "user",
    targetId: user.id,
    detail: user.email ?? "(telegram)",
    ip: clientIp(req.headers),
  });
  res.json({ ok: true, email: user.email });
});

// POST /api/admin/emails/otp/:userId/resend - issue a new verification token +
// OTP for an unverified user (used when the original mail was lost).
adminEmailsRouter.post("/otp/:userId/resend", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  if (!user.email) {
    res.status(400).json({ error: "Bu hisobda email manzili yo'q" });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ error: "Email allaqachon tasdiqlangan" });
    return;
  }
  await issueEmailVerification(user.email);
  void recordAudit({
    adminId: req.admin?.id ?? null,
    adminEmail: req.admin?.email ?? null,
    action: "email.otp.resend",
    targetType: "user",
    targetId: user.id,
    detail: user.email,
    ip: clientIp(req.headers),
  });
  res.json({ ok: true, email: user.email });
});

// POST /api/admin/emails/otp/:userId/code - issue a fresh verification OTP and
// return the PLAINTEXT code to the Super Admin. Used when a mail was lost or the
// Resend sandbox cannot reach the user: the admin reads the code aloud or
// forwards it over Telegram. Protected by requireSuperAdmin.
adminEmailsRouter.post("/otp/:userId/code", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
  if (!user) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  if (!user.email) {
    res.status(400).json({ error: "Bu hisobda email manzili yo'q" });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ error: "Email allaqachon tasdiqlangan" });
    return;
  }
  const { code } = await createEmailVerificationCode(user.email);
  void recordAudit({
    adminId: req.admin?.id ?? null,
    adminEmail: req.admin?.email ?? null,
    action: "email.otp.reveal",
    targetType: "user",
    targetId: user.id,
    detail: user.email,
    ip: clientIp(req.headers),
  });
  res.json({ ok: true, code, email: user.email });
});