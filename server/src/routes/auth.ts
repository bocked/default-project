import { Router } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { password } from "../lib/password.js";
import { signToken } from "../lib/token.js";
import { requireAuth } from "../middleware/auth.js";
import { loginSchema, registerSchema, validateBody } from "../schemas.js";
import { randomCursorColor } from "../socket/presence.js";
import { authLimiter } from "../lib/rateLimit.js";

export const authRouter = Router();

// Pre-computed argon2 hash of a random password. Used only to make login
// latency constant regardless of whether the username exists.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$1zTlL/O02YrFFLMo8kAPjw$viFjZO9c5STxb2ZjbHx1LrImeFKTnY1jB+V7W+HD5UA";

// Credential endpoints are brute-force targets: limit aggressively per IP.
authRouter.use("/register", authLimiter);
authRouter.use("/login", authLimiter);

export interface PublicUser {
  id: string;
  username: string;
  role: string;
  displayName: string;
  color: string;
  createdAt: string;
}

export function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName,
    color: user.color,
    createdAt: user.createdAt.toISOString(),
  };
}

// POST /api/auth/register - create an account
authRouter.post("/register", validateBody(registerSchema), async (_req, res) => {
  try {
    const { username, displayName, password: plain, color } = res.locals.body;
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      res.status(409).json({ error: "Bu username allaqachon band" });
      return;
    }
    const passwordHash = await password.hash(plain);
    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        displayName: displayName?.trim() || username,
        color: color ?? randomCursorColor(),
      },
    });
    const token = await signToken({ sub: user.id, username: user.username, role: user.role, displayName: user.displayName, color: user.color });
    res.status(201).json({ token, user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "Failed to register" });
  }
});

// POST /api/auth/login - sign in with username + password
authRouter.post("/login", validateBody(loginSchema), async (_req, res) => {
  try {
    const { username, password: plain } = res.locals.body;
    const user = await prisma.user.findUnique({ where: { username } });
    // Equalize timing: always run an argon2 verify so response time does not
    // reveal whether the username exists (user-enumeration side channel).
    const ok = user
      ? await password.verify(user.passwordHash, plain)
      : await password.verify(DUMMY_HASH, plain).then(() => false);
    if (!user || !ok) {
      res.status(401).json({ error: "Noto'g'ri username yoki parol" });
      return;
    }
    const token = await signToken({ sub: user.id, username: user.username, role: user.role, displayName: user.displayName, color: user.color });
    res.json({ token, user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "Failed to login" });
  }
});

// GET /api/auth/me - restore session from a token
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch {
    res.status(500).json({ error: "Failed to load user" });
  }
});

// POST /api/auth/logout - no server state, client drops the token
authRouter.post("/logout", (_req, res) => {
  res.json({ ok: true });
});
