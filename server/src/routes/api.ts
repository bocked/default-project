import { Router } from "express";
import multer from "multer";
import type { CanvasItem } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { storage } from "../lib/storage.js";
import { censorText } from "../lib/profanity.js";
import { clientIp } from "../lib/ip.js";
import { requireNotBanned } from "../middleware/bannedIp.js";
import { config } from "../config.js";
import { bus } from "../lib/bus.js";

export const apiRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function safeReactions(raw: string | null): Record<string, number> {
  try {
    const parsed = JSON.parse(raw ?? "{}");
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export interface PublicItem {
  id: string;
  type: string;
  content: string;
  x: number;
  y: number;
  color: string | null;
  reactions: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export function publicItem(item: CanvasItem): PublicItem {
  return {
    id: item.id,
    type: item.type,
    content: item.content,
    x: item.x,
    y: item.y,
    color: item.color,
    reactions: safeReactions(item.reactions),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// GET /api/items - initial canvas state
apiRouter.get("/items", async (_req, res) => {
  try {
    const items = await prisma.canvasItem.findMany({ orderBy: { createdAt: "asc" }, take: 5000 });
    res.json({ items: items.map(publicItem) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/items - create a text/sticky item over HTTP
apiRouter.post("/items", requireNotBanned, async (req, res) => {
  try {
    const { type, content, x, y, color } = req.body ?? {};
    if (!["TEXT", "STICKY"].includes(type) || typeof content !== "string" || !Number.isFinite(x) || !Number.isFinite(y)) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    const ip = clientIp(req.headers);
    const item = await prisma.canvasItem.create({
      data: {
        type,
        content: censorText(content.slice(0, 4000)),
        x: Number(x),
        y: Number(y),
        color: typeof color === "string" ? color.slice(0, 32) : null,
        ipAddress: ip,
      },
    });
    await bus.publish("canvas:item-add", { item: publicItem(item) });
    res.json({ item: publicItem(item) });
  } catch {
    res.status(500).json({ error: "Failed to create item" });
  }
});

// POST /api/upload - upload an image (stored in R2 or local fallback)
apiRouter.post("/upload", requireNotBanned, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    const url = await storage.upload(req.file.buffer, req.file.mimetype);
    res.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    res.status(500).json({ error: message });
  }
});

// GET /api/online - online user count
apiRouter.get("/online", (_req, res) => {
  res.json({ online: onlineCount() });
});

// GET /api/health
apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

let online = 0;
export function setOnlineCount(n: number): void {
  online = n;
}
export function onlineCount(): number {
  return online;
}
