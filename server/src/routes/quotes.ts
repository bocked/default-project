import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireVerified } from "../middleware/auth.js";
import { quoteCreateLimiter } from "../lib/rateLimit.js";
import { normalizeTagName, slugify } from "../lib/categories.js";
import { sendModerationMessage } from "../lib/telegram.js";
import { addLog } from "../lib/logstore.js";
import { recordActivity } from "../lib/activity.js";
import { validateBody, quoteCreateSchema, type QuoteCreate } from "../schemas.js";

export const quotesRouter = Router();

const quoteInclude = {
  category: { select: { id: true, name: true, slug: true } },
  tags: { select: { id: true, name: true, slug: true } },
  _count: { select: { likes: true } },
} satisfies Prisma.QuoteInclude;

interface PublicQuote {
  id: string;
  text: string;
  displayAuthor: string;
  anonymous: boolean;
  telegramUrl: string | null;
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

// GET /api/quotes - public feed of APPROVED quotes with filters
quotesRouter.get("/", async (req, res) => {
  try {
    const { page, limit, skip } = pagination(req.query);
    const where: Prisma.QuoteWhereInput = { status: "APPROVED" };
    const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
    if (category) where.category = { slug: category };
    const tag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";
    if (tag) where.tags = { some: { slug: tag } };
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q) where.OR = searchWhere(q).OR;

    const [quotes, total] = await Promise.all([
      prisma.quote.findMany({
        where,
        include: quoteInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.quote.count({ where }),
    ]);

    // Best-effort view counter so "most read" analytics works.
    const ids = quotes.map((quote) => quote.id);
    if (ids.length > 0) {
      void prisma.quote
        .updateMany({ where: { id: { in: ids } }, data: { views: { increment: 1 } } })
        .catch(() => {});
    }

    const userId = (req as import("express").Request & { user?: { id: string } }).user?.id;
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
quotesRouter.get("/search", async (req, res) => {
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

// POST /api/quotes - submit a new quote (stored as PENDING)
quotesRouter.post("/", quoteCreateLimiter, requireAuth, requireVerified, validateBody(quoteCreateSchema), async (req, res) => {
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

    const quote = await prisma.quote.create({
      data: {
        text: body.text,
        displayAuthor,
        anonymous: body.anonymous,
        telegramUrl: body.telegramUrl ?? null,
        userId: req.user!.id,
        categoryId: category.id,
        tags: {
          connectOrCreate: tagData.map((t) => ({
            where: { slug: t.slug },
            create: { name: t.name, slug: t.slug },
          })),
        },
      },
      include: quoteInclude,
    });

    const messageId = await sendModerationMessage({ quote, author: req.user!, category, tags: quote.tags });
    if (messageId !== null) {
      await prisma.quote.update({ where: { id: quote.id }, data: { telegramMessageId: messageId } });
    }
    addLog("info", `Yangi iqtibos: ${quote.text.slice(0, 40)}... (${req.user!.email})`);
    void recordActivity({ userId: req.user!.id, action: "QUOTE_CREATE", detail: quote.text.slice(0, 80), targetId: quote.id });
    res.status(201).json({ quote });
  } catch {
    res.status(500).json({ error: "Iqtibos saqlanmadi" });
  }
});

// POST /api/quotes/:id/like - like an approved quote (idempotent).
quotesRouter.post("/:id/like", requireAuth, async (req, res) => {
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
quotesRouter.delete("/:id/like", requireAuth, async (req, res) => {
  try {
    await prisma.quoteLike.deleteMany({
      where: { userId: req.user!.id, quoteId: req.params.id },
    });
    res.json({ ok: true, liked: false });
  } catch {
    res.status(500).json({ error: "Layk o'chirilmadi" });
  }
});
