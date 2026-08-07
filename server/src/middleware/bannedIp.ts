import { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { clientIp } from "../lib/ip.js";
import { cache, CACHE_TTL } from "../lib/cache.js";
import { bus } from "../lib/bus.js";

const key = (ip: string): string => `banned:${ip}`;

// A ban/unban through any path (HTTP admin route or socket admin:ban) is
// broadcast on the bus; every instance drops its cached decision for that IP.
bus.subscribe("admin:ban", (payload) => {
  const ip = (payload as { ipAddress?: string })?.ipAddress;
  if (ip) cache.delete(key(ip));
});
bus.subscribe("admin:unban", (payload) => {
  const ip = (payload as { ipAddress?: string })?.ipAddress;
  if (ip) cache.delete(key(ip));
});

/**
 * HTTP middleware that rejects banned clients before they can upload files or
 * call mutating endpoints. The `bannedIp` lookup is cached per-IP (positive and
 * negative) and invalidated through the bus, turning a DB query on every
 * request into a Map lookup for the cache TTL.
 */
export async function requireNotBanned(req: Request, res: Response, next: NextFunction): Promise<void> {
  const ip = clientIp(req.headers);
  if (ip === "unknown") {
    next();
    return;
  }
  const k = key(ip);
  const cached = cache.get<boolean>(k);
  if (cached !== undefined) {
    if (cached) {
      res.status(403).json({ error: "Banned" });
      return;
    }
    next();
    return;
  }
  try {
    const banned = await prisma.bannedIp.findUnique({ where: { ipAddress: ip } });
    cache.set(k, banned !== null, banned ? CACHE_TTL.banned : CACHE_TTL.banned);
    if (banned) {
      res.status(403).json({ error: "Banned", reason: banned.reason ?? undefined });
      return;
    }
    next();
  } catch {
    // DB hiccup: let the request through rather than breaking the whole API.
    next();
  }
}
