import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  signAuthToken,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
  emailVerificationExpiry,
} from "../lib/tokens.js";
import { sendVerificationEmail } from "../lib/email.js";
import {
  validateBody,
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  updateProfileSchema,
  type Register,
  type Login,
  type VerifyEmail,
  type ResendVerification,
  type UpdateProfile,
} from "../schemas.js";

export const authRouter = Router();

interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  emailVerified: boolean;
  createdAt: Date;
}

function toUser(user: SafeUser): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    nickname: user.nickname,
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
  res.json({ token: signAuthToken(user.id), user: toUser(user) });
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
