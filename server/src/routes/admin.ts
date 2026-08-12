import { Router } from "express";
import type { Prisma, QuoteStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin } from "../middleware/adminAuth.js";
import { recentLogs, addLog } from "../lib/logstore.js";
import { recordAudit } from "../lib/audit.js";
import { onlineCount } from "./api.js";
import { bus } from "../lib/bus.js";
import { config } from "../config.js";
import { adminLimiter } from "../lib/rateLimit.js";
import { editModerationMessage } from "../lib/telegram.js";
import { listContent, getContent } from "../lib/content.js";
import { clientIp } from "../lib/ip.js";
import { normalizeTagName, slugify } from "../lib/categories.js";
import {
  validateBody,
  banCreateSchema,
  adminQuoteRejectSchema,
  quoteEditSchema,
  bulkQuotesSchema,
  bulkUsersSchema,
  userRoleUpdateSchema,
  tagUpdateSchema,
  contentUpdateSchema,
  type AdminQuoteReject,
  type QuoteEdit,
  type BulkQuotes,
  type BulkUsers,
  type UserRoleUpdate,
  type TagUpdate,
  type ContentUpdate,
} from "../schemas.js";

export const adminRouter = Router();

// Rate-limit before auth so unauthenticated attempts cannot hammer the API.
adminRouter.use(adminLimiter, requireAdmin);

const DAY = 24 * 60 * 60 * 1000;

function adminId(req: import("express").Request): string | null {
  return req.admin?.id ?? null;
}

function adminEmail(req: import("express").Request): string | null {
  return req.admin?.email ?? null;
}

// ---------------------------------------------------------------------------
// Stats & activity
// ---------------------------------------------------------------------------

// GET /api/admin/stats - dashboard numbers
adminRouter.get("/stats", async (_req, res) => {
  try {
    const [bans, online, pending, approved, rejected, users, deletedQuotes, blockedUsers] = await Promise.all([
      prisma.bannedIp.count(),
      Promise.resolve(onlineCount()),
      prisma.quote.count({ where: { status: "PENDING", deletedAt: null } }),
      prisma.quote.count({ where: { status: "APPROVED", deletedAt: null } }),
      prisma.quote.count({ where: { status: "REJECTED", deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.quote.count({ where: { deletedAt: { not: null } } }),
      prisma.user.count({ where: { blocked: true, deletedAt: null } }),
    ]);
    res.json({ bans, online, quotes: { pending, approved, rejected }, users, deletedQuotes, blockedUsers });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/stats/activity?days=14 - daily registrations & quote activity
adminRouter.get("/stats/activity", async (req, res) => {
  try {
    const days = Math.min(60, Math.max(7, Number(req.query.days) || 14));
    const since = new Date(Date.now() - days * DAY);
    const [users, quotes] = await Promise.all([
      prisma.user.findMany({
        where: { createdAt: { gte: since }, deletedAt: null },
        select: { createdAt: true },
      }),
      prisma.quote.findMany({
        where: { createdAt: { gte: since }, deletedAt: null },
        select: { createdAt: true, status: true },
      }),
    ]);

    const buckets: Array<{ date: string; registrations: number; quotes: number; approved: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = new Date(Date.now() - i * DAY);
      buckets.push({
        date: day.toISOString().slice(0, 10),
        registrations: 0,
        quotes: 0,
        approved: 0,
      });
    }
    const index = new Map(buckets.map((b, i) => [b.date, i]));
    for (const u of users) {
      const i = index.get(u.createdAt.toISOString().slice(0, 10));
      if (i !== undefined) buckets[i].registrations += 1;
    }
    for (const q of quotes) {
      const i = index.get(q.createdAt.toISOString().slice(0, 10));
      if (i !== undefined) {
        buckets[i].quotes += 1;
        if (q.status === "APPROVED") buckets[i].approved += 1;
      }
    }
    res.json({ days, activity: buckets });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Quotes moderation (with soft delete / trash)
// ---------------------------------------------------------------------------

const quoteInclude = {
  user: { select: { id: true, email: true, name: true, nickname: true, telegramId: true, phoneNumber: true, blocked: true } },
  category: true,
  tags: true,
} as const;

function quoteQuery(query: Record<string, unknown>) {
  const raw = typeof query.status === "string" ? query.status.toUpperCase() : "";
  const status: QuoteStatus | undefined = ["PENDING", "APPROVED", "REJECTED"].includes(raw)
    ? (raw as QuoteStatus)
    : undefined;
  const deleted = query.deleted === "1";
  const where: Record<string, unknown> = { deletedAt: deleted ? { not: null } : null };
  if (status) where.status = status;
  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q) where.OR = [
    { text: { contains: q, mode: "insensitive" } },
    { displayAuthor: { contains: q, mode: "insensitive" } },
    { user: { email: { contains: q, mode: "insensitive" } } },
    { category: { name: { contains: q, mode: "insensitive" } } },
    { tags: { some: { name: { contains: q, mode: "insensitive" } } } },
  ];
  return where;
}

// GET /api/admin/quotes?status=&q=&deleted= - moderation list with the real owner's
// email/name/nickname even for anonymous quotes.
adminRouter.get("/quotes", async (req, res) => {
  try {
    const where = quoteQuery(req.query);
    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: quoteInclude,
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.quote.count({ where }),
    ]);
    res.json({ quotes, total });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/quotes/bulk - approve/reject/delete/restore many quotes at once.
// Declared before /quotes/:id/* so "bulk" is not captured as an id.
adminRouter.post("/quotes/bulk", validateBody(bulkQuotesSchema), async (req, res) => {
  try {
    const body = res.locals.body as BulkQuotes;
    const ip = clientIp(req.headers);
    let count = 0;
    if (body.action === "approve" || body.action === "reject") {
      const result = await prisma.quote.updateMany({
        where: { id: { in: body.ids }, deletedAt: null },
        data:
          body.action === "approve"
            ? { status: "APPROVED", awaitingRejection: false, rejectionReason: null }
            : { status: "REJECTED", rejectionReason: body.reason ?? "Admin tomonidan rad etildi", awaitingRejection: false },
      });
      count = result.count;
    } else if (body.action === "delete") {
      const result = await prisma.quote.updateMany({
        where: { id: { in: body.ids }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      count = result.count;
    } else {
      const result = await prisma.quote.updateMany({
        where: { id: { in: body.ids }, deletedAt: { not: null } },
        data: { deletedAt: null },
      });
      count = result.count;
    }
    if (body.action === "approve" || body.action === "reject") {
      const touched = await prisma.quote.findMany({
        where: { id: { in: body.ids }, telegramMessageId: { not: null } },
        select: { id: true, telegramMessageId: true, text: true, displayAuthor: true },
      });
      for (const q of touched) {
        const text =
          body.action === "approve"
            ? `✅ Tasdiqlandi\n\n${q.text}\n\n— ${q.displayAuthor}`
            : `❌ Rad etildi\n\n${q.text}\n\n— ${q.displayAuthor}\n\nSabab: ${body.reason ?? "-"}`;
        if (q.telegramMessageId !== null && config.telegramAdminChatId) {
          void editModerationMessage(config.telegramAdminChatId, q.telegramMessageId, text, null);
        }
      }
    }
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: `quote.${body.action}.bulk`,
      targetType: "quote",
      detail: `${count} ta iqtibos ${body.action} qilindi`,
      ip,
    });
    res.json({ ok: true, count });
  } catch {
    res.status(500).json({ error: "Amal bajarilmadi" });
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
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quote.approve",
      targetType: "quote",
      targetId: quote.id,
      detail: quote.text.slice(0, 60),
      ip: clientIp(req.headers),
    });
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
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quote.reject",
      targetType: "quote",
      targetId: quote.id,
      detail: `${quote.text.slice(0, 60)} (sabab: ${body.reason})`,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to reject quote" });
  }
});

// PATCH /api/admin/quotes/:id - edit quote fields (moderation fixes).
adminRouter.patch("/quotes/:id", validateBody(quoteEditSchema), async (req, res) => {
  try {
    const body = res.locals.body as QuoteEdit;
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    const data: Record<string, unknown> = {};
    if (body.text !== undefined) data.text = body.text;
    if (body.displayAuthor !== undefined) data.displayAuthor = body.displayAuthor;
    if (body.telegramUrl !== undefined) data.telegramUrl = body.telegramUrl ?? null;
    if (body.categorySlug !== undefined) {
      const category = await prisma.category.findUnique({ where: { slug: body.categorySlug } });
      if (!category) {
        res.status(400).json({ error: "Bunday bo'lim topilmadi" });
        return;
      }
      data.categoryId = category.id;
    }
    const tagData =
      body.tags === undefined
        ? undefined
        : [...new Map(body.tags.map((t) => [slugify(normalizeTagName(t) ?? ""), normalizeTagName(t) ?? ""] as const)).entries()]
            .filter(([slug]) => slug.length > 0)
            .slice(0, 5)
            .map(([slug, name]) => ({ slug, name }));
    const updated = await prisma.quote.update({
      where: { id: quote.id },
      data: {
        ...data,
        ...(tagData === undefined
          ? {}
          : {
              tags: {
                set: [],
                connectOrCreate: tagData.map((t) => ({
                  where: { slug: t.slug },
                  create: { name: t.name, slug: t.slug },
                })),
              },
            }),
      },
      include: quoteInclude,
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quote.edit",
      targetType: "quote",
      targetId: quote.id,
      detail: quote.text.slice(0, 60),
      ip: clientIp(req.headers),
    });
    res.json({ quote: updated });
  } catch {
    res.status(500).json({ error: "Iqtibos tahrirlanmadi" });
  }
});

// DELETE /api/admin/quotes/:id - soft delete (moves to trash).
adminRouter.delete("/quotes/:id", async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    await prisma.quote.update({ where: { id: quote.id }, data: { deletedAt: new Date() } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quote.delete",
      targetType: "quote",
      targetId: quote.id,
      detail: quote.text.slice(0, 60),
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Iqtibos o'chirilmadi" });
  }
});

// POST /api/admin/quotes/:id/restore - pull a quote back out of trash.
adminRouter.post("/quotes/:id/restore", async (req, res) => {
  try {
    const quote = await prisma.quote.findFirst({ where: { id: req.params.id, deletedAt: { not: null } } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found in trash" });
      return;
    }
    await prisma.quote.update({ where: { id: quote.id }, data: { deletedAt: null } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quote.restore",
      targetType: "quote",
      targetId: quote.id,
      detail: quote.text.slice(0, 60),
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Iqtibos tiklanmadi" });
  }
});

// ---------------------------------------------------------------------------
// Users (search / filter / block / delete)
// ---------------------------------------------------------------------------

function userQuery(query: Record<string, unknown>) {
  const where: Record<string, unknown> = { deletedAt: query.deleted === "1" ? { not: null } : null };
  const role = typeof query.role === "string" && ["USER", "ADMIN"].includes(query.role.toUpperCase())
    ? (query.role.toUpperCase() as UserRole)
    : undefined;
  if (role) where.role = role;
  if (query.blocked === "1") where.blocked = true;
  if (query.blocked === "0") where.blocked = false;
  const q = typeof query.q === "string" ? query.q.trim() : "";
  if (q) where.OR = [
    { email: { contains: q, mode: "insensitive" } },
    { name: { contains: q, mode: "insensitive" } },
    { nickname: { contains: q, mode: "insensitive" } },
    { phoneNumber: { contains: q, mode: "insensitive" } },
    { telegramId: { contains: q, mode: "insensitive" } },
  ];
  return where;
}

// GET /api/admin/users?q=&role=&blocked=&deleted= - all users with admin-only details.
adminRouter.get("/users", async (req, res) => {
  try {
    const where = userQuery(req.query);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          nickname: true,
          role: true,
          emailVerified: true,
          phoneVerified: true,
          telegramId: true,
          phoneNumber: true,
          blocked: true,
          blockedAt: true,
          deletedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.user.count({ where }),
    ]);
    res.json({ users, total });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

async function guardTargetUser(res: import("express").Response, id: string): Promise<boolean> {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return false;
  }
  if (target.role === "ADMIN") {
    res.status(400).json({ error: "Admin hisobini bloklash yoki o'chirish mumkin emas" });
    return false;
  }
  return true;
}

// POST /api/admin/users/:id/block
adminRouter.post("/users/:id/block", async (req, res) => {
  try {
    if (!(await guardTargetUser(res, req.params.id))) return;
    await prisma.user.update({
      where: { id: req.params.id },
      data: { blocked: true, blockedAt: new Date() },
    });
    await bus.publish("admin:user-block", { userId: req.params.id });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "user.block",
      targetType: "user",
      targetId: req.params.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Foydalanuvchi bloklanmadi" });
  }
});

// POST /api/admin/users/:id/unblock
adminRouter.post("/users/:id/unblock", async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { blocked: false, blockedAt: null },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "user.unblock",
      targetType: "user",
      targetId: req.params.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Foydalanuvchi blokdan chiqarilmadi" });
  }
});

// DELETE /api/admin/users/:id - soft delete (moves to trash).
adminRouter.delete("/users/:id", async (req, res) => {
  try {
    if (!(await guardTargetUser(res, req.params.id))) return;
    await prisma.user.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date() },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "user.delete",
      targetType: "user",
      targetId: req.params.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Foydalanuvchi o'chirilmadi" });
  }
});

// PATCH /api/admin/users/:id/role - grant or revoke the ADMIN role.
adminRouter.patch("/users/:id/role", validateBody(userRoleUpdateSchema), async (req, res) => {
  try {
    const { role } = res.locals.body as UserRoleUpdate;
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    const actorId = adminId(req);
    if (actorId && target.id === actorId) {
      res.status(400).json({ error: "O'zingizning rolingizni o'zgartira olmaysiz" });
      return;
    }
    const user = await prisma.user.update({ where: { id: target.id }, data: { role } });
    await recordAudit({
      adminId: actorId,
      adminEmail: adminEmail(req),
      action: "user.role",
      targetType: "user",
      targetId: user.id,
      detail: `${target.role} -> ${role}`,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true, user: { id: user.id, role: user.role } });
  } catch {
    res.status(500).json({ error: "Rol o'zgartirilmadi" });
  }
});

// POST /api/admin/users/:id/restore
adminRouter.post("/users/:id/restore", async (req, res) => {
  try {
    const target = await prisma.user.findFirst({ where: { id: req.params.id, deletedAt: { not: null } } });
    if (!target) {
      res.status(404).json({ error: "Foydalanuvchi arxivda topilmadi" });
      return;
    }
    await prisma.user.update({ where: { id: target.id }, data: { deletedAt: null, blocked: false, blockedAt: null } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "user.restore",
      targetType: "user",
      targetId: req.params.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Foydalanuvchi tiklanmadi" });
  }
});

// POST /api/admin/users/bulk - block/unblock/delete/restore many users.
adminRouter.post("/users/bulk", validateBody(bulkUsersSchema), async (req, res) => {
  try {
    const body = res.locals.body as BulkUsers;
    const ip = clientIp(req.headers);
    const admins = await prisma.user.findMany({
      where: { id: { in: body.ids }, role: "ADMIN" },
      select: { id: true },
    });
    const adminIds = new Set(admins.map((a) => a.id));
    const ids = body.ids.filter((id) => !adminIds.has(id));
    let count = 0;
    if (body.action === "block") {
      const r = await prisma.user.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { blocked: true, blockedAt: new Date() },
      });
      count = r.count;
      for (const id of ids) void bus.publish("admin:user-block", { userId: id });
    } else if (body.action === "unblock") {
      const r = await prisma.user.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { blocked: false, blockedAt: null },
      });
      count = r.count;
    } else if (body.action === "delete") {
      const r = await prisma.user.updateMany({
        where: { id: { in: ids }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      count = r.count;
    } else {
      const r = await prisma.user.updateMany({
        where: { id: { in: ids }, deletedAt: { not: null } },
        data: { deletedAt: null, blocked: false, blockedAt: null },
      });
      count = r.count;
    }
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: `user.${body.action}.bulk`,
      targetType: "user",
      detail: `${count} ta foydalanuvchi ${body.action} qilindi`,
      ip,
    });
    res.json({ ok: true, count });
  } catch {
    res.status(500).json({ error: "Amal bajarilmadi" });
  }
});

// ---------------------------------------------------------------------------
// Hashtags
// ---------------------------------------------------------------------------

// GET /api/admin/tags?q= - all hashtags with quote counts.
adminRouter.get("/tags", async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Prisma.TagWhereInput = q ? { name: { contains: q, mode: "insensitive" } } : {};
    const tags = await prisma.tag.findMany({
      where,
      include: { _count: { select: { quotes: { where: { deletedAt: null } } } } },
      orderBy: { name: "asc" },
      take: 300,
    });
    res.json({ tags: tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug, quoteCount: t._count.quotes })) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// PATCH /api/admin/tags/:id - rename a hashtag.
adminRouter.patch("/tags/:id", validateBody(tagUpdateSchema), async (req, res) => {
  try {
    const body = res.locals.body as TagUpdate;
    const slug = slugify(normalizeTagName(body.name) ?? "");
    if (!slug) {
      res.status(400).json({ error: "Heshteg nomi bo'sh bo'lishi mumkin emas" });
      return;
    }
    const existing = await prisma.tag.findUnique({ where: { slug } });
    if (existing && existing.id !== req.params.id) {
      res.status(409).json({ error: "Bunday heshteg allaqachon mavjud" });
      return;
    }
    const tag = await prisma.tag.update({
      where: { id: req.params.id },
      data: { name: body.name, slug },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "tag.edit",
      targetType: "tag",
      targetId: tag.id,
      detail: tag.name,
      ip: clientIp(req.headers),
    });
    res.json({ tag });
  } catch {
    res.status(500).json({ error: "Heshteg tahrirlanmadi" });
  }
});

// DELETE /api/admin/tags/:id - permanently remove a hashtag (detaches from quotes).
adminRouter.delete("/tags/:id", async (req, res) => {
  try {
    const tag = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!tag) {
      res.status(404).json({ error: "Heshteg topilmadi" });
      return;
    }
    await prisma.tag.delete({ where: { id: tag.id } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "tag.delete",
      targetType: "tag",
      targetId: tag.id,
      detail: tag.name,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Heshteg o'chirilmadi" });
  }
});

// ---------------------------------------------------------------------------
// Content manager
// ---------------------------------------------------------------------------

// GET /api/admin/content - all editable content blocks.
adminRouter.get("/content", async (_req, res) => {
  try {
    res.json({ blocks: await listContent() });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// PUT /api/admin/content/:key - update a content block.
adminRouter.put("/content/:key", validateBody(contentUpdateSchema), async (req, res) => {
  try {
    const body = res.locals.body as ContentUpdate;
    const existing = await getContent(req.params.key);
    if (!existing) {
      res.status(404).json({ error: "Kontent bloki topilmadi" });
      return;
    }
    const block = await prisma.contentBlock.update({
      where: { key: existing.key },
      data: { value: body.value, title: body.title ?? existing.title },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "content.update",
      targetType: "content",
      targetId: block.key,
      ip: clientIp(req.headers),
    });
    res.json({ block });
  } catch {
    res.status(500).json({ error: "Kontent saqlanmadi" });
  }
});

// ---------------------------------------------------------------------------
// Audit log & bans
// ---------------------------------------------------------------------------

// GET /api/admin/audit-logs?limit= - persistent audit trail of admin actions.
adminRouter.get("/audit-logs", async (req, res) => {
  try {
    const limit = Math.min(300, Math.max(1, Number(req.query.limit) || 100));
    const logs = await prisma.adminLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    res.json({ logs });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/logs - recent in-memory live logs.
adminRouter.get("/logs", (_req, res) => {
  res.json({ logs: recentLogs(200) });
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
