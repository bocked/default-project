import { Router } from "express";
import { listContent } from "../lib/content.js";

export const contentRouter = Router();

// GET /api/content - public map of all editable site content blocks.
contentRouter.get("/", async (_req, res) => {
  try {
    const blocks = await listContent();
    res.json({ content: Object.fromEntries(blocks.map((b) => [b.key, b.value])) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});
