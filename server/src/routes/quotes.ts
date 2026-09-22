import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireFullUser } from "../middleware/auth.js";
import { quoteCreateLimiter, likeLimiter, searchLimiter } from "../lib/rateLimit.js";
import { clientIp } from "../lib/ip.js";
import { isBotUserAgent, viewDedupe } from "../lib/views.js";
import { normalizeTagName, slugify } from "../lib/categories.js";
import { sendModerationMessage } from "../lib/telegram.js";
import { addLog } from "../lib/logstore.js";
import { recordActivity } from "../lib/activity.js";
import { validateBody, quoteCreateSchema, type QuoteCreate } from "../schemas.js";
import { cachedGet, invalidateCaches, CACHE_PREFIXES } from "../lib/redisCache.js";
import { getContent } from "../lib/content.js";
import { isPremiumActive } from "../lib/premium.js";

export const quotesRouter = Router();

const quoteInclude = {
  category: { select: { id: true, name: true, slug: true } },
  tags: { select: { id: true, name: true, slug: true } },
  user: { select: { isPremium: true, premiumExpiresAt: true } },
  _count: { select: { likes: true } },
} satisfies Prisma.QuoteInclude;

interface PublicQuote {
  id: string;
  text: string;
  displayAuthor: string;
  anonymous: boolean;
  telegramUrl: string | null;
  authorPremium: boolean;
  createdAt: Date;
  views: number;
  likeCount: number;
  likedByMe: boolean;
  category: { id: string; name: string; slug: string };
  tags: { id: string; name: string; slug: string }[];
}

function toPublicQuote(q: any, userId?: string): PublicQuote {
  const likeCount = Array.isArray(q._count) ? 0 : (q._count?.likes ?? 0);
  const likedByMe = userId
    ? Array.isArray(q.likes)
      ? q.likes.length > 0
      : Array.isArray(q.likedByMe)
        ? q.likedByMe.length > 0
        : false
    : false;
  return {
    id: q.id,
    text: q.text,
    displayAuthor: q.displayAuthor,
    anonymous: q.anonymous,
    telegramUrl: q.telegramUrl ?? null,
    authorPremium: isPremiumActive(q.user ?? { isPremium: false }),
    createdAt: q.createdAt,
    views: q.views ?? 0,
    likeCount,
    likedByMe,
    category: q.category,
    tags: q.tags,
  };
}

function searchWhere(q: string): Prisma.QuoteWhereInput {
  return {
    OR: [
      { text: { contains: q, mode: "insensitive" } },
      { displayAuthor: { contains: q, mode: "insensitive" } },
      { category: { name: { contains: q, mode: "insensitive" } } },
      { tags: { some: { name: { contains: q, mode: "insensitive" } } } },
    ],
  };
}

function pagination(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export type QuoteSort = "newest" | "most-liked" | "most-viewed";

/** Maps the public `sort` query param onto a Prisma orderBy. Falls back to
 *  newest (createdAt desc) for unknown or absent values. */
function sortOrder(query: Record<string, unknown>): Prisma.QuoteOrderByWithRelationInput[] {
  const raw = typeof query.sort === "string" ? query.sort.trim() : "";
  switch (raw) {
    case "most-liked":
      return [{ likes: { _count: "desc" } }, { createdAt: "desc" }];
    case "most-viewed":
      return [{ views: "desc" }, { createdAt: "desc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }];
  }
}

// GET /api/quotes - public feed of APPROVED quotes with filters
quotesRouter.get("/", searchLimiter, async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const where: Prisma.QuoteWhereInput = { status: "APPROVED" };
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    if (category) where.category = { slug: category };
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";
    if (tag) where.tags = { some: { slug: tag } };
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q) where.OR = searchWhere(q).OR;

    const orderBy = sortOrder(req.query);

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: quoteInclude,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.quote.count({ where }),
    ]);

    const ids = quotes.map((quote) => quote.id);
    const userId = (req as import("express").Request & { user?: { id: string } }).user?.id;

    // Real, human, deduplicated view counting: one view per visitor per quote
    // per 24h. Bots, refreshes and repeat fetches never inflate the counter.
    if (ids.length > 0 && !isBotUserAgent(req.headers["user-agent"])) {
      const visitor = userId ? `u:${userId}` : `ip:${clientIp(req.headers)}`;
      const fresh = await viewDedupe.countFresh(ids.map((id) => `${visitor}:${id}`));
      const freshIds = ids.filter((_, i) => fresh[i]);
      if (freshIds.length > 0) {
        void prisma.quote
          .updateMany({ where: { id: { in: freshIds } }, data: { views: { increment: 1 } } })
          .catch(() => {});
      }
    }

    const liked = userId
      ? new Set(
          (
            await prisma.quoteLike.findMany({
              where: { userId, quoteId: { in: ids } },
              select: { quoteId: true },
            })
          ).map((l) => l.quoteId)
        )
      : new Set<string>();

    res.json({
      quotes: quotes.map((quote) => toPublicQuote({ ...quote, likedByMe: liked.has(quote.id) }, userId)),
      total,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/quotes/search - case-insensitive full search over approved quotes
quotesRouter.get("/search", searchLimiter, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      res.status(400).json({ error: "q parametri talab qilinadi" });
      return;
    }
    const quotes = await prisma.quote.findMany({
      where: { status: "APPROVED", OR: searchWhere(q).OR },
      include: quoteInclude,
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ quotes: quotes.map((quote) => toPublicQuote(quote)), total: quotes.length });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/quotes/today - deterministic "quote of the day". The admin can pin
// a specific quote via the `quote.today` content block (its value = quote id);
// otherwise one quote is picked deterministically from the most-liked pool so
// the same quote shows all day without extra database work.
quotesRouter.get("/today", async (_req, res) => {
  try {
    const day = new Date().toISOString().slice(0, 10);
    res.json({ date: day, quote: await quoteOfTheDay() });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

async function quoteOfTheDay(): Promise<PublicQuote | null> {
  return cachedGet(CACHE_PREFIXES.quoteOfDay, todayKey(), 6 * 60 * 60 * 1000, fetchQuoteOfTheDay);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchQuoteOfTheDay(): Promise<PublicQuote | null> {
  const override = await getContent("quote.today");
  if (override && override.value.trim()) {
    // `__none__` is a sentinel: admins can remove the auto-picked quote of the
    // day entirely (nothing is shown until a quote is pinned again).
    if (override.value.trim() === "__none__") return null;
    const pinned = await prisma.quote.findFirst({
      where: { id: override.value.trim(), status: "APPROVED", deletedAt: null },
      include: quoteInclude,
    });
    if (pinned) return toPublicQuote(pinned);
  }

  const dayNumber = Math.floor(Date.now() / 86_400_000);
  const candidates = await prisma.quote.findMany({
    where: { status: "APPROVED", deletedAt: null },
    include: quoteInclude,
    orderBy: [{ likes: { _count: "desc" } }, { createdAt: "desc" }],
    take: 30,
  });
  if (candidates.length === 0) return null;
  return toPublicQuote(candidates[dayNumber % candidates.length]);
}

// GET /api/quotes/mine - the current user's quotes with moderation status
quotesRouter.get("/mine", requireAuth, async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { userId: req.user!.id },
      include: quoteInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json({ quotes });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/quotes - submit a new quote. Quick-login (Telegram-only) accounts
// are blocked until they complete a full registration. requireAuth must run
// before the create limiter so trusted roles can bypass throttling.
quotesRouter.post("/", requireAuth, quoteCreateLimiter, requireFullUser, validateBody(quoteCreateSchema), async (req, res) => {
  const body = res.locals.body as QuoteCreate;
  try {
    const category = await prisma.category.findUnique({ where: { slug: body.categorySlug } });
    if (!category) {
      res.status(400).json({ error: "Bunday bo'lim topilmadi" });
      return;
    }

    // Normalise tag names and dedupe by slug so "Motivatsiya" / "motivatsiya"
    // never collide on the unique slug column.
    const bySlug = new Map<string, string>();
    for (const raw of body.tags) {
      const name = normalizeTagName(raw);
      if (!name) continue;
      bySlug.set(slugify(name), name);
    }
    const tagData = [...bySlug.entries()].slice(0, 5).map(([slug, name]) => ({ slug, name }));

    const displayAuthor = body.anonymous
      ? "Anonim"
      : req.user!.nickname || req.user!.name || "Foydalanuvchi";

    // Fast moderation: admins/super-admins and active premium users skip the
    // admin queue — their quotes go straight to the APPROVED feed.
    const trustedRole = req.user!.role === "ADMIN" || req.user!.role === "SUPER_ADMIN";
    const autoApproved = trustedRole || isPremiumActive(req.user!);

    const quote = await prisma.quote.create({
      data: {
        text: body.text,
        displayAuthor,
        anonymous: body.anonymous,
        telegramUrl: body.telegramUrl ?? null,
        userId: req.user!.id,
        categoryId: category.id,
        status: autoApproved ? "APPROVED" : "PENDING",
        tags: {
          connectOrCreate: tagData.map((t) => ({
            where: { slug: t.slug },
            create: { name: t.name, slug: t.slug },
          })),
        },
      },
      include: quoteInclude,
    });

    if (autoApproved) {
      // The new APPROVED quote can change the feed, counts and daily pick.
      void invalidateCaches([CACHE_PREFIXES.quoteOfDay, CACHE_PREFIXES.catalog]);
      const source = trustedRole
        ? req.user!.role === "SUPER_ADMIN"
          ? "Super admin"
          : "Admin"
        : "VIP";
      addLog("info", `${source} iqtibos avtomatik tasdiqlandi: ${quote.text.slice(0, 40)}... (${req.user!.email ?? req.user!.id})`);
    } else {
      const messageId = await sendModerationMessage({ quote, author: req.user!, category, tags: quote.tags });
      if (messageId !== null) {
        await prisma.quote.update({ where: { id: quote.id }, data: { telegramMessageId: messageId } });
      }
      addLog("info", `Yangi iqtibos: ${quote.text.slice(0, 40)}... (${req.user!.email ?? req.user!.id})`);
    }
    void recordActivity({ userId: req.user!.id, action: "QUOTE_CREATE", detail: quote.text.slice(0, 80), targetId: quote.id });
    res.status(201).json({ quote });
  } catch {
    res.status(500).json({ error: "Iqtibos saqlanmadi" });
  }
});

// GET /api/quotes/:id - one APPROVED quote by id. Used for share deep links
// (the ?quote=<id> URL highlights the quote on the homepage) and for the
// Cloudflare Pages Function that builds link-preview (OpenGraph) tags. Applies
// the same view-count rules as the feed: bots and deduped visitors never
// inflate the counter.
quotesRouter.get("/:id", searchLimiter, async (req, res) => {
  try {
    const userId = (req as import("express").Request & { user?: { id: string } }).user?.id;
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, status: "APPROVED", deletedAt: null },
      include: quoteInclude,
    });
    if (!quote) {
      res.status(404).json({ error: "Iqtibos topilmadi" });
      return;
    }

    if (!isBotUserAgent(req.headers["user-agent"])) {
      const visitor = userId ? `u:${userId}` : `ip:${clientIp(req.headers)}`;
      if (await viewDedupe.shouldCount(`${visitor}:${quote.id}`)) {
        void prisma.quote
          .updateMany({ where: { id: quote.id }, data: { views: { increment: 1 } } })
          .catch(() => {});
      }
    }

    const likedByMe = userId
      ? (await prisma.quoteLike.findUnique({ where: { userId_quoteId: { userId, quoteId: quote.id } } })) !== null
      : false;

    res.json({ quote: toPublicQuote({ ...quote, likedByMe }, userId) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/quotes/:id/like - like an approved quote (idempotent, unique per user).
quotesRouter.post("/:id/like", likeLimiter, requireAuth, async (req, res) => {
  try {
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, status: "APPROVED", deletedAt: null },
    });
    if (!quote) {
      res.status(404).json({ error: "Iqtibos topilmadi" });
      return;
    }
    await prisma.quoteLike.upsert({
      where: { userId_quoteId: { userId: req.user!.id, quoteId: quote.id } },
      update: {},
      create: { userId: req.user!.id, quoteId: quote.id },
    });
    void recordActivity({ userId: req.user!.id, action: "QUOTE_LIKE", detail: quote.text.slice(0, 80), targetId: quote.id });
    res.json({ ok: true, liked: true });
  } catch {
    res.status(500).json({ error: "Layk saqlanmadi" });
  }
});

// DELETE /api/quotes/:id/like - unlike a quote (idempotent).
quotesRouter.delete("/:id/like", likeLimiter, requireAuth, async (req, res) => {
  try {
    await prisma.quoteLike.deleteMany({
      where: { userId: req.user!.id, quoteId: req.params.id },
    });
    res.json({ ok: true, liked: false });
  } catch {
    res.status(500).json({ error: "Layk o'chirilmadi" });
  }
});
