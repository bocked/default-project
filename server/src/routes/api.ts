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
import { strictLimiter } from "../lib/rateLimit.js";
import { validateBody, itemCreateSchema } from "../schemas.js";
import { attachUser } from "../middleware/auth.js";
import { z } from "zod";

export const apiRouter = Router();

// HTTP item creation only accepts text/sticky (images arrive via /upload).
const httpItemCreateSchema = itemCreateSchema.extend({ type: z.enum(["TEXT", "STICKY"]) });
type HttpItemCreate = z.infer<typeof httpItemCreateSchema>;

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
  userId: string | null;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ItemWithAuthor = CanvasItem & { user?: { displayName: string } | null };

export function publicItem(item: ItemWithAuthor): PublicItem {
  return {
    id: item.id,
    type: item.type,
    content: item.content,
    x: item.x,
    y: item.y,
    color: item.color,
    reactions: safeReactions(item.reactions),
    userId: item.userId ?? null,
    authorName: item.user?.displayName ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// GET /api/items - initial canvas state
apiRouter.get("/items", async (_req, res) => {
  try {
    const items = await prisma.canvasItem.findMany({ orderBy: { createdAt: "asc" }, take: 5000, include: { user: { select: { displayName: true } } } });
    res.json({ items: items.map(publicItem) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/items - create a text/sticky item over HTTP
apiRouter.post("/items", requireNotBanned, attachUser, strictLimiter, validateBody(httpItemCreateSchema), async (req, res) => {
  try {
    const { type, content, x, y, color } = res.locals.body as HttpItemCreate;
    const ip = clientIp(req.headers);
    const item = await prisma.canvasItem.create({
      data: {
        type,
        content: censorText(content),
        x,
        y,
        color: color ?? null,
        ipAddress: ip,
        userId: req.user?.sub ?? null,
      },
    });
    await bus.publish("canvas:item-add", { item: publicItem(item) });
    const responseItem = {
      ...publicItem(item),
      authorName: req.user?.displayName ?? null,
    };
    res.json({ item: responseItem });
  } catch {
    res.status(500).json({ error: "Failed to create item" });
  }
});

// POST /api/upload - upload an image (stored in R2 or local fallback)
apiRouter.post("/upload", requireNotBanned, strictLimiter, upload.single("file"), async (req, res) => {
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
