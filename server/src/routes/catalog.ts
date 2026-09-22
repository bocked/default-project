import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { cachedGet, CACHE_PREFIXES } from "../lib/redisCache.js";

export const categoriesRouter = Router();
export const tagsRouter = Router();

const CATALOG_TTL_MS = 5 * 60 * 1000;

// GET /api/categories - all categories with approved-quote counts
categoriesRouter.get("/", async (_req, res) => {
  try {
    const categories = await cachedGet(CACHE_PREFIXES.catalog, "categories", CATALOG_TTL_MS, async () => {
      const rows = await prisma.category.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { quotes: { where: { status: "APPROVED" } } } } },
      });
      return rows.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        quoteCount: c._count.quotes,
      }));
    });
    res.json({ categories });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/tags - tags sorted by approved-quote count
tagsRouter.get("/", async (_req, res) => {
  try {
    const tags = await cachedGet(CACHE_PREFIXES.catalog, "tags", CATALOG_TTL_MS, async () => {
      const rows = await prisma.tag.findMany({
        include: { _count: { select: { quotes: { where: { status: "APPROVED" } } } } },
      });
      return rows
        .map((t) => ({ id: t.id, name: t.name, slug: t.slug, quoteCount: t._count.quotes }))
        .sort((a, b) => b.quoteCount - a.quoteCount)
        .slice(0, 40);
    });
    res.json({ tags });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});