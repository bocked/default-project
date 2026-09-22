import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyAuthToken } from "../lib/tokens.js";
import { isPremiumActive } from "../lib/premium.js";

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

/** Attaches `req.user` when a valid Bearer token is presented; otherwise the
 *  request continues as a guest. Used by public routes that personalize the
 *  response (quiz detail returns the caller's last attempt, quote detail its
 *  liked state) without forcing authentication. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    next();
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    next();
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.blocked) {
    next();
    return;
  }
  req.user = user;
  next();
}

/** True for a profile that can post without the email/phone verification:
 *  either verified normally, manually cleared by a SUPER_ADMIN, or VIP. */
export function profileCanPost(user: {
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  isSuperApproved: boolean;
  isPremium: boolean;
  premiumExpiresAt?: Date | string | null;
}): boolean {
  return (
    user.role === "ADMIN" ||
    user.role === "SUPER_ADMIN" ||
    user.emailVerified ||
    user.phoneVerified ||
    user.isSuperApproved ||
    isPremiumActive(user)
  );
}

/** Requires an authenticated user whose profile is activated: either the
 *  email was verified or the phone was verified via Telegram. Admins and
 *  super-admins are trusted and never gated. */
export function requireVerified(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (profileCanPost(req.user)) {
    next();
    return;
  }
  res.status(403).json({ error: "Profil tasdiqlanmagan", code: "NOT_VERIFIED" });
}

/** Gate for actions that require a fully registered profile (e.g. posting
 *  quotes). Telegram quick-login accounts (no email/password yet) must upgrade
 *  first — unless a SUPER_ADMIN manually approved them. Once past the quick-login
 *  gate they pass the same email/phone verification as everyone else — unless
 *  super-approved or VIP. Admins are trusted and never gated. */
export function requireFullUser(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (req.user.quickLogin && !req.user.isSuperApproved) {
    res.status(403).json({
      error: "Iqtibos joylash uchun profilni to'liq ro'yxatdan o'tkazing",
      code: "UPGRADE_REQUIRED",
    });
    return;
  }
  if (profileCanPost(req.user)) {
    next();
    return;
  }
  res.status(403).json({ error: "Profil tasdiqlanmagan", code: "NOT_VERIFIED" });
}
