import { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { config } from "../config.js";
import { prisma } from "../lib/prisma.js";
import { verifyAuthToken } from "../lib/tokens.js";
import { clientIp } from "../lib/ip.js";

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
 *  - a regular auth JWT belonging to a user with the ADMIN or SUPER_ADMIN role.
 * When ADMIN_IP_WHITELIST is configured the caller's IP must be listed too.
 * On success `req.admin` carries the acting admin's identity for auditing.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (config.adminIpWhitelist.length > 0) {
    const ip = clientIp(req.headers);
    if (!config.adminIpWhitelist.includes(ip)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (safeEqual(token, config.adminPassword)) {
    req.admin = { id: null, email: "ADMIN_PASSWORD", role: "ADMIN_PASSWORD" };
    next();
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") || user.blocked) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  req.admin = { id: user.id, email: user.email, role: user.role };
  next();
}

/**
 * Super-admin gate for top-level actions (e.g. manually verifying users).
 * Only the shared ADMIN_PASSWORD bearer or a SUPER_ADMIN account may pass;
 * a regular ADMIN gets 403. Runs after requireAdmin.
 */
export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  if (token && safeEqual(token, config.adminPassword)) {
    req.admin = { id: null, email: "ADMIN_PASSWORD", role: "ADMIN_PASSWORD" };
    next();
    return;
  }
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.role !== "SUPER_ADMIN" || user.blocked) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  req.admin = { id: user.id, email: user.email, role: "SUPER_ADMIN" };
  next();
}
