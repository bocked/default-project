import { Router } from "express";
import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { password } from "../lib/password.js";
import { signToken } from "../lib/token.js";
import { requireAuth } from "../middleware/auth.js";
import { loginSchema, registerSchema, validateBody } from "../schemas.js";
import { randomCursorColor } from "../socket/presence.js";

export const authRouter = Router();

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
    if (!user) {
      res.status(401).json({ error: "Noto'g'ri username yoki parol" });
      return;
    }
    const ok = await password.verify(user.passwordHash, plain);
    if (!ok) {
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
