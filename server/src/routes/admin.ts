import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { recentLogs, addLog } from "../lib/logstore.js";
import { onlineCount } from "./api.js";
import { bus } from "../lib/bus.js";
import { adminLimiter } from "../lib/rateLimit.js";
import { validateBody, banCreateSchema } from "../schemas.js";

export const adminRouter = Router();

// Rate-limit before auth so unauthenticated attempts cannot hammer the API.
adminRouter.use(adminLimiter, requireAdmin);

// GET /api/admin/stats - dashboard numbers
adminRouter.get("/stats", async (_req, res) => {
  try {
    const [bans, online] = await Promise.all([prisma.bannedIp.count(), Promise.resolve(onlineCount())]);
    res.json({ bans, online });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/bans - list banned IPs
adminRouter.get("/bans", async (_req, res) => {
  try {
    const bans = await prisma.bannedIp.findMany({ orderBy: { createdAt: "desc" } });
    res.json({ bans });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/bans - ban an IP
adminRouter.post("/bans", validateBody(banCreateSchema), async (_req, res) => {
  try {
    const { ipAddress, reason } = res.locals.body as { ipAddress: string; reason?: string };
    const ban = await prisma.bannedIp.upsert({
      where: { ipAddress },
      update: { reason: reason ?? null },
      create: { ipAddress, reason: reason ?? null },
    });
    await bus.publish("admin:ban", { ipAddress: ban.ipAddress, reason: ban.reason });
    addLog("ban", `IP ${ban.ipAddress} banned`);
    res.json({ ban });
  } catch {
    res.status(500).json({ error: "Failed to ban IP" });
  }
});

// DELETE /api/admin/bans/:ip - unban an IP
adminRouter.delete("/bans/:ip", async (req, res) => {
  try {
    await prisma.bannedIp.delete({ where: { ipAddress: req.params.ip } });
    await bus.publish("admin:unban", { ipAddress: req.params.ip });
    addLog("info", `IP ${req.params.ip} unbanned`);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Ban not found" });
  }
});

// GET /api/admin/logs - recent moderation logs
adminRouter.get("/logs", (_req, res) => {
  res.json({ logs: recentLogs(200) });
});
