import { Router } from "express";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  signAuthToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  refreshTokenMaxAgeMs,
  hashEmailVerificationToken,
  hashEmailVerifyCode,
  generatePasswordResetToken,
  hashPasswordResetToken,
  generatePasswordResetCode,
  hashPasswordResetCode,
  passwordResetExpiry,
  generateTelegramVerifyToken,
  hashTelegramVerifyToken,
  hashTelegramVerifyCode,
  telegramVerifyExpiry,
  generateQuickLoginSessionId,
  hashQuickLoginSessionId,
  quickLoginSessionExpiry,
} from "../lib/tokens.js";
import {
  sendPasswordResetEmail,
  withTimeout,
  EMAIL_SEND_TIMEOUT_MS,
  EmailSandboxError,
  resendSandboxRecipientAllowed,
} from "../lib/email.js";
import { issueEmailVerification } from "../lib/verifyEmail.js";
import { logger } from "../lib/logger.js";
import { authBruteLimiter } from "../lib/rateLimit.js";
import { getBotUsername, sendAdminNotification } from "../lib/telegram.js";
import { recordActivity } from "../lib/activity.js";
import { publishedPolicyVersion } from "../lib/policies.js";
import { PolicyType } from "@prisma/client";
import {
  validateBody,
  registerSchema,
  loginSchema,
  acceptTermsSchema,
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
  type AcceptTerms,
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

// ---------------------------------------------------------------------------
// HttpOnly refresh-token cookie helpers
// ---------------------------------------------------------------------------

const REFRESH_COOKIE = "refresh_token";

/** Cookies are sent on the browser, not page requests — profile this when
 *  moving to a same-origin deploy. Public pages never touch them. */
function refreshCookieOptions() {
  const secure = config.nodeEnv === "production";
  const sameSite = (secure ? "none" : "lax") as "none" | "lax";
  return { httpOnly: true, secure, sameSite, maxAge: refreshTokenMaxAgeMs(), path: "/" };
}

/** Same flags minus maxAge: express's clearCookie ignores maxAge and would
 *  log a deprecation warning about it. */
function refreshClearCookieOptions() {
  const secure = config.nodeEnv === "production";
  const sameSite = (secure ? "none" : "lax") as "none" | "lax";
  return { httpOnly: true, secure, sameSite, path: "/" };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key && value) out[key] = decodeURIComponent(value);
  }
  return out;
}

function cookieRefreshToken(req: import("express").Request): string | null {
  return parseCookies(req.headers.cookie)[REFRESH_COOKIE] ?? null;
}

/** Rotates and stores a fresh refresh digest on the user, then sets the
 *  HttpOnly cookie with the raw value. Call on login/register/upgrade. */
async function issueRefreshCookie(res: import("express").Response, userId: string): Promise<void> {
  const raw = generateRefreshToken();
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: hashRefreshToken(raw), refreshTokenExpiresAt: refreshTokenExpiry() },
  });
  res.cookie(REFRESH_COOKIE, raw, refreshCookieOptions());
}

function clearRefreshCookie(res: import("express").Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshClearCookieOptions());
}

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
  isPremium: boolean;
  premiumExpiresAt: Date | null;
  customWatermark: string | null;
  avatarUrl: string | null;
  isSuperApproved: boolean;
  superApprovedAt: Date | null;
  acceptedTermsVersion: string | null;
  termsRequired: boolean;
  currentTermsVersion: string;
  createdAt: Date;
}

/** SUPER_ADMIN_EMAILS outranks ADMIN_EMAILS; never demotes an existing
 *  SUPER_ADMIN at login (only ever promotes). */
function roleForEmail(email: string | null, current: UserRole): UserRole {
  if (!email) return current;
  const normalized = email.toLowerCase();
  if (config.superAdminEmails.includes(normalized)) return "SUPER_ADMIN";
  if (config.adminEmails.includes(normalized) && current !== "SUPER_ADMIN") return "ADMIN";
  return current;
}

/** Serializes a Prisma user for the client. The terms version is read from the
 *  published DB policy (falling back to config); `termsRequired` therefore
 *  turns true whenever a SUPER_ADMIN approves a new TERMS document. */
async function toUser(
  user: Omit<SafeUser, "termsRequired" | "currentTermsVersion">,
  currentTermsVersion?: string,
): Promise<SafeUser> {
  const termsVersion = currentTermsVersion ?? (await publishedPolicyVersion(PolicyType.TERMS));
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
    isPremium: user.isPremium,
    premiumExpiresAt: user.premiumExpiresAt,
    customWatermark: user.customWatermark,
    avatarUrl: user.avatarUrl,
    isSuperApproved: user.isSuperApproved,
    superApprovedAt: user.superApprovedAt,
    acceptedTermsVersion: user.acceptedTermsVersion,
    termsRequired: user.acceptedTermsVersion !== termsVersion,
    currentTermsVersion: termsVersion,
    createdAt: user.createdAt,
  };
}

/** Sends the email verification OTP with a hard ~8s cap. Throws when the email
 *  could not be delivered, carrying the provider's error message so the route
 *  answers a real 400 with the reason (Resend failure/timeout recorded) instead
 *  of an eternal pending request. Raises EmailSandboxError when the Resend
 *  sandbox blocks a non-owner recipient, so the route answers a clear
 *  "Test rejimida faqat administrator emailiga xat yuboriladi" 400 instead of a
 *  confusing 500. */
async function sendVerificationTo(email: string): Promise<void> {
  if (!resendSandboxRecipientAllowed(email)) throw new EmailSandboxError();
  const sent = await withTimeout(
    issueEmailVerification(email),
    EMAIL_SEND_TIMEOUT_MS,
    "Resend API javob bermadi (Timeout)",
  );
  if (!sent.ok) throw new Error(sent.error ?? "Pochtaga xat yuborishda xatolik yuz berdi. Qayta urinib ko'ring.");
}

// POST /api/auth/register
authRouter.post("/register", authBruteLimiter, validateBody(registerSchema), async (_req, res) => {
  const body = res.locals.body as Register;
  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
    return;
  }
  const termsVersion = await publishedPolicyVersion(PolicyType.TERMS);
  const user = await prisma.user.create({
    data: {
      email: body.email,
      passwordHash: await hashPassword(body.password),
      name: body.name ?? null,
      nickname: body.nickname ?? null,
      role: roleForEmail(body.email, "USER"),
      acceptedTermsVersion: termsVersion,
    },
  });
  await issueEmailVerification(user.email!);
  // Best-effort: keep the admin informed about new registrations.
  const handle = [user.nickname, user.name].filter(Boolean).join(" / ") || user.email!;
  void sendAdminNotification(`🆕 Yangi foydalanuvchi ro'yxatdan o'tdi\n\n${user.email}${handle !== user.email ? `\n${handle}` : ""}`);
  void recordActivity({ userId: user.id, action: "REGISTER", detail: user.email! });
  await issueRefreshCookie(res, user.id);
  res.status(201).json({ token: signAuthToken(user.id), user: await toUser(user, termsVersion) });
});

// POST /api/auth/login
authRouter.post("/login", authBruteLimiter, validateBody(loginSchema), async (_req, res) => {
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
  // Promote admin emails lazily so the account gets ADMIN/SUPER_ADMIN even if
  // it was created before the email was listed (or by the register endpoint).
  const targetRole = roleForEmail(user.email, user.role);
  const current =
    targetRole !== user.role
      ? await prisma.user.update({ where: { id: user.id }, data: { role: targetRole } })
      : user;
  void recordActivity({ userId: current.id, action: "LOGIN", detail: current.email ?? current.telegramUsername ?? "telegram" });
  await issueRefreshCookie(res, current.id);
  res.json({ token: signAuthToken(user.id), user: await toUser(current) });
});

// POST /api/auth/verify-email - redeem either the emailed link token or the
// 6-digit OTP code; both mark emailVerified once matched & unexpired.
authRouter.post("/verify-email", validateBody(verifyEmailSchema), async (_req, res) => {
  const body = res.locals.body as VerifyEmail;
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        body.token
          ? { emailVerificationToken: hashEmailVerificationToken(body.token) }
          : undefined,
        body.email && body.code
          ? { email: body.email, emailVerifyCodeHash: hashEmailVerifyCode(body.code) }
          : undefined,
      ].filter(Boolean) as Record<string, unknown>[],
    },
  });
  const valid =
    user &&
    ((body.token &&
      user.emailVerificationExpiresAt &&
      user.emailVerificationExpiresAt >= new Date()) ||
      (body.email &&
        body.code &&
        user.emailVerifyCodeHash === hashEmailVerifyCode(body.code) &&
        user.emailVerifyCodeExpiresAt &&
        user.emailVerifyCodeExpiresAt >= new Date()));
  if (!user || !valid) {
    res.status(400).json({ error: "Tasdiqlash kodi/havolasi yaroqsiz yoki muddati o'tgan" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      emailVerifyCodeHash: null,
      emailVerifyCodeExpiresAt: null,
    },
  });
  res.json({ ok: true });
});

// POST /api/auth/resend-verification
authRouter.post("/resend-verification", authBruteLimiter, validateBody(resendVerificationSchema), async (_req, res) => {
  const body = res.locals.body as ResendVerification;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (user && !user.emailVerified && user.email) {
    try {
      await sendVerificationTo(user.email);
    } catch (err) {
      // A stalled/failed Resend call must fail fast as a 400 with the real
      // reason, never leave the client's "Yuborilmoqda..." button hanging. A
      // sandbox-blocked recipient answers 400 with the actionable reason too.
      console.error("Resend Email Error:", err);
      logger.warn({ err, to: body.email }, "resend-verification: email delivery failed");
      res.status(400).json({
        success: false,
        message: err instanceof Error ? err.message : "Pochtaga xat yuborishda xatolik yuz berdi. Qayta urinib ko'ring.",
      });
      return;
    }
  }
  res.json({ ok: true });
});

// POST /api/auth/send-otp - re-send the email verification OTP to the current
// session's inbox. Authenticated variant of resend-verification: the listener
// clicks "Yuborilmoqda..." in Settings and is guaranteed a terminal response
// within ~8s (success toast, or a 500 with the real Resend reason).
authRouter.post("/send-otp", requireAuth, authBruteLimiter, async (req, res) => {
  const user = req.user!;
  if (!user.email) {
    res.status(400).json({ success: false, message: "Bu hisobda email mavjud emas" });
    return;
  }
  if (user.emailVerified) {
    res.json({ success: true, message: "Email allaqachon tasdiqlangan" });
    return;
  }
  try {
    await sendVerificationTo(user.email);
    res.json({ success: true, message: "Kod pochtaga yuborildi!" });
  } catch (err) {
    console.error("Resend Email Error:", err);
    logger.warn({ err, to: user.email }, "send-otp: email delivery failed");
    res.status(400).json({
      success: false,
      message: err instanceof Error ? err.message : "Pochtaga xat yuborishda xatolik yuz berdi. Qayta urinib ko'ring.",
    });
  }
});

// POST /api/auth/forgot-password - email a 6-digit OTP reset code + a fallback
// reset link. Unknown emails answer 404 so the UI can say "ro'yxatdan
// o'tilmagan". Both the code and token are stored SHA-256 hashed with a
// 15-minute resetTokenExpiry.
authRouter.post("/forgot-password", authBruteLimiter, validateBody(forgotPasswordSchema), async (_req, res) => {
  const body = res.locals.body as ForgotPassword;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !user.email) {
    res.status(404).json({ success: false, message: "Ushbu email bilan ro'yxatdan o'tilmagan" });
    return;
  }
  const token = generatePasswordResetToken();
  const code = generatePasswordResetCode();
  await prisma.user.update({
    where: { email: user.email },
    data: {
      resetPasswordToken: hashPasswordResetToken(token),
      resetPasswordCodeHash: hashPasswordResetCode(code),
      resetTokenExpiry: passwordResetExpiry(),
    },
  });
  try {
    const sent = await withTimeout(
      sendPasswordResetEmail(user.email, token, code),
      EMAIL_SEND_TIMEOUT_MS,
      "Resend API javob bermadi (Timeout)",
    );
    if (!sent.ok) {
      console.error("❌ FORGOT PASSWORD EMAIL ERROR:", sent.error);
      res.status(500).json({ success: false, message: "Pochtaga xat yuborishda xatolik yuz berdi" });
      return;
    }
  } catch (err) {
    console.error("❌ FORGOT PASSWORD EMAIL ERROR:", err);
    res.status(500).json({ success: false, message: "Pochtaga xat yuborishda xatolik yuz berdi" });
    return;
  }
  res.json({ ok: true, message: "Parolni tiklash kodi pochtangizga yuborildi" });
});

// POST /api/auth/reset-password - redeem either the emailed link token or the
// email+code OTP pair and set a new bcrypt-hashed password. Clears the reset
// fields so a token/code can never be replayed.
authRouter.post("/reset-password", authBruteLimiter, validateBody(resetPasswordSchema), async (_req, res) => {
  const body = res.locals.body as ResetPassword;
  let user: {
    id: string;
    email: string | null;
    resetTokenExpiry: Date | null;
    resetPasswordCodeHash?: string | null;
  } | null = null;
  if (body.token) {
    user = await prisma.user.findFirst({
      where: { resetPasswordToken: hashPasswordResetToken(body.token) },
      select: { id: true, email: true, resetTokenExpiry: true },
    });
  } else if (body.email && body.code) {
    user = await prisma.user.findUnique({
      where: { email: body.email },
      select: { id: true, email: true, resetPasswordCodeHash: true, resetTokenExpiry: true },
    });
    if (user && user.resetPasswordCodeHash !== hashPasswordResetCode(body.code)) {
      user = null;
    }
  }
  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    res.status(400).json({ error: "Tiklash kodi/havolasi yaroqsiz yoki muddati o'tgan" });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(body.password),
      resetPasswordToken: null,
      resetPasswordCodeHash: null,
      resetTokenExpiry: null,
    },
  });
  res.json({ ok: true });
});

// GET /api/auth/me
authRouter.get("/me", requireAuth, async (req, res) => {
  res.json({ user: await toUser(req.user!) });
});

// POST /api/auth/accept-terms - record consent for the current Terms of Use
// version. Login responses flag `termsRequired` when the account accepted an
// older version; the client must call this before letting the user in.
authRouter.post("/accept-terms", requireAuth, validateBody(acceptTermsSchema), async (req, res) => {
  const body = res.locals.body as AcceptTerms;
  const termsVersion = await publishedPolicyVersion(PolicyType.TERMS);
  if (body.version !== termsVersion) {
    res.status(400).json({
      error: "Qoidalarning eski versiyasi. Yangi shartlarga rozilik bering",
      code: "TERMS_VERSION_MISMATCH",
    });
    return;
  }
  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: { acceptedTermsVersion: termsVersion },
  });
  res.json({ ok: true, user: await toUser(updated, termsVersion) });
});

// PATCH /api/auth/me - update real name / nickname / avatar
authRouter.patch("/me", requireAuth, validateBody(updateProfileSchema), async (req, res) => {
  const body = res.locals.body as UpdateProfile;
  const data: {
    name?: string | null;
    nickname?: string | null;
    customWatermark?: string | null;
    avatarUrl?: string | null;
  } = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.nickname !== undefined) data.nickname = body.nickname;
  if (body.customWatermark !== undefined) data.customWatermark = body.customWatermark;
  if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
  const user = await prisma.user.update({ where: { id: req.user!.id }, data });
  res.json({ user: await toUser(user) });
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
  res.json({ ok: true, user: await toUser(updated) });
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
    await issueRefreshCookie(res, user.id);
    res.json({ status: "COMPLETE", token: signAuthToken(user.id), user: await toUser(user) });
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
  const termsVersion = await publishedPolicyVersion(PolicyType.TERMS);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      email: body.email,
      passwordHash: await hashPassword(body.password),
      quickLogin: false,
      acceptedTermsVersion: termsVersion,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.nickname !== undefined ? { nickname: body.nickname } : {}),
      role: roleForEmail(body.email, user.role),
    },
  });
  await issueEmailVerification(updated.email!);
  void recordActivity({ userId: updated.id, action: "REGISTER", detail: updated.email ?? "" });
  await issueRefreshCookie(res, updated.id);
  res.json({ token: signAuthToken(updated.id), user: await toUser(updated, termsVersion) });
});

// ---------------------------------------------------------------------------
// Refresh / logout (rotating HttpOnly cookie)
// ---------------------------------------------------------------------------

// POST /api/auth/refresh - redeem the HttpOnly refresh cookie for a new
// short-lived access token. The cookie is rotated on every use; a revoked or
// expired cookie returns 401 and is cleared on the client.
authRouter.post("/refresh", async (req, res) => {
  const raw = cookieRefreshToken(req);
  if (!raw) {
    res.status(401).json({ error: "Avtorizatsiya muddati tugagan. Qayta kiring" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { refreshTokenHash: hashRefreshToken(raw) } });
  if (!user || user.blocked || !user.refreshTokenExpiresAt || user.refreshTokenExpiresAt < new Date()) {
    clearRefreshCookie(res);
    res.status(401).json({ error: "Avtorizatsiya muddati tugagan. Qayta kiring" });
    return;
  }
  await issueRefreshCookie(res, user.id);
  res.json({ token: signAuthToken(user.id) });
});

// POST /api/auth/logout - revoke the stored refresh digest and clear the
// cookie. The access token itself is short-lived and simply ignored.
authRouter.post("/logout", async (req, res) => {
  const raw = cookieRefreshToken(req);
  if (raw) {
    const digest = hashRefreshToken(raw);
    await prisma.user.updateMany({
      where: { refreshTokenHash: digest },
      data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
    });
  }
  clearRefreshCookie(res);
  res.json({ ok: true });
});
