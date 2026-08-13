import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyAuthToken } from "../lib/tokens.js";

/** Requires a valid `Authorization: Bearer <jwt>` header and a known user. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.blocked) {
    res.status(403).json({ error: "Hisob bloklangan", code: "ACCOUNT_BLOCKED" });
    return;
  }
  req.user = user;
  next();
}

/** Requires an authenticated user whose profile is activated: either the
 *  email was verified or the phone was verified via Telegram. Admins are
 *  trusted and never gated on email/phone verification. */
export function requireVerified(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.role === "ADMIN") {
    next();
    return;
  }
  if (!req.user.emailVerified && !req.user.phoneVerified) {
    res.status(403).json({ error: "Profil tasdiqlanmagan", code: "NOT_VERIFIED" });
    return;
  }
  next();
}

/** Gate for actions that require a fully registered profile (e.g. posting
 *  quotes). Telegram quick-login accounts (no email/password yet) must upgrade
 *  first, then pass the same email/phone verification as everyone else.
 *  Admins are trusted and never gated. */
export function requireFullUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.quickLogin) {
    res.status(403).json({
      error: "Iqtibos joylash uchun profilni to'liq ro'yxatdan o'tkazing",
      code: "UPGRADE_REQUIRED",
    });
    return;
  }
  if (req.user.role === "ADMIN") {
    next();
    return;
  }
  if (!req.user.emailVerified && !req.user.phoneVerified) {
    res.status(403).json({ error: "Profil tasdiqlanmagan", code: "NOT_VERIFIED" });
    return;
  }
  next();
}
