import { Router } from "express";
import type { QuoteStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { recentLogs, addLog } from "../lib/logstore.js";
import { onlineCount } from "./api.js";
import { bus } from "../lib/bus.js";
import { config } from "../config.js";
import { adminLimiter } from "../lib/rateLimit.js";
import { editModerationMessage } from "../lib/telegram.js";
import { validateBody, banCreateSchema, adminQuoteRejectSchema, type AdminQuoteReject } from "../schemas.js";

export const adminRouter = Router();

// Rate-limit before auth so unauthenticated attempts cannot hammer the API.
adminRouter.use(adminLimiter, requireAdmin);

// GET /api/admin/stats - dashboard numbers
adminRouter.get("/stats", async (_req, res) => {
  try {
    const [bans, online, pending, approved, rejected, users] = await Promise.all([
      prisma.bannedIp.count(),
      Promise.resolve(onlineCount()),
      prisma.quote.count({ where: { status: "PENDING" } }),
      prisma.quote.count({ where: { status: "APPROVED" } }),
      prisma.quote.count({ where: { status: "REJECTED" } }),
      prisma.user.count(),
    ]);
    res.json({ bans, online, quotes: { pending, approved, rejected }, users });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/quotes?status=PENDING - moderation list. The admin sees the
// real owner's email/name/nickname even for anonymous quotes.
adminRouter.get("/quotes", async (req, res) => {
  try {
    const raw = typeof req.query.status === "string" ? req.query.status.toUpperCase() : "";
    const status: QuoteStatus | undefined = ["PENDING", "APPROVED", "REJECTED"].includes(raw)
      ? (raw as QuoteStatus)
      : undefined;
    const quotes = await prisma.quote.findMany({
      where: status ? { status } : undefined,
      include: {
        user: { select: { id: true, email: true, name: true, nickname: true } },
        category: true,
        tags: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ quotes });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/quotes/:id/approve
adminRouter.post("/quotes/:id/approve", async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "APPROVED", awaitingRejection: false, rejectionReason: null },
    });
    if (quote.telegramMessageId !== null && config.telegramAdminChatId) {
      await editModerationMessage(
        config.telegramAdminChatId,
        quote.telegramMessageId,
        `✅ Tasdiqlandi\n\n${quote.text}\n\n— ${quote.displayAuthor}`,
        null
      );
    }
    addLog("info", `Iqtibos tasdiqlandi (admin panel): ${quote.text.slice(0, 40)}...`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to approve quote" });
  }
});

// POST /api/admin/quotes/:id/reject { reason }
adminRouter.post("/quotes/:id/reject", validateBody(adminQuoteRejectSchema), async (req, res) => {
  try {
    const body = res.locals.body as AdminQuoteReject;
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "REJECTED", rejectionReason: body.reason, awaitingRejection: false },
    });
    if (quote.telegramMessageId !== null && config.telegramAdminChatId) {
      await editModerationMessage(
        config.telegramAdminChatId,
        quote.telegramMessageId,
        `❌ Rad etildi\n\n${quote.text}\n\n— ${quote.displayAuthor}\n\nSabab: ${body.reason}`,
        null
      );
    }
    addLog("warn", `Iqtibos rad etildi (admin panel): ${quote.text.slice(0, 40)}...`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to reject quote" });
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
