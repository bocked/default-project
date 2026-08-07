import { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { tokenFromHeader, verifyToken } from "../lib/token.js";

const ADMIN_ROLES = ["ADMIN", "MODERATOR"];

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
 *  1. a legacy `Authorization: Bearer <ADMIN_PASSWORD>`, or
 *  2. a JWT whose user role is ADMIN or MODERATOR.
 * Attaches `req.user` when a valid JWT was used.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = tokenFromHeader(req.headers.authorization);

  if (token) {
    if (safeEqual(token, config.adminPassword)) {
      next();
      return;
    }
    const payload = await verifyToken(token);
    if (payload && ADMIN_ROLES.includes(payload.role)) {
      req.user = payload;
      next();
      return;
    }
  }

  res.status(401).json({ error: "Unauthorized" });
}
