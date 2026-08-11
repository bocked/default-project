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
} from "../lib/tokens.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email.js";
import {
  validateBody,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  type Register,
  type Login,
  type VerifyEmail,
  type ResendVerification,
  type ForgotPassword,
  type ResetPassword,
  type UpdateProfile,
} from "../schemas.js";

export const authRouter = Router();

interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  role: string;
  emailVerified: boolean;
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
  await issueVerification(user.email);
  res.status(201).json({ token: signAuthToken(user.id), user: toUser(user) });
});

// POST /api/auth/login
authRouter.post("/login", validateBody(loginSchema), async (_req, res) => {
  const body = res.locals.body as Login;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    res.status(401).json({ error: "Email yoki parol noto'g'ri" });
    return;
  }
  // Promote admin emails lazily so the account gets ADMIN even if it was
  // created before the email was listed (or by the register endpoint itself).
  const promote =
    user.role !== "ADMIN" && config.adminEmails.includes(user.email.toLowerCase());
  const current = promote
    ? await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } })
    : user;
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
  if (user && !user.emailVerified) {
    await issueVerification(user.email);
  }
  res.json({ ok: true });
});

// POST /api/auth/forgot-password - email a time-limited reset link. Always
// answers ok so the endpoint cannot be used to enumerate registered emails.
authRouter.post("/forgot-password", validateBody(forgotPasswordSchema), async (_req, res) => {
  const body = res.locals.body as ForgotPassword;
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (user) {
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
