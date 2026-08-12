import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const usersRouter = Router();

const quoteInclude = {
  category: { select: { id: true, name: true, slug: true } },
  tags: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.QuoteInclude;

// GET /api/users/:id - public author profile (nickname + approved quotes).
usersRouter.get("/:id", async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null, blocked: false },
      select: { id: true, nickname: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: "Profil topilmadi" });
      return;
    }
    const quotes = await prisma.quote.findMany({
      where: { userId: user.id, status: "APPROVED", deletedAt: null },
      include: quoteInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json({
      user,
      quotes: quotes.map((q) => ({
        id: q.id,
        text: q.text,
        displayAuthor: q.displayAuthor,
        anonymous: q.anonymous,
        telegramUrl: q.telegramUrl ?? null,
        createdAt: q.createdAt,
        category: q.category,
        tags: q.tags,
      })),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});
