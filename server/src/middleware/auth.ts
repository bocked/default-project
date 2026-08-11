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
  req.user = user;
  next();
}

/** Requires an authenticated user whose email has been verified. */
export function requireVerified(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.user.emailVerified) {
    res.status(403).json({ error: "Email tasdiqlanmagan", code: "EMAIL_NOT_VERIFIED" });
    return;
  }
  next();
}
