import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { recordActivity } from "../lib/activity.js";
import { validateBody, publicFeedbackSchema, type PublicFeedback } from "../schemas.js";

export const siteRouter = Router();

// GET /api/announcements - active site announcements (banner text for the homepage).
siteRouter.get("/announcements", async (_req, res) => {
  try {
    const announcements = await prisma.announcement.findMany({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, message: true, createdAt: true },
    });
    res.json({ announcements });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/settings - public site settings (site name, social links, meta).
siteRouter.get("/settings", async (_req, res) => {
  try {
    const settings = await prisma.siteSetting.findMany({
      where: { group: { in: ["general"] } },
      orderBy: { key: "asc" },
      select: { key: true, value: true },
    });
    res.json({ settings: Object.fromEntries(settings.map((s) => [s.key, s.value])) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// GET /api/seo - public SEO rules for static pages / categories / tags / quotes.
siteRouter.get("/seo", async (req, res) => {
  try {
    const page = typeof req.query.page === "string" ? req.query.page.trim().slice(0, 200) : "";
    const rules = await prisma.seoRule.findMany({
      where: page ? { page } : {},
      select: { page: true, title: true, description: true, keywords: true },
    });
    res.json({ rules });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/feedback - authenticated users can send feedback / complaints.
siteRouter.post("/feedback", requireAuth, validateBody(publicFeedbackSchema), async (req, res) => {
  const body = res.locals.body as PublicFeedback;
  try {
    if (body.quoteId) {
      const quote = await prisma.quote.findUnique({ where: { id: body.quoteId } });
      if (!quote) {
        res.status(400).json({ error: "Iqtibos topilmadi" });
        return;
      }
    }
    const feedback = await prisma.feedback.create({
      data: {
        userId: req.user!.id,
        category: body.category,
        text: body.text,
        quoteId: body.quoteId ?? null,
      },
    });
    void recordActivity({ userId: req.user!.id, action: "FEEDBACK", detail: body.category, targetId: feedback.id });
    res.status(201).json({ ok: true, id: feedback.id });
  } catch {
    res.status(500).json({ error: "Shikoyat yuborilmadi" });
  }
});
