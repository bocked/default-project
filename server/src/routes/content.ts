import { Router } from "express";
import { listContent } from "../lib/content.js";
import { sanitizeContentValue } from "../lib/sanitizeHtml.js";

export const contentRouter = Router();

// GET /api/content - public map of all editable site content blocks.
contentRouter.get("/", async (_req, res) => {
  try {
    const blocks = await listContent();
    res.setHeader("Cache-Control", "no-store");
    // Banner blocks are served as live markup/links, so they go through the same
    // policy as the write path. Rows persisted before this policy existed are
    // therefore neutralised here rather than staying live in the database.
    res.json({
      content: Object.fromEntries(
        blocks.map((b) => [b.key, sanitizeContentValue(b.key, b.value)]),
      ),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});
