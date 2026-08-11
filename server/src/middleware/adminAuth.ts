import { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";

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
 * Protects /api/admin/* routes. Accepts `Authorization: Bearer <ADMIN_PASSWORD>`.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token && safeEqual(token, config.adminPassword)) {
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
}
