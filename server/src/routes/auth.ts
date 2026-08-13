import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  signAuthToken,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
  emailVerificationExpiry,
  generatePasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiry,
  generateTelegramVerifyToken,
  hashTelegramVerifyToken,
  hashTelegramVerifyCode,
  telegramVerifyExpiry,
  generateQuickLoginSessionId,
  hashQuickLoginSessionId,
  quickLoginSessionExpiry,
} from "../lib/tokens.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email.js";
import { getBotUsername, sendAdminNotification } from "../lib/telegram.js";
import { recordActivity } from "../lib/activity.js";
import {
  validateBody,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  telegramVerifySchema,
  telegramQuickSessionSchema,
  upgradeAccountSchema,
  type Register,
  type Login,
  type VerifyEmail,
  type ResendVerification,
  type ForgotPassword,
  type ResetPassword,
  type UpdateProfile,
  type TelegramVerify,
  type TelegramQuickSession,
  type UpgradeAccount,
} from "../schemas.js";

export const authRouter = Router();

interface SafeUser {
  id: string;
  email: string | null;
  name: string | null;
  nickname: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  quickLogin: boolean;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLastName: string | null;
  createdAt: Date;
}

function toUser(user: SafeUser): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    nickname: user.nickname,
    role: user.role,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    quickLogin: user.quickLogin,
    telegramUsername: user.telegramUsername,
    telegramFirstName: user.telegramFirstName,
    telegramLastName: user.telegramLastName,
    createdAt: user.createdAt,
  };
}

/** Issues a fresh verification token, persists its digest, emails the link. */
async function issueVerification(email: string): Promise<void> {
  const token = generateEmailVerificationToken();
  await prisma.user.update({
    where: { email },
    data: {
      emailVerificationToken: hashEmailVerificationToken(token),
      emailVerificationExpiresAt: emailVerificationExpiry(),
    },
  });
  await sendVerificationEmail(email, token);
}

// POST /api/auth/register
authRouter.post("/register", validateBody(registerSchema), async (_req, res) => {
  const body = res.locals.body as Register;
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
    return;
  }
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash: await hashPassword(body.password),
      name: body.name ?? null,
      nickname: body.nickname ?? null,
      role: config.adminEmails.includes(body.email.toLowerCase()) ? "ADMIN" : "USER",
    },
  });
  await issueVerification(user.email!);
  // Best-effort: keep the admin informed about new registrations.
  const handle = [user.nickname, user.name].filter(Boolean).join(" / ") || user.email!;
  void sendAdminNotification(`🆕 Yangi foydalanuvchi ro'yxatdan o'tdi\n\n${user.email}${handle !== user.email ? `\n${handle}` : ""}`);
  void recordActivity({ userId: user.id, action: "REGISTER", detail: user.email! });
  res.status(201).json({ token: signAuthToken(user.id), user: toUser(user) });
});

// POST /api/auth/login
authRouter.post("/login", validateBody(loginSchema), async (_req, res) => {
  const body = res.locals.body as Login;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !user.passwordHash || !(await verifyPassword(body.password, user.passwordHash))) {
    res.status(401).json({ error: "Email yoki parol noto'g'ri" });
    return;
  }
  if (user.blocked) {
    res.status(403).json({ error: "Hisob bloklangan", code: "ACCOUNT_BLOCKED" });
    return;
  }
  // Promote admin emails lazily so the account gets ADMIN even if it was
  // created before the email was listed (or by the register endpoint itself).
  const promote =
    user.role !== "ADMIN" && user.email !== null && config.adminEmails.includes(user.email.toLowerCase());
  const current = promote
    ? await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } })
    : user;
  void recordActivity({ userId: current.id, action: "LOGIN", detail: current.email ?? current.telegramUsername ?? "telegram" });
  res.json({ token: signAuthToken(user.id), user: toUser(current) });
});

// POST /api/auth/verify-email
authRouter.post("/verify-email", validateBody(verifyEmailSchema), async (_req, res) => {
  const body = res.locals.body as VerifyEmail;
  const digest = hashEmailVerificationToken(body.token);
  const user = await prisma.user.findFirst({ where: { emailVerificationToken: digest } });
  if (!user || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
    res.status(400).json({ error: "Tasdiqlash tokeni yaroqsiz yoki muddati o'tgan" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpiresAt: null },
  });
  res.json({ ok: true });
});

// POST /api/auth/resend-verification
authRouter.post("/resend-verification", validateBody(resendVerificationSchema), async (_req, res) => {
  const body = res.locals.body as ResendVerification;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (user && !user.emailVerified && user.email) {
    await issueVerification(user.email);
  }
  res.json({ ok: true });
});

// POST /api/auth/forgot-password - email a time-limited reset link. Always
// answers ok so the endpoint cannot be used to enumerate registered emails.
authRouter.post("/forgot-password", validateBody(forgotPasswordSchema), async (_req, res) => {
  const body = res.locals.body as ForgotPassword;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (user && user.email) {
    const token = generatePasswordResetToken();
    await prisma.user.update({
      where: { email: user.email },
      data: {
        resetPasswordToken: hashPasswordResetToken(token),
        resetPasswordExpiresAt: passwordResetExpiry(),
      },
    });
    await sendPasswordResetEmail(user.email, token);
  }
  res.json({ ok: true });
});

// POST /api/auth/reset-password - redeem the reset token and set a new password.
authRouter.post("/reset-password", validateBody(resetPasswordSchema), async (_req, res) => {
  const body = res.locals.body as ResetPassword;
  const digest = hashPasswordResetToken(body.token);
  const user = await prisma.user.findFirst({ where: { resetPasswordToken: digest } });
  if (!user || !user.resetPasswordExpiresAt || user.resetPasswordExpiresAt < new Date()) {
    res.status(400).json({ error: "Tiklash havolasi yaroqsiz yoki muddati o'tgan" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(body.password),
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
    },
  });
  res.json({ ok: true });
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: toUser(req.user!) });
});

// PATCH /api/auth/me - update real name / nickname
authRouter.patch("/me", requireAuth, validateBody(updateProfileSchema), async (req, res) => {
  const body = res.locals.body as UpdateProfile;
  const data: { name?: string | null; nickname?: string | null } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.nickname !== undefined) data.nickname = body.nickname;
  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  res.json({ user: toUser(user) });
});

// POST /api/auth/telegram/session - start phone verification via Telegram.
authRouter.post("/telegram/session", requireAuth, async (req, res) => {
  if (req.user!.phoneVerified) {
    res.status(400).json({ error: "Profil allaqachon faollashtirilgan" });
    return;
  }
  const botUsername = await getBotUsername();
  if (!botUsername) {
    res.status(500).json({ error: "Telegram bot sozlanmagan" });
    return;
  }
  const token = generateTelegramVerifyToken();
  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      telegramVerifyToken: hashTelegramVerifyToken(token),
      telegramVerifyExpiresAt: telegramVerifyExpiry(),
      telegramVerifyChatId: null,
      telegramVerifyCode: null,
      telegramVerifyCodeExpiresAt: null,
    },
  });
  res.json({ botUsername, start: `verify_${token}`, expiresAt: telegramVerifyExpiry().toISOString() });
});

// POST /api/auth/telegram/verify - redeem the 6-digit code from Telegram.
authRouter.post("/telegram/verify", requireAuth, validateBody(telegramVerifySchema), async (req, res) => {
  const body = res.locals.body as TelegramVerify;
  const user = req.user!;
  if (!user.telegramVerifyCode || !user.telegramVerifyCodeExpiresAt || user.telegramVerifyCodeExpiresAt < new Date()) {
    res.status(400).json({ error: "Kod yaroqsiz yoki muddati o'tgan" });
    return;
  }
  if (user.telegramVerifyCode !== hashTelegramVerifyCode(body.code)) {
    res.status(400).json({ error: "Kod noto'g'ri" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      phoneVerified: true,
      telegramVerifyCode: null,
      telegramVerifyCodeExpiresAt: null,
      telegramVerifyToken: null,
      telegramVerifyExpiresAt: null,
      telegramVerifyChatId: null,
    },
  });
  res.json({ ok: true, user: toUser(updated) });
});

// ---------------------------------------------------------------------------
// Telegram one-tap login ("tezkor kirish"): like-only until full registration.
// ---------------------------------------------------------------------------

// POST /api/auth/telegram/quick/session - start a quick-login session.
authRouter.post("/telegram/quick/session", async (_req, res) => {
  try {
    const botUsername = await getBotUsername();
    if (!botUsername) {
      res.status(500).json({ error: "Telegram bot sozlanmagan" });
      return;
    }
    const sessionId = generateQuickLoginSessionId();
    await prisma.telegramQuickSession.create({
      data: {
        tokenHash: hashQuickLoginSessionId(sessionId),
        expiresAt: quickLoginSessionExpiry(),
      },
    });
    res.json({
      botUsername,
      sessionId,
      start: `quick_${sessionId}`,
      expiresAt: quickLoginSessionExpiry().toISOString(),
    });
  } catch {
    res.status(500).json({ error: "Sessiya yaratilmadi" });
  }
});

// POST /api/auth/telegram/quick/status - poll the session until the bot
// confirms the /start quick_<id>. Always answers 200 so the client can poll.
authRouter.post("/telegram/quick/status", validateBody(telegramQuickSessionSchema), async (_req, res) => {
  const body = res.locals.body as TelegramQuickSession;
  const session = await prisma.telegramQuickSession.findUnique({
    where: { tokenHash: hashQuickLoginSessionId(body.sessionId) },
  });
  if (!session) {
    res.json({ status: "EXPIRED" });
    return;
  }
  if (session.expiresAt < new Date() || session.status === "EXPIRED") {
    if (session.status !== "EXPIRED") {
      await prisma.telegramQuickSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } });
    }
    res.json({ status: "EXPIRED" });
    return;
  }
  if (session.status === "PENDING") {
    res.json({ status: "PENDING" });
    return;
  }
  if (session.status === "ERROR") {
    res.json({ status: "ERROR", error: session.error ?? "Kirish tasdiqlanmadi" });
    return;
  }
  if (session.status === "COMPLETE" && session.userId) {
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.blocked) {
      res.json({ status: "ERROR", error: "Hisob bloklangan" });
      return;
    }
    // One token per completion: consume the session so it cannot be re-polled.
    await prisma.telegramQuickSession.delete({ where: { id: session.id } });
    void recordActivity({ userId: user.id, action: "LOGIN", detail: user.email ?? user.telegramUsername ?? "telegram" });
    res.json({ status: "COMPLETE", token: signAuthToken(user.id), user: toUser(user) });
    return;
  }
  res.json({ status: "PENDING" });
});

// POST /api/auth/upgrade - complete a Telegram quick-login account into a full
// registration (sets email + password). After email verification the account
// can submit quotes like any other user.
authRouter.post("/upgrade", requireAuth, validateBody(upgradeAccountSchema), async (_req, res) => {
  const body = res.locals.body as UpgradeAccount;
  const user = _req.user!;
  if (!user.quickLogin) {
    res.status(400).json({ error: "Bu hisob allaqachon to'liq ro'yxatdan o'tgan" });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing && existing.id !== user.id) {
    res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: body.email,
      passwordHash: await hashPassword(body.password),
      quickLogin: false,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.nickname !== undefined ? { nickname: body.nickname } : {}),
      role: config.adminEmails.includes(body.email.toLowerCase()) ? "ADMIN" : user.role,
    },
  });
  await issueVerification(updated.email!);
  void recordActivity({ userId: updated.id, action: "REGISTER", detail: updated.email ?? "" });
  res.json({ token: signAuthToken(updated.id), user: toUser(updated) });
});
