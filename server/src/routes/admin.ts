import { Router } from "express";
import type { Prisma, QuoteStatus, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireSuperAdmin } from "../middleware/adminAuth.js";
import { checkPermission } from "../middleware/permissions.js";
import { recentLogs, addLog } from "../lib/logstore.js";
import { recordAudit } from "../lib/audit.js";
import { onlineCount } from "./api.js";
import { bus } from "../lib/bus.js";
import { config } from "../config.js";
import { adminLimiter } from "../lib/rateLimit.js";
import { editModerationMessage, sendTelegramMessage, telegramEnabled, channelEnabled, publishQuoteToChannel } from "../lib/telegram.js";
import { sendEmail } from "../lib/email.js";
import { notifyQuoteModeration } from "../lib/notify.js";
import { invalidateCaches, CACHE_PREFIXES } from "../lib/redisCache.js";
import { listContent, getContent } from "../lib/content.js";
import { clientIp } from "../lib/ip.js";
import { bulkEffectivePermissions, effectivePermissionsFor, listFeatures } from "../lib/permissionRegistry.js";
import { runPolicyImpactReview, IMPORTANT_SETTING_KEYS } from "../lib/policyImpact.js";
import { todayAnalytics, visitorHistory } from "../lib/analytics.js";
import { normalizeTagName, slugify } from "../lib/categories.js";
import { adminPoliciesRouter } from "./adminPolicies.js";
import { adminQuizzesRouter } from "./adminQuizzes.js";
import { adminEmailsRouter } from "./adminEmails.js";
import { adminTelegramRouter } from "./adminTelegram.js";
import {
  validateBody,
  banCreateSchema,
  adminQuoteRejectSchema,
  quoteEditSchema,
  bulkQuotesSchema,
  bulkUsersSchema,
  userRoleUpdateSchema,
  premiumUpdateSchema,
  tagUpdateSchema,
  categoryUpdateSchema,
  contentUpdateSchema,
  announcementCreateSchema,
  feedbackReplySchema,
  settingsUpdateSchema,
  seoRuleSchema,
  backupCreateSchema,
  telegramBanSchema,
  adminPermissionUpdateSchema,
  type AdminQuoteReject,
  type QuoteEdit,
  type BulkQuotes,
  type BulkUsers,
  type UserRoleUpdate,
  type PremiumUpdate,
  type TagUpdate,
  type CategoryUpdate,
  type ContentUpdate,
  type AnnouncementCreate,
  type FeedbackReply,
  type SettingsUpdate,
  type SeoRuleInput,
  type BackupCreate,
  type TelegramBan,
  type AdminPermissionUpdate,
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

/** Approve/reject/delete/restore changes what shows in the public feed, the
 *  category/tag counts and the cached quote of the day — evict those keys. */
function invalidateQuoteCaches(): void {
  void invalidateCaches([CACHE_PREFIXES.quoteOfDay, CACHE_PREFIXES.catalog]);
}

// ---------------------------------------------------------------------------
// Stats & activity
// ---------------------------------------------------------------------------

// GET /api/admin/stats - dashboard numbers
adminRouter.get("/stats", async (_req, res) => {
  try {
    const [bans, online, pending, approved, rejected, users, deletedQuotes, blockedUsers, today] = await Promise.all([
      prisma.bannedIp.count(),
      Promise.resolve(onlineCount()),
      prisma.quote.count({ where: { status: "PENDING", deletedAt: null } }),
      prisma.quote.count({ where: { status: "APPROVED", deletedAt: null } }),
      prisma.quote.count({ where: { status: "REJECTED", deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.quote.count({ where: { deletedAt: { not: null } } }),
      prisma.user.count({ where: { blocked: true, deletedAt: null } }),
      todayAnalytics(),
    ]);
    res.json({
      bans,
      online,
      quotes: { pending, approved, rejected },
      users,
      deletedQuotes,
      blockedUsers,
      today,
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/stats/visitors?days=30 - daily unique visitors & page views
adminRouter.get("/stats/visitors", async (req, res) => {
  try {
    const days = Math.min(90, Math.max(7, Number(req.query.days) || 30));
    res.json({ days, points: await visitorHistory(days) });
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
adminRouter.get("/quotes", checkPermission("canManageQuotes"), async (req, res) => {
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
adminRouter.post("/quotes/bulk", checkPermission("canManageQuotes"), validateBody(bulkQuotesSchema), async (req, res) => {
  try {
    const body = res.locals.body as BulkQuotes;
    const ip = clientIp(req.headers);
    let count = 0;
    if (body.action === "approve" || body.action === "reject") {
      // Remember which quotes were still PENDING so each owner is notified
      // exactly once (only on the PENDING -> APPROVED/REJECTED transition).
      const before = await prisma.quote.findMany({
        where: { id: { in: body.ids }, deletedAt: null },
        select: { id: true, status: true },
      });
      const pendingIds = before.filter((q) => q.status === "PENDING").map((q) => q.id);

      const result = await prisma.quote.updateMany({
        where: { id: { in: body.ids }, deletedAt: null },
        data:
          body.action === "approve"
            ? { status: "APPROVED", awaitingRejection: false, rejectionReason: null }
            : { status: "REJECTED", rejectionReason: body.reason ?? "Admin tomonidan rad etildi", awaitingRejection: false },
      });
      count = result.count;

      for (const id of pendingIds) {
        void notifyQuoteModeration({
          quoteId: id,
          decision: body.action === "approve" ? "approved" : "rejected",
          reason: body.action === "reject" ? body.reason : undefined,
        });
      }
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
      if (body.action === "approve") {
        // Auto-publish approved quotes (freshly approved or already approved
        // but never posted) to the Telegram channel — those not posted yet.
        const toPublish = await prisma.quote.findMany({
          where: { id: { in: body.ids }, status: "APPROVED", telegramPostedAt: null },
          select: { id: true, text: true, displayAuthor: true },
        });
        for (const q of toPublish) {
          void (async () => {
            try {
              const posted = await publishQuoteToChannel(q);
              if (posted) {
                await prisma.quote.update({ where: { id: q.id }, data: { telegramPostedAt: new Date() } });
                addLog("info", `Iqtibos Telegram kanalga joylandi: ${q.text.slice(0, 40)}...`);
              }
            } catch {
              /* channel failures must never break the bulk action */
            }
          })();
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
    invalidateQuoteCaches();
    res.json({ ok: true, count });
  } catch {
    res.status(500).json({ error: "Amal bajarilmadi" });
  }
});

// POST /api/admin/quotes/:id/approve
adminRouter.post("/quotes/:id/approve", checkPermission("canManageQuotes"), async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    const wasPending = quote.status === "PENDING";
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
    if (wasPending) void notifyQuoteModeration({ quoteId: quote.id, decision: "approved" });
    // First approval auto-publishes the quote to the Telegram channel.
    if (!quote.telegramPostedAt) {
      void (async () => {
        try {
          const posted = await publishQuoteToChannel({ id: quote.id, text: quote.text, displayAuthor: quote.displayAuthor });
          if (posted) {
            await prisma.quote.update({ where: { id: quote.id }, data: { telegramPostedAt: new Date() } });
            addLog("info", `Iqtibos Telegram kanalga joylandi: ${quote.text.slice(0, 40)}...`);
          }
        } catch {
          /* channel failures must never break the approval */
        }
      })();
    }
    invalidateQuoteCaches();
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
adminRouter.post("/quotes/:id/reject", checkPermission("canManageQuotes"), validateBody(adminQuoteRejectSchema), async (req, res) => {
  try {
    const body = res.locals.body as AdminQuoteReject;
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    const wasPending = quote.status === "PENDING";
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
    if (wasPending) void notifyQuoteModeration({ quoteId: quote.id, decision: "rejected", reason: body.reason });
    invalidateQuoteCaches();
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

// POST /api/admin/quotes/:id/post-telegram - publish (or republish) an
// approved quote to the configured Telegram channel.
adminRouter.post("/quotes/:id/post-telegram", checkPermission("canManageQuotes"), async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Iqtibos topilmadi" });
      return;
    }
    if (quote.status !== "APPROVED") {
      res.status(400).json({ error: "Faqat tasdiqlangan iqtiboslarni Telegramga joylash mumkin" });
      return;
    }
    if (!(await channelEnabled())) {
      res.status(400).json({ error: "Telegram kanal sozlanmagan. Admin panel → Telegram sozlamalari bo'limida sozlang." });
      return;
    }
    const posted = await publishQuoteToChannel(quote);
    if (!posted) {
      res.status(502).json({ error: "Telegramga yuborilmadi. Bot kanalga admin qilib qo'shilganini tekshiring." });
      return;
    }
    await prisma.quote.update({ where: { id: quote.id }, data: { telegramPostedAt: new Date() } });
    invalidateQuoteCaches();
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quote.post-telegram",
      targetType: "quote",
      targetId: quote.id,
      detail: quote.text.slice(0, 60),
      ip: clientIp(req.headers),
    });
    addLog("info", `Iqtibos Telegram kanalga joylandi (qo'lda): ${quote.text.slice(0, 40)}...`);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Telegramga joylash bajarilmadi" });
  }
});

// PATCH /api/admin/quotes/:id - edit quote fields (moderation fixes).
adminRouter.patch("/quotes/:id", checkPermission("canManageQuotes"), validateBody(quoteEditSchema), async (req, res) => {
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
    invalidateQuoteCaches();
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

// POST /api/admin/quotes/:id/archive - soft delete (moves to trash). Any admin
// can archive a quote so it can be restored from the trash later.
adminRouter.post("/quotes/:id/archive", checkPermission("canManageQuotes"), async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    await prisma.quote.update({ where: { id: quote.id }, data: { deletedAt: new Date() } });
    invalidateQuoteCaches();
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
    res.status(500).json({ error: "Iqtibos arxivga o'tkazilmadi" });
  }
});

// DELETE /api/admin/quotes/:id - permanently delete a quote. SUPER_ADMIN only
// (a regular ADMIN gets 403). The row is removed from the database entirely
// (likes and tag links cascade), caches are evicted and the action is logged.
adminRouter.delete("/quotes/:id", requireSuperAdmin, async (req, res) => {
  try {
    const quote = await prisma.quote.findUnique({ where: { id: req.params.id } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found" });
      return;
    }
    await prisma.quote.delete({ where: { id: quote.id } });
    invalidateQuoteCaches();
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "quote.delete.hard",
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
adminRouter.post("/quotes/:id/restore", checkPermission("canManageQuotes"), async (req, res) => {
  try {
    const quote = await prisma.quote.findFirst({ where: { id: req.params.id, deletedAt: { not: null } } });
    if (!quote) {
      res.status(404).json({ error: "Quote not found in trash" });
      return;
    }
    await prisma.quote.update({ where: { id: quote.id }, data: { deletedAt: null } });
    invalidateQuoteCaches();
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
  const role = typeof query.role === "string" && ["USER", "ADMIN", "SUPER_ADMIN"].includes(query.role.toUpperCase())
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
    { telegramUsername: { contains: q, mode: "insensitive" } },
  ];
  return where;
}

// GET /api/admin/users?q=&role=&blocked=&deleted= - all users with admin-only details.
adminRouter.get("/users", checkPermission("canViewUsers"), async (req, res) => {
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
          telegramUsername: true,
          phoneNumber: true,
          blocked: true,
          blockedAt: true,
          deletedAt: true,
          isPremium: true,
          premiumExpiresAt: true,
          customWatermark: true,
          isSuperApproved: true,
          superApprovedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      prisma.user.count({ where }),
    ]);
    const permMap = await bulkEffectivePermissions(
      users.filter((u) => u.role === "ADMIN" || u.role === "SUPER_ADMIN").map((u) => ({ id: u.id, role: u.role }))
    );
    res.json({
      users: users.map((u) => ({
        ...u,
        permissions: permMap.get(u.id) ?? {},
      })),
      total,
    });
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
  if (target.role === "ADMIN" || target.role === "SUPER_ADMIN") {
    res.status(400).json({ error: "Admin hisobini bloklash yoki o'chirish mumkin emas" });
    return false;
  }
  return true;
}

// POST /api/admin/users/:id/block
adminRouter.post("/users/:id/block", checkPermission("canManageUsers"), async (req, res) => {
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
adminRouter.post("/users/:id/unblock", checkPermission("canManageUsers"), async (req, res) => {
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
adminRouter.delete("/users/:id", checkPermission("canManageUsers"), async (req, res) => {
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

// PATCH /api/admin/users/:id/role - grant, demote or fully revoke admin rights.
// The chosen role is pinned in `roleOverride`, so config-based auto-promotion
// (ADMIN_EMAILS / SUPER_ADMIN_EMAILS on login and at boot) can never silently
// restore a revoked role. Self-change is blocked; only a SUPER_ADMIN may grant
// or revoke the SUPER_ADMIN role (self-protection: one super admin cannot be
// locked out by a lesser admin).
adminRouter.patch("/users/:id/role", checkPermission("canManageUsers"), validateBody(userRoleUpdateSchema), async (req, res) => {
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
    if ((target.role === "SUPER_ADMIN" || role === "SUPER_ADMIN") && req.admin?.role !== "SUPER_ADMIN" && req.admin?.role !== "ADMIN_PASSWORD") {
      res.status(403).json({ error: "Super admin rolini faqat super admin o'zgartira oladi" });
      return;
    }
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { role, roleOverride: role },
    });
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

// POST /api/admin/users/:id/premium - grant, extend or revoke VIP status.
// `expiresAt` null = lifetime; a past date disables active premium instantly.
adminRouter.post("/users/:id/premium", checkPermission("canManageUsers"), validateBody(premiumUpdateSchema), async (req, res) => {
  try {
    const { isPremium, expiresAt } = res.locals.body as PremiumUpdate;
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        isPremium,
        premiumExpiresAt: isPremium ? (expiresAt ? new Date(expiresAt) : null) : null,
      },
      select: { id: true, isPremium: true, premiumExpiresAt: true },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "user.premium",
      targetType: "user",
      targetId: user.id,
      detail: isPremium ? `VIP berildi (${expiresAt ?? "umrbod"})` : "VIP olib tashlandi",
      ip: clientIp(req.headers),
    });
    res.json({
      ok: true,
      user: { id: user.id, isPremium: user.isPremium, premiumExpiresAt: user.premiumExpiresAt?.toISOString() ?? null },
    });
  } catch {
    res.status(500).json({ error: "VIP holat o'zgartirilmadi" });
  }
});

// POST /api/admin/users/:id/super-approve - SUPER_ADMIN manually verifies a
// user so they can post quotes without the email/phone verification step.
// A regular ADMIN gets 403 — this is the one super-admin-only moderation tool.
adminRouter.post("/users/:id/super-approve", requireSuperAdmin, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    if (target.role === "ADMIN" || target.role === "SUPER_ADMIN") {
      res.status(400).json({ error: "Admin hisobini qo'lda tasdiqlash shart emas" });
      return;
    }
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { isSuperApproved: true, superApprovedAt: new Date() },
      select: { id: true, isSuperApproved: true, superApprovedAt: true },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "user.super-approve",
      targetType: "user",
      targetId: user.id,
      detail: target.email ?? target.telegramUsername ?? target.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true, user: { id: user.id, isSuperApproved: true, superApprovedAt: user.superApprovedAt?.toISOString() ?? null } });
  } catch {
    res.status(500).json({ error: "Foydalanuvchi tasdiqlanmadi" });
  }
});

// DELETE /api/admin/users/:id/super-approve - revoke the manual approval.
adminRouter.delete("/users/:id/super-approve", requireSuperAdmin, async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) {
      res.status(404).json({ error: "Foydalanuvchi topilmadi" });
      return;
    }
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { isSuperApproved: false, superApprovedAt: null },
      select: { id: true, isSuperApproved: true, superApprovedAt: true },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "user.super-unapprove",
      targetType: "user",
      targetId: user.id,
      detail: target.email ?? target.telegramUsername ?? target.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true, user: { id: user.id, isSuperApproved: false, superApprovedAt: null } });
  } catch {
    res.status(500).json({ error: "Tasdiqlash bekor qilinmadi" });
  }
});

// POST /api/admin/users/:id/restore
adminRouter.post("/users/:id/restore", checkPermission("canManageUsers"), async (req, res) => {
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
adminRouter.post("/users/bulk", checkPermission("canManageUsers"), validateBody(bulkUsersSchema), async (req, res) => {
  try {
    const body = res.locals.body as BulkUsers;
    const ip = clientIp(req.headers);
    const admins = await prisma.user.findMany({
      where: { id: { in: body.ids }, role: { in: ["ADMIN", "SUPER_ADMIN"] } },
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
// Sub-admins (dynamic granular RBAC) - SUPER_ADMIN only. Every admin account is
// returned with its effective `permissions` map (feature default + explicit
// Grant overrides). isSuperAdmin is derived from the role, not a stored flag.
// ---------------------------------------------------------------------------

// GET /api/admin/sub-admins - all admin accounts with effective permissions
// and the full feature registry (for the toggle UI).
adminRouter.get("/sub-admins", requireSuperAdmin, async (_req, res) => {
  try {
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        role: true,
        blocked: true,
        createdAt: true,
      },
      orderBy: [{ role: "asc" }, { email: "asc" }],
    });
    const perms = await bulkEffectivePermissions(admins.map((a) => ({ id: a.id, role: a.role })));
    const features = await listFeatures();
    res.json({
      admins: admins.map(({ role, ...a }) => ({
        ...a,
        role,
        isSuperAdmin: role === "SUPER_ADMIN",
        permissions: perms.get(a.id) ?? {},
      })),
      features,
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/features - the full dynamic permission registry.
adminRouter.get("/features", async (_req, res) => {
  try {
    res.json({ features: await listFeatures() });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/admin/me - the acting admin identity + effective permissions. Used
// by the admin panel to gate menus and to render the Sub-admins toggle page.
adminRouter.get("/me", async (req, res) => {
  try {
    const perms = await effectivePermissionsFor({ id: adminId(req), role: req.admin?.role ?? "" });
    const features = await listFeatures();
    res.json({
      admin: {
        id: adminId(req),
        email: adminEmail(req),
        name: (req.admin as { name?: string | null } | undefined)?.name ?? null,
        nickname: (req.admin as { nickname?: string | null } | undefined)?.nickname ?? null,
        role: req.admin?.role ?? null,
        isSuperAdmin: req.admin?.role === "SUPER_ADMIN" || req.admin?.role === "ADMIN_PASSWORD",
        permissions: perms,
      },
      features,
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// PATCH /api/admin/sub-admins/:id/permissions - switch on/off any registered
// feature for a sub-admin ( ADMIN target only — a SUPER_ADMIN always holds
// every permission, so editing theirs is rejected). Grant rows are created only
// when they differ from the feature default; switching back to the default
// removes the row again.
adminRouter.patch(
  "/sub-admins/:id/permissions",
  requireSuperAdmin,
  validateBody(adminPermissionUpdateSchema),
  async (req, res) => {
    try {
      const body = res.locals.body as AdminPermissionUpdate;
      const entries = Object.entries(body.permissions);
      const keys = entries.map(([k]) => k);
      const features = await prisma.adminFeature.findMany({
        where: { key: { in: keys } },
        select: { key: true, defaultEnabled: true },
      });
      if (features.length !== keys.length) {
        res.status(400).json({ error: "Noma'lum ruxsat kalitlari kiritilgan" });
        return;
      }
      const target = await prisma.user.findUnique({ where: { id: req.params.id } });
      if (!target) {
        res.status(404).json({ error: "Admin topilmadi" });
        return;
      }
      if (target.role !== "ADMIN") {
        res.status(400).json({ error: "Ruxsatlar faqat ADMIN rolidagi xodimlar uchun o'zgartiriladi" });
        return;
      }
      if (target.id === adminId(req)) {
        res.status(400).json({ error: "O'zingizning ruxsatlaringizni o'zgartira olmaysiz" });
        return;
      }
      const defaultMap = new Map(features.map((f) => [f.key, f.defaultEnabled]));
      for (const [key, value] of entries) {
        if (value === defaultMap.get(key)) {
          await prisma.adminGrant.deleteMany({ where: { adminId: target.id, featureKey: key } });
        } else {
          await prisma.adminGrant.upsert({
            where: { adminId_featureKey: { adminId: target.id, featureKey: key } },
            update: { enabled: value },
            create: { adminId: target.id, featureKey: key, enabled: value },
          });
        }
      }
      const changed = entries.map(([k, v]) => `${k}=${v}`).join(", ");
      await recordAudit({
        adminId: adminId(req),
        adminEmail: adminEmail(req),
        action: "admin.permissions",
        targetType: "user",
        targetId: target.id,
        detail: `${target.email ?? target.id}: ${changed}`,
        ip: clientIp(req.headers),
      });
      const perms = await effectivePermissionsFor({ id: target.id, role: "ADMIN" });
      // Push the change so open admin panels refresh their menus instantly.
      void bus.publish("admin:permissions:changed", { adminId: target.id, permissions: perms });
      res.json({
        ok: true,
        admin: {
          id: target.id,
          email: target.email,
          role: target.role,
          name: target.name,
          nickname: target.nickname,
          isSuperAdmin: false,
          permissions: perms,
        },
      });
    } catch {
      res.status(500).json({ error: "Ruxsatlar o'zgartirilmadi" });
    }
  },
);

// ---------------------------------------------------------------------------
// Hashtags
// ---------------------------------------------------------------------------

// GET /api/admin/tags?q= - all hashtags with quote counts.
adminRouter.get("/tags", checkPermission("canManageCategories"), async (req, res) => {
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
adminRouter.patch("/tags/:id", checkPermission("canManageCategories"), validateBody(tagUpdateSchema), async (req, res) => {
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
    void invalidateCaches([CACHE_PREFIXES.catalog]);
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
adminRouter.delete("/tags/:id", checkPermission("canManageCategories"), async (req, res) => {
  try {
    const tag = await prisma.tag.findUnique({ where: { id: req.params.id } });
    if (!tag) {
      res.status(404).json({ error: "Heshteg topilmadi" });
      return;
    }
    await prisma.tag.delete({ where: { id: tag.id } });
    void invalidateCaches([CACHE_PREFIXES.catalog]);
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
// Categories
// ---------------------------------------------------------------------------

// GET /api/admin/categories - all categories with quote counts.
adminRouter.get("/categories", checkPermission("canManageCategories"), async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { quotes: { where: { deletedAt: null } } } } },
      orderBy: { name: "asc" },
    });
    res.json({ categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, quoteCount: c._count.quotes })) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/categories - create a new category.
adminRouter.post("/categories", checkPermission("canManageCategories"), validateBody(categoryUpdateSchema), async (req, res) => {
  try {
    const body = res.locals.body as CategoryUpdate;
    const slug = body.slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) {
      res.status(400).json({ error: "Slug bo'sh bo'lishi mumkin emas" });
      return;
    }
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing) {
      res.status(409).json({ error: "Bunday bo'lim allaqachon mavjud" });
      return;
    }
    const category = await prisma.category.create({
      data: { name: body.name.trim(), slug },
    });
    void invalidateCaches([CACHE_PREFIXES.catalog]);
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "category.create",
      targetType: "category",
      targetId: category.id,
      detail: category.name,
      ip: clientIp(req.headers),
    });
    res.json({ category });
  } catch {
    res.status(500).json({ error: "Bo'lim yaratilmadi" });
  }
});

// PATCH /api/admin/categories/:id - rename a category.
adminRouter.patch("/categories/:id", checkPermission("canManageCategories"), validateBody(categoryUpdateSchema), async (req, res) => {
  try {
    const body = res.locals.body as CategoryUpdate;
    const slug = body.slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!slug) {
      res.status(400).json({ error: "Slug bo'sh bo'lishi mumkin emas" });
      return;
    }
    const existing = await prisma.category.findUnique({ where: { slug } });
    if (existing && existing.id !== req.params.id) {
      res.status(409).json({ error: "Bunday bo'lim allaqachon mavjud" });
      return;
    }
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: { name: body.name.trim(), slug },
    });
    void invalidateCaches([CACHE_PREFIXES.catalog]);
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "category.edit",
      targetType: "category",
      targetId: category.id,
      detail: category.name,
      ip: clientIp(req.headers),
    });
    res.json({ category });
  } catch {
    res.status(500).json({ error: "Bo'lim tahrirlanmadi" });
  }
});

// DELETE /api/admin/categories/:id - delete a category (only if no quotes).
adminRouter.delete("/categories/:id", checkPermission("canManageCategories"), async (req, res) => {
  try {
    const category = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!category) {
      res.status(404).json({ error: "Bo'lim topilmadi" });
      return;
    }
    const quoteCount = await prisma.quote.count({ where: { categoryId: category.id, deletedAt: null } });
    if (quoteCount > 0) {
      res.status(400).json({ error: "Bu bo'limda iqtiboslar bor, avval ularni o'chiring yoki boshqa bo'limga ko'chiring" });
      return;
    }
    await prisma.category.delete({ where: { id: category.id } });
    void invalidateCaches([CACHE_PREFIXES.catalog]);
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "category.delete",
      targetType: "category",
      targetId: category.id,
      detail: category.name,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Bo'lim o'chirilmadi" });
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
    // The content manager can pin `quote.today`; refresh the cached pick.
    void invalidateCaches([CACHE_PREFIXES.quoteOfDay]);
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
adminRouter.get("/audit-logs", checkPermission("canViewAudit"), async (req, res) => {
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

// ---------------------------------------------------------------------------
// Top quotes (analytics widget)
// ---------------------------------------------------------------------------

// GET /api/admin/stats/top-quotes?days=30&limit=10 - most read & most liked quotes.
adminRouter.get("/stats/top-quotes", async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const since = new Date(Date.now() - days * DAY);
    const where: Prisma.QuoteWhereInput = { status: "APPROVED", deletedAt: null, createdAt: { gte: since } };
    const [mostRead, mostLiked] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: { category: { select: { id: true, name: true, slug: true } } },
        orderBy: { views: "desc" },
        take: limit,
      }),
      prisma.quote.findMany({
        where,
        include: { _count: { select: { likes: true } }, category: { select: { id: true, name: true, slug: true } } },
        orderBy: { likes: { _count: "desc" } },
        take: limit,
      }),
    ]);
    res.json({
      mostRead: mostRead.map((q) => ({ id: q.id, text: q.text.slice(0, 120), displayAuthor: q.displayAuthor, views: q.views, category: q.category })),
      mostLiked: mostLiked.map((q) => ({ id: q.id, text: q.text.slice(0, 120), displayAuthor: q.displayAuthor, likeCount: q._count.likes, category: q.category })),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Announcements / broadcast
// ---------------------------------------------------------------------------

// GET /api/admin/announcements - list all announcements.
adminRouter.get("/announcements", checkPermission("canManageAnnouncements"), async (req, res) => {
  try {
    const status = typeof req.query.status === "string" && ["ACTIVE", "ARCHIVED"].includes(req.query.status.toUpperCase())
      ? req.query.status.toUpperCase()
      : undefined;
    const announcements = await prisma.announcement.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json({ announcements });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/announcements - create + broadcast to users over the chosen channel.
adminRouter.post("/announcements", checkPermission("canManageAnnouncements"), validateBody(announcementCreateSchema), async (req, res) => {
  try {
    const body = res.locals.body as AnnouncementCreate;
    const announcement = await prisma.announcement.create({
      data: {
        title: body.title,
        message: body.message,
        channel: body.channel,
        status: body.status,
        createdById: adminId(req),
      },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "announcement.create",
      targetType: "announcement",
      targetId: announcement.id,
      detail: body.title,
      ip: clientIp(req.headers),
    });
    if (announcement.status === "ACTIVE" && (body.channel === "ALL" || body.channel === "TELEGRAM")) {
      void broadcastTelegram(announcement.title, announcement.message);
    }
    if (announcement.status === "ACTIVE" && (body.channel === "ALL" || body.channel === "EMAIL")) {
      void broadcastEmail(announcement.title, announcement.message);
    }
    res.status(201).json({ announcement });
  } catch {
    res.status(500).json({ error: "E'lon yaratilmadi" });
  }
});

// PATCH /api/admin/announcements/:id - archive/reactivate.
adminRouter.patch("/announcements/:id", checkPermission("canManageAnnouncements"), async (req, res) => {
  try {
    const status = typeof req.body?.status === "string" && ["ACTIVE", "ARCHIVED"].includes(req.body.status.toUpperCase())
      ? req.body.status.toUpperCase()
      : undefined;
    if (!status) {
      res.status(400).json({ error: "status faqat ACTIVE yoki ARCHIVED bo'lishi mumkin" });
      return;
    }
    const announcement = await prisma.announcement.update({
      where: { id: req.params.id },
      data: { status },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: `announcement.${status.toLowerCase()}`,
      targetType: "announcement",
      targetId: announcement.id,
      detail: announcement.title,
      ip: clientIp(req.headers),
    });
    res.json({ announcement });
  } catch {
    res.status(404).json({ error: "E'lon topilmadi" });
  }
});

// DELETE /api/admin/announcements/:id - permanently remove.
adminRouter.delete("/announcements/:id", checkPermission("canManageAnnouncements"), async (req, res) => {
  try {
    const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id } });
    if (!announcement) {
      res.status(404).json({ error: "E'lon topilmadi" });
      return;
    }
    await prisma.announcement.delete({ where: { id: announcement.id } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "announcement.delete",
      targetType: "announcement",
      targetId: announcement.id,
      detail: announcement.title,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "E'lon o'chirilmadi" });
  }
});

// ---------------------------------------------------------------------------
// Feedback / reports
// ---------------------------------------------------------------------------

const feedbackInclude = {
  user: { select: { id: true, email: true, name: true, nickname: true, telegramId: true } },
} as const;

// GET /api/admin/feedback?status=&category= - all feedback with user info.
adminRouter.get("/feedback", checkPermission("canManageFeedback"), async (req, res) => {
  try {
    const status = typeof req.query.status === "string" && ["OPEN", "IN_PROGRESS", "RESOLVED"].includes(req.query.status.toUpperCase())
      ? req.query.status.toUpperCase()
      : undefined;
    const category = typeof req.query.category === "string" && ["COMPLAINT", "SUGGESTION", "REPORT", "OTHER"].includes(req.query.category.toUpperCase())
      ? req.query.category.toUpperCase()
      : undefined;
    const feedback = await prisma.feedback.findMany({
      where: { ...(status ? { status } : {}), ...(category ? { category } : {}) },
      include: feedbackInclude,
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    res.json({ feedback });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// PATCH /api/admin/feedback/:id - reply / change status.
adminRouter.patch("/feedback/:id", checkPermission("canManageFeedback"), validateBody(feedbackReplySchema), async (req, res) => {
  try {
    const body = res.locals.body as FeedbackReply;
    const item = await prisma.feedback.findUnique({ where: { id: req.params.id } });
    if (!item) {
      res.status(404).json({ error: "Shikoyat topilmadi" });
      return;
    }
    const data: Record<string, unknown> = { status: body.status };
    if (body.adminReply !== undefined && body.adminReply.length > 0) {
      data.adminReply = body.adminReply;
      data.repliedAt = new Date();
    }
    const feedback = await prisma.feedback.update({ where: { id: item.id }, data, include: feedbackInclude });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "feedback.reply",
      targetType: "feedback",
      targetId: feedback.id,
      detail: feedback.text.slice(0, 60),
      ip: clientIp(req.headers),
    });
    res.json({ feedback });
  } catch {
    res.status(500).json({ error: "Javob saqlanmadi" });
  }
});

// DELETE /api/admin/feedback/:id - permanently remove a feedback entry.
adminRouter.delete("/feedback/:id", checkPermission("canManageFeedback"), async (req, res) => {
  try {
    const item = await prisma.feedback.findUnique({ where: { id: req.params.id } });
    if (!item) {
      res.status(404).json({ error: "Shikoyat topilmadi" });
      return;
    }
    await prisma.feedback.delete({ where: { id: item.id } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "feedback.delete",
      targetType: "feedback",
      targetId: item.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Shikoyat o'chirilmadi" });
  }
});

// ---------------------------------------------------------------------------
// Site settings (general + SEO)
// ---------------------------------------------------------------------------

// GET /api/admin/settings - all site settings grouped.
adminRouter.get("/settings", checkPermission("canManageSettings"), async (_req, res) => {
  try {
    const settings = await prisma.siteSetting.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] });
    res.json({ settings });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// PUT /api/admin/settings - upsert settings in bulk. Changing an important
// setting (site name, contact email, social links, ...) triggers a policy
// impact review: a Draft Policy is prepared and the SUPER_ADMIN is pushed.
adminRouter.put("/settings", checkPermission("canManageSettings"), validateBody(settingsUpdateSchema), async (req, res) => {
  try {
    const body = res.locals.body as SettingsUpdate;
    const relevant = body.settings.filter((s) => IMPORTANT_SETTING_KEYS.includes(s.key));
    const changedKeys: string[] = [];
    if (relevant.length > 0) {
      const prior = await prisma.siteSetting.findMany({
        where: { key: { in: relevant.map((s) => s.key) } },
        select: { key: true, value: true },
      });
      const priorMap = new Map(prior.map((p) => [p.key, p.value]));
      for (const s of relevant) {
        if ((priorMap.get(s.key) ?? "") !== s.value) changedKeys.push(s.key);
      }
    }
    await prisma.$transaction(
      body.settings.map((s) =>
        prisma.siteSetting.upsert({
          where: { key: s.key },
          update: { value: s.value, label: s.label, group: s.group },
          create: { key: s.key, value: s.value, label: s.label, group: s.group },
        })
      )
    );
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "settings.update",
      detail: `${body.settings.length} ta sozlama saqlandi`,
      ip: clientIp(req.headers),
    });
    if (changedKeys.length > 0) {
      await runPolicyImpactReview({
        trigger: "setting",
        reason: `Muhim sozlamalar yangilandi: ${changedKeys.join(", ")}`,
        actor: { id: adminId(req), email: adminEmail(req) },
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Sozlamalar saqlanmadi" });
  }
});

// GET /api/admin/seo - all SEO rules.
adminRouter.get("/seo", async (_req, res) => {
  try {
    const rules = await prisma.seoRule.findMany({ orderBy: { page: "asc" } });
    res.json({ rules });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// PUT /api/admin/seo - upsert a SEO rule for a page.
adminRouter.put("/seo", validateBody(seoRuleSchema), async (req, res) => {
  try {
    const body = res.locals.body as SeoRuleInput;
    const rule = await prisma.seoRule.upsert({
      where: { page: body.page },
      update: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.keywords !== undefined ? { keywords: body.keywords } : {}),
      },
      create: { page: body.page, title: body.title ?? null, description: body.description ?? null, keywords: body.keywords ?? null },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "seo.update",
      targetType: "seo",
      targetId: body.page,
      ip: clientIp(req.headers),
    });
    res.json({ rule });
  } catch {
    res.status(500).json({ error: "SEO qoidasi saqlanmadi" });
  }
});

// DELETE /api/admin/seo/:id - remove a SEO rule.
adminRouter.delete("/seo/:id", async (req, res) => {
  try {
    await prisma.seoRule.delete({ where: { id: req.params.id } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "seo.delete",
      targetType: "seo",
      targetId: req.params.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "SEO qoidasi topilmadi" });
  }
});

// ---------------------------------------------------------------------------
// Activity tracker
// ---------------------------------------------------------------------------

// GET /api/admin/activity?userId=&action=&q=&limit= - per-user activity feed.
adminRouter.get("/activity", async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const userId = typeof req.query.userId === "string" ? req.query.userId.trim() : "";
    const action = typeof req.query.action === "string" ? req.query.action.trim().toUpperCase() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Prisma.UserActivityWhereInput = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (q) where.user = { OR: [{ email: { contains: q, mode: "insensitive" } }, { nickname: { contains: q, mode: "insensitive" } }] };
    const [activities, total] = await Promise.all([
      prisma.userActivity.findMany({
        where,
        include: { user: { select: { id: true, email: true, name: true, nickname: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.userActivity.count({ where }),
    ]);
    res.json({ activities, total });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// ---------------------------------------------------------------------------
// Backups
// ---------------------------------------------------------------------------

async function backupSnapshot(): Promise<Record<string, unknown>> {
  const [users, quotes, categories, tags, content, settings, seo, announcements, feedback] = await Promise.all([
    // Safest possible DTO: credentials (passwordHash, refreshTokenHash), the
    // private phone/Telegram identifiers and every verification digest are
    // excluded, so a downloaded or restored backup can never leak secrets.
    // Only non-sensitive profile/dashboard fields are persisted.
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        nickname: true,
        role: true,
        roleOverride: true,
        emailVerified: true,
        phoneVerified: true,
        quickLogin: true,
        isPremium: true,
        premiumExpiresAt: true,
        customWatermark: true,
        isSuperApproved: true,
        superApprovedAt: true,
        acceptedTermsVersion: true,
        avatarUrl: true,
        blocked: true,
        blockedAt: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.quote.findMany({ include: { tags: { select: { id: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.contentBlock.findMany({ orderBy: { key: "asc" } }),
    prisma.siteSetting.findMany({ orderBy: { key: "asc" } }),
    prisma.seoRule.findMany({ orderBy: { page: "asc" } }),
    prisma.announcement.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.feedback.findMany({ orderBy: { createdAt: "asc" } }),
  ]);
  return { createdAt: new Date().toISOString(), version: 1, users, quotes, categories, tags, content, settings, seo, announcements, feedback };
}

// GET /api/admin/backups - list created backups.
adminRouter.get("/backups", async (_req, res) => {
  try {
    const backups = await prisma.backup.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    res.json({
      backups: backups.map((b) => ({ id: b.id, label: b.label, size: b.size, createdAt: b.createdAt })),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/backups - create a JSON snapshot.
adminRouter.post("/backups", validateBody(backupCreateSchema), async (req, res) => {
  try {
    const body = res.locals.body as BackupCreate;
    const data = JSON.stringify(await backupSnapshot());
    const backup = await prisma.backup.create({
      data: { label: body.label, data, size: Buffer.byteLength(data, "utf8"), createdById: adminId(req) },
    });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "backup.create",
      targetType: "backup",
      targetId: backup.id,
      detail: body.label,
      ip: clientIp(req.headers),
    });
    res.status(201).json({ backup: { id: backup.id, label: backup.label, size: backup.size, createdAt: backup.createdAt } });
  } catch {
    res.status(500).json({ error: "Zaxira yaratilmadi" });
  }
});

// GET /api/admin/backups/:id - download the raw JSON snapshot. SUPER_ADMIN only
// (the snapshot may contain account data, so a plain ADMIN must not export it).
adminRouter.get("/backups/:id", requireSuperAdmin, async (req, res) => {
  try {
    const backup = await prisma.backup.findUnique({ where: { id: req.params.id } });
    if (!backup) {
      res.status(404).json({ error: "Zaxira topilmadi" });
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="backup-${backup.id}.json"`);
    res.send(backup.data);
  } catch {
    res.status(500).json({ error: "Zaxira yuklab olinmadi" });
  }
});

// POST /api/admin/backups/:id/restore - restore a snapshot (non-destructive upsert).
adminRouter.post("/backups/:id/restore", requireSuperAdmin, async (req, res) => {
  try {
    const backup = await prisma.backup.findUnique({ where: { id: req.params.id } });
    if (!backup) {
      res.status(404).json({ error: "Zaxira topilmadi" });
      return;
    }
    const snapshot = JSON.parse(backup.data) as Record<string, any>;
    const counts: Record<string, number> = {};
    if (Array.isArray(snapshot.categories)) {
      for (const c of snapshot.categories) {
        await prisma.category.upsert({ where: { slug: c.slug }, update: { name: c.name }, create: { name: c.name, slug: c.slug } });
      }
      counts.categories = snapshot.categories.length;
    }
    if (Array.isArray(snapshot.tags)) {
      for (const t of snapshot.tags) {
        await prisma.tag.upsert({ where: { slug: t.slug }, update: { name: t.name }, create: { name: t.name, slug: t.slug } });
      }
      counts.tags = snapshot.tags.length;
    }
    if (Array.isArray(snapshot.content)) {
      for (const b of snapshot.content) {
        await prisma.contentBlock.upsert({
          where: { key: b.key },
          update: { value: b.value, title: b.title },
          create: { key: b.key, value: b.value, title: b.title },
        });
      }
      counts.content = snapshot.content.length;
    }
    if (Array.isArray(snapshot.settings)) {
      for (const s of snapshot.settings) {
        await prisma.siteSetting.upsert({
          where: { key: s.key },
          update: { value: s.value, label: s.label, group: s.group },
          create: { key: s.key, value: s.value, label: s.label, group: s.group },
        });
      }
      counts.settings = snapshot.settings.length;
    }
    if (Array.isArray(snapshot.seo)) {
      for (const r of snapshot.seo) {
        await prisma.seoRule.upsert({
          where: { page: r.page },
          update: { title: r.title, description: r.description, keywords: r.keywords },
          create: { page: r.page, title: r.title, description: r.description, keywords: r.keywords },
        });
      }
      counts.seo = snapshot.seo.length;
    }
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "backup.restore",
      targetType: "backup",
      targetId: backup.id,
      detail: backup.label,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true, restored: counts });
  } catch {
    res.status(500).json({ error: "Zaxira tiklanmadi" });
  }
});

// DELETE /api/admin/backups/:id - remove a backup.
adminRouter.delete("/backups/:id", requireSuperAdmin, async (req, res) => {
  try {
    await prisma.backup.delete({ where: { id: req.params.id } });
    await recordAudit({
      adminId: adminId(req),
      adminEmail: adminEmail(req),
      action: "backup.delete",
      targetType: "backup",
      targetId: req.params.id,
      ip: clientIp(req.headers),
    });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Zaxira topilmadi" });
  }
});

// ---------------------------------------------------------------------------
// Telegram-ID blacklist (user account level)
// ---------------------------------------------------------------------------

// GET /api/admin/bans/telegram - users currently blocked via the Telegram blacklist.
adminRouter.get("/bans/telegram", checkPermission("canViewUsers"), async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const where: Prisma.UserWhereInput = { blocked: true, telegramId: { not: null } };
    if (q) where.OR = [{ telegramId: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        nickname: true,
        name: true,
        telegramId: true,
        blockedAt: true,
        createdAt: true,
      },
      orderBy: { blockedAt: "desc" },
      take: 300,
    });
    res.json({ users });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/admin/bans/telegram - block the account(s) linked to a Telegram ID.
adminRouter.post("/bans/telegram", checkPermission("canManageUsers"), validateBody(telegramBanSchema), async (_req, res) => {
  try {
    const body = res.locals.body as TelegramBan;
    const result = await prisma.user.updateMany({
      where: { telegramId: body.telegramId },
      data: { blocked: true, blockedAt: new Date() },
    });
    if (result.count === 0) {
      res.status(404).json({ error: "Bunday Telegram ID'li foydalanuvchi topilmadi" });
      return;
    }
    await bus.publish("admin:user-block", { telegramId: body.telegramId });
    addLog("ban", `Telegram ID ${body.telegramId} blocked (${result.count} hisob)`);
    res.json({ ok: true, count: result.count });
  } catch {
    res.status(500).json({ error: "Bloklash amalga oshmadi" });
  }
});

// DELETE /api/admin/bans/telegram/:userId - unblock an account.
adminRouter.delete("/bans/telegram/:userId", checkPermission("canManageUsers"), async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { blocked: false, blockedAt: null },
    });
    addLog("info", `User ${req.params.userId} unblocked`);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
  }
});

// ---------------------------------------------------------------------------
// Broadcast helpers
// ---------------------------------------------------------------------------

async function broadcastTelegram(title: string, message: string): Promise<number> {
  if (!(await telegramEnabled())) return 0;
  const users = await prisma.user.findMany({
    where: { telegramId: { not: null }, deletedAt: null, blocked: false },
    select: { telegramId: true },
  });
  const text = `📢 ${title}\n\n${message}`;
  let sent = 0;
  for (const u of users) {
    if (u.telegramId) {
      const ok = await sendTelegramMessage(u.telegramId, text);
      if (ok) sent += 1;
    }
  }
  addLog("info", `Telegram e'lon: ${title} -> ${sent}/${users.length} foydalanuvchi`);
  return sent;
}

async function broadcastEmail(title: string, message: string): Promise<number> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, blocked: false, email: { not: null } },
    select: { email: true },
  });
  const text = `${title}\n\n${message}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">${title}</h2>
    <p style="color:#334155;line-height:1.6;white-space:pre-wrap">${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
  </div>`;
  let sent = 0;
  for (const u of users) {
    if (!u.email) continue;
    const ok = (await sendEmail({ to: u.email, subject: `Iqtibosim — ${title}`, text, html })).ok;
    if (ok) sent += 1;
  }
  addLog("info", `Email e'lon: ${title} -> ${sent}/${users.length} foydalanuvchi`);
  return sent;
}

// ---------------------------------------------------------------------------
// Legal policies & quiz moderation (subrouters mounted here so they inherit
// `adminLimiter` + `requireAdmin` from the top of this router).
// ---------------------------------------------------------------------------

adminRouter.use("/policies", adminPoliciesRouter);
adminRouter.use("/quizzes", adminQuizzesRouter);
adminRouter.use("/emails", adminEmailsRouter);
adminRouter.use("/telegram", adminTelegramRouter);
