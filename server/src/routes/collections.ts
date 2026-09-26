import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { collectionLimiter, searchLimiter } from "../lib/rateLimit.js";
import { addLog } from "../lib/logstore.js";
import { recordActivity } from "../lib/activity.js";
import {
  validateBody,
  collectionCreateSchema,
  collectionUpdateSchema,
  collectionQuoteSchema,
  type CollectionCreate,
  type CollectionUpdate,
  type CollectionQuoteInput,
} from "../schemas.js";
import { quoteInclude, toPublicQuote, type PublicQuote } from "./quotes.js";

export const collectionsRouter = Router();

/** Public shape of one collection: meta + a small preview of its quotes. */
interface PublicCollection {
  id: string;
  title: string;
  description: string | null;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
  quoteCount: number;
  previewQuotes: PublicQuote[];
  /** Owner id + display info (shown on public collections). */
  ownerId: string;
  owner: { id: string; nickname: string | null; name: string | null; avatarUrl: string | null } | null;
}

const collectionOwner = {
  select: { id: true, nickname: true, name: true, avatarUrl: true },
};

async function serializeCollection(col: any, viewerId?: string): Promise<PublicCollection> {
  const quoteItems = Array.isArray(col.quotes)
    ? col.quotes.map((cq: { quote?: any; addedAt: Date }) => cq.quote).filter(Boolean)
    : [];
  const likeCounts = Array.isArray(col._count) ? 0 : (col._count?.quotes ?? 0);
  return {
    id: col.id,
    title: col.title,
    description: col.description ?? null,
    isPrivate: col.isPrivate,
    createdAt: col.createdAt,
    updatedAt: col.updatedAt,
    quoteCount: likeCounts || quoteItems.length || 0,
    previewQuotes: quoteItems
      .slice(0, 3)
      .map((q: any) => toPublicQuote(q, viewerId)),
    ownerId: col.userId,
    owner: col.user ? { id: col.user.id, nickname: col.user.nickname, name: col.user.name, avatarUrl: col.user.avatarUrl } : null,
  };
}

// GET /api/collections/mine - the current user's collections ("Kolleksiyalarim").
collectionsRouter.get("/mine", requireAuth, async (req, res) => {
  try {
    const collections = await prisma.collection.findMany({
      where: { userId: req.user!.id },
      include: {
        quotes: {
          orderBy: { addedAt: "desc" },
          take: 3,
          include: { quote: { include: quoteInclude } },
        },
        user: collectionOwner,
        _count: { select: { quotes: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      collections: await Promise.all(
        collections.map((c) => serializeCollection(c, req.user!.id))
      ),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/collections/public - public collections from everyone, newest first.
collectionsRouter.get("/public", searchLimiter, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const viewerId = (req as import("express").Request & { user?: { id: string } }).user?.id;
    const [collections, total] = await Promise.all([
      prisma.collection.findMany({
        where: { isPrivate: false },
        include: {
          quotes: {
            where: { quote: { status: "APPROVED", deletedAt: null } },
            orderBy: { addedAt: "desc" },
            take: 3,
            include: { quote: { include: quoteInclude } },
          },
          user: collectionOwner,
          _count: { select: { quotes: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.collection.count({ where: { isPrivate: false } }),
    ]);
    res.json({
      collections: await Promise.all(
        collections.map((c) => serializeCollection(c, viewerId))
      ),
      total,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/collections - create a new collection (authenticated).
collectionsRouter.post("/", requireAuth, collectionLimiter, validateBody(collectionCreateSchema), async (req, res) => {
  const body = res.locals.body as CollectionCreate;
  try {
    const collection = await prisma.collection.create({
      data: {
        userId: req.user!.id,
        title: body.title,
        description: body.description ?? null,
        isPrivate: body.isPrivate,
      },
      include: { quotes: { include: { quote: { include: quoteInclude } } }, user: collectionOwner },
    });
    addLog("info", `Yangi to'plam: "${body.title}" (${req.user!.email ?? req.user!.id})`);
    void recordActivity({ userId: req.user!.id, action: "COLLECTION_CREATE", detail: body.title, targetId: collection.id });
    res.status(201).json({ collection: await serializeCollection(collection, req.user!.id) });
  } catch {
    res.status(500).json({ error: "To'plam yaratilmadi" });
  }
});

/** Finds a collection by id and enforces ownership for mutation routes. */
async function findOwnedCollection(id: string, userId: string) {
  const collection = await prisma.collection.findUnique({ where: { id } });
  if (!collection || collection.userId !== userId) return null;
  return collection;
}

// PATCH /api/collections/:id - rename / describe / toggle privacy (owner only).
collectionsRouter.patch("/:id", requireAuth, collectionLimiter, validateBody(collectionUpdateSchema), async (req, res) => {
  const body = res.locals.body as CollectionUpdate;
  try {
    const collection = await findOwnedCollection(req.params.id, req.user!.id);
    if (!collection) {
      res.status(404).json({ error: "To'plam topilmadi" });
      return;
    }
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description ?? null;
    if (body.isPrivate !== undefined) data.isPrivate = body.isPrivate;
    const updated = await prisma.collection.update({
      where: { id: collection.id },
      data,
      include: { quotes: { include: { quote: { include: quoteInclude } } }, user: collectionOwner },
    });
    res.json({ collection: await serializeCollection(updated, req.user!.id) });
  } catch {
    res.status(500).json({ error: "To'plam yangilanmadi" });
  }
});

// DELETE /api/collections/:id - delete a collection (owner only).
collectionsRouter.delete("/:id", requireAuth, collectionLimiter, async (req, res) => {
  try {
    const collection = await findOwnedCollection(req.params.id, req.user!.id);
    if (!collection) {
      res.status(404).json({ error: "To'plam topilmadi" });
      return;
    }
    await prisma.collection.delete({ where: { id: collection.id } });
    addLog("info", `To'plam o'chirildi: "${collection.title}" (${req.user!.email ?? req.user!.id})`);
    void recordActivity({ userId: req.user!.id, action: "COLLECTION_DELETE", detail: collection.title, targetId: collection.id });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "To'plam o'chirilmadi" });
  }
});

// GET /api/collections/:id - open one collection. Private collections only
// answer to their owner; public ones are viewable by anyone.
collectionsRouter.get("/:id", optionalAuth, async (req, res) => {
  try {
    const viewerId = (req as import("express").Request & { user?: { id: string } }).user?.id;
    const collection = await prisma.collection.findUnique({
      where: { id: req.params.id },
      include: {
        quotes: {
          where: { quote: { status: "APPROVED", deletedAt: null } },
          orderBy: { addedAt: "desc" },
          take: 100,
          include: { quote: { include: quoteInclude } },
        },
        user: collectionOwner,
        _count: { select: { quotes: true } },
      },
    });
    if (!collection || (collection.isPrivate && collection.userId !== viewerId)) {
      res.status(404).json({ error: "To'plam topilmadi" });
      return;
    }
    res.json({ collection: await serializeCollection(collection, viewerId ?? collection.userId) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/collections/:id/quotes - bookmark a quote into the collection
// (owner only, idempotent).
collectionsRouter.post("/:id/quotes", requireAuth, collectionLimiter, validateBody(collectionQuoteSchema), async (req, res) => {
  const body = res.locals.body as CollectionQuoteInput;
  try {
    const collection = await findOwnedCollection(req.params.id, req.user!.id);
    if (!collection) {
      res.status(404).json({ error: "To'plam topilmadi" });
      return;
    }
    const quote = await prisma.quote.findFirst({
      where: { id: body.quoteId, status: "APPROVED", deletedAt: null },
    });
    if (!quote) {
      res.status(404).json({ error: "Iqtibos topilmadi" });
      return;
    }
    await prisma.collectionQuote.upsert({
      where: { collectionId_quoteId: { collectionId: collection.id, quoteId: quote.id } },
      update: {},
      create: { collectionId: collection.id, quoteId: quote.id },
    });
    void recordActivity({ userId: req.user!.id, action: "COLLECTION_ADD_QUOTE", detail: collection.title, targetId: quote.id });
    res.json({ ok: true, added: true });
  } catch {
    res.status(500).json({ error: "Iqtibos to'plamga qo'shilmadi" });
  }
});

// DELETE /api/collections/:id/quotes/:quoteId - remove a quote from the
// collection (owner only, idempotent).
collectionsRouter.delete("/:id/quotes/:quoteId", requireAuth, collectionLimiter, async (req, res) => {
  try {
    const collection = await findOwnedCollection(req.params.id, req.user!.id);
    if (!collection) {
      res.status(404).json({ error: "To'plam topilmadi" });
      return;
    }
    await prisma.collectionQuote.deleteMany({
      where: { collectionId: collection.id, quoteId: req.params.quoteId },
    });
    res.json({ ok: true, removed: true });
  } catch {
    res.status(500).json({ error: "Iqtibos to'plamdan o'chirilmadi" });
  }
});