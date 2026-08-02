import { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

/**
 * Protects /api/admin/* routes. Expects `Authorization: Bearer <ADMIN_PASSWORD>`.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token || token !== config.adminPassword) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
