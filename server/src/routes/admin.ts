import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { storage } from "../lib/storage.js";
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
    const [items, bans, online] = await Promise.all([
      prisma.canvasItem.count(),
      prisma.bannedIp.count(),
      Promise.resolve(onlineCount()),
    ]);
    res.json({ items, bans, online });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/items - list everything with IP + coordinates
adminRouter.get("/items", async (_req, res) => {
  try {
    const items = await prisma.canvasItem.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    res.json({ items });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// DELETE /api/admin/items/:id - remove a single item
adminRouter.delete("/items/:id", async (req, res) => {
  try {
    const deleted = await prisma.canvasItem.delete({ where: { id: req.params.id } });
    await bus.publish("canvas:item-delete", { id: deleted.id });
    addLog("delete", `Item ${deleted.id.slice(0, 8)} deleted (${deleted.type})`);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Item not found" });
  }
});

// DELETE /api/admin/items - clear the whole canvas
adminRouter.delete("/items", async (_req, res) => {
  try {
    const result = await prisma.canvasItem.deleteMany({});
    await bus.publish("canvas:clear", {});
    addLog("delete", `Canvas cleared (${result.count} items)`);
    res.json({ ok: true, deleted: result.count });
  } catch {
    res.status(500).json({ error: "Failed to clear canvas" });
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

// GET /api/admin/uploads?url=... - inspect a stored upload (R2 or local fallback)
adminRouter.get("/uploads", async (req, res) => {
  try {
    const { url } = z
      .object({ url: z.string().min(1).max(2048) })
      .parse({ url: typeof req.query.url === "string" ? req.query.url : "" });
    const meta = await storage.metadata(url);
    if (!meta) {
      res.status(404).json({ error: "Upload not found" });
      return;
    }
    res.json({ meta });
  } catch {
    res.status(404).json({ error: "Upload not found" });
  }
});

// DELETE /api/admin/uploads - permanently remove a stored upload
adminRouter.delete(
  "/uploads",
  validateBody(z.object({ url: z.string().min(1).max(2048) })),
  async (_req, res) => {
    try {
      const { url } = res.locals.body as { url: string };
      await storage.delete(url);
      addLog("delete", `Upload removed: ${url.slice(-40)}`);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Failed to delete upload" });
    }
  }
);

// GET /api/admin/reports - moderation queue
adminRouter.get("/reports", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : "OPEN";
    const reports = await prisma.report.findMany({
      where: { status },
      orderBy: { createdAt: "asc" },
      take: 200,
      include: {
        item: { select: { id: true, type: true, content: true, x: true, y: true, deletedAt: true, roomId: true } },
        reporter: { select: { username: true, displayName: true } },
        handledBy: { select: { username: true, displayName: true } },
      },
    });
    res.json({ reports });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/reports/:id/resolve - action on a report
// body: { action: "DISMISS" | "REMOVE" }
adminRouter.post(
  "/reports/:id/resolve",
  validateBody(z.object({ action: z.enum(["DISMISS", "REMOVE"]) })),
  async (req, res) => {
    try {
      const { action } = res.locals.body as { action: "DISMISS" | "REMOVE" };
      const report = await prisma.report.findUnique({
        where: { id: req.params.id },
        include: { item: true },
      });
      if (!report || report.status !== "OPEN") {
        res.status(404).json({ error: "Report not found" });
        return;
      }
      if (action === "REMOVE") {
        await prisma.canvasItem.update({
          where: { id: report.itemId },
          data: { deletedAt: new Date() },
        });
        await bus.publish("canvas:item-delete", { id: report.itemId, roomId: report.item.roomId });
      }
      await prisma.report.update({
        where: { id: report.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          handledById: req.user?.sub ?? null,
        },
      });
      addLog(
        "info",
        `Report ${report.id.slice(0, 8)} ${action === "REMOVE" ? "removed item" : "dismissed"} (${report.reason.slice(0, 80)})`
      );
      res.json({ ok: true, action });
    } catch {
      res.status(500).json({ error: "Failed to resolve report" });
    }
  }
);
