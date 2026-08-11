import { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { verifyAuthToken } from "../lib/tokens.js";

/**
 * Constant-time comparison for the shared admin password. Both values are
 * hashed to equal length so timingSafeEqual cannot throw on length mismatch.
 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Protects /api/admin/* routes. Accepts either:
 *  - `Authorization: Bearer <ADMIN_PASSWORD>` (shared secret), or
 *  - a regular auth JWT belonging to a user with the ADMIN role.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (safeEqual(token, config.adminPassword)) {
    next();
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.role !== "ADMIN") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}
