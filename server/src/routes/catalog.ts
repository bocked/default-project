import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const categoriesRouter = Router();
export const tagsRouter = Router();

// GET /api/categories - all categories with approved-quote counts
categoriesRouter.get("/", async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { quotes: { where: { status: "APPROVED" } } } } },
    });
    res.json({
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        quoteCount: c._count.quotes,
      })),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/tags - tags sorted by approved-quote count
tagsRouter.get("/", async (_req, res) => {
  try {
    const tags = await prisma.tag.findMany({
      include: { _count: { select: { quotes: { where: { status: "APPROVED" } } } } },
    });
    const items = tags
      .map((t) => ({ id: t.id, name: t.name, slug: t.slug, quoteCount: t._count.quotes }))
      .sort((a, b) => b.quoteCount - a.quoteCount)
      .slice(0, 40);
    res.json({ tags: items });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});
