import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { clientIp } from "../lib/ip.js";

/**
 * HTTP middleware that rejects banned clients before they can upload files or
 * call mutating endpoints.
 */
export async function requireNotBanned(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ip = clientIp(req.headers);
    if (ip !== "unknown") {
      const banned = await prisma.bannedIp.findUnique({ where: { ipAddress: ip } });
      if (banned) {
        res.status(403).json({ error: "Banned", reason: banned.reason ?? undefined });
        return;
      }
    }
    next();
  } catch {
    next();
  }
}
