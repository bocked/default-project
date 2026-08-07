import { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { tokenFromHeader, verifyToken } from "../lib/token.js";

const ADMIN_ROLES = ["ADMIN", "MODERATOR"];

/**
 * Protects /api/admin/* routes. Accepts either:
 *  1. a legacy `Authorization: Bearer <ADMIN_PASSWORD>`, or
 *  2. a JWT whose user role is ADMIN or MODERATOR.
 * Attaches `req.user` when a valid JWT was used.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = tokenFromHeader(req.headers.authorization);

  if (token) {
    if (token === config.adminPassword) {
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
