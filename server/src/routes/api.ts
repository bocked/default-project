import { Router } from "express";
import multer from "multer";
import type { CanvasItem, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { storage } from "../lib/storage.js";
import { censorText } from "../lib/profanity.js";
import { clientIp } from "../lib/ip.js";
import { requireNotBanned } from "../middleware/bannedIp.js";
import { config } from "../config.js";
import { bus } from "../lib/bus.js";
import { strictLimiter } from "../lib/rateLimit.js";
import { validateBody, itemCreateSchema, reportCreateSchema } from "../schemas.js";
import { attachUser } from "../middleware/auth.js";
import { z } from "zod";
import { sniffImageMime } from "../lib/storage.js";
import { cache, CACHE_TTL } from "../lib/cache.js";
import { recordItemEdit } from "../lib/activity.js";

export const apiRouter = Router();

// Invalidate cached list responses whenever the canvas changes through any
// path (HTTP create, admin clear/delete, or any socket write — all of them go
// through the bus). Moves are included so a reload never shows stale coords.
const INVALIDATE_PREFIXES = ["items:first:", "roomItems:"];
function invalidateCanvasCaches(): void {
  for (const prefix of INVALIDATE_PREFIXES) cache.deletePrefix(prefix);
}
bus.subscribe("canvas:item-add", invalidateCanvasCaches);
bus.subscribe("canvas:item-move", invalidateCanvasCaches);
bus.subscribe("canvas:item-update", invalidateCanvasCaches);
bus.subscribe("canvas:item-delete", invalidateCanvasCaches);
bus.subscribe("canvas:clear", invalidateCanvasCaches);

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
  width: number | null;
  height: number | null;
  reactions: Record<string, number>;
  userId: string | null;
  authorName: string | null;
  roomId: string | null;
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
    width: item.width,
    height: item.height,
    reactions: safeReactions(item.reactions),
    userId: item.userId ?? null,
    authorName: item.user?.displayName ?? null,
    roomId: item.roomId ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// GET /api/items - initial main-canvas state (no room, not soft-deleted).
// Supports optional pagination (?limit, ?before) and a spatial bounding box
// (?minX=&maxX=&minY=&maxY=) for very large canvases.
apiRouter.get("/items", async (req, res) => {
  try {
    const q = req.query;
    const limit = Math.min(Math.max(Number(q.limit) || 500, 1), 2000);
    const before = typeof q.before === "string" && q.before ? q.before : undefined;
    const minX = Number(q.minX);
    const maxX = Number(q.maxX);
    const minY = Number(q.minY);
    const maxY = Number(q.maxY);

    // Only the plain first page is cacheable: paginated (before) and spatial
    // (bbox) reads are cold paths that vary per query.
    const cacheable = !before && !Number.isFinite(minX) && !Number.isFinite(maxX) && !Number.isFinite(minY) && !Number.isFinite(maxY);
    const cacheKey = `items:first:${limit}`;
    if (cacheable) {
      const cached = cache.get<string>(cacheKey);
      if (cached) {
        res.json(JSON.parse(cached));
        return;
      }
    }

    const where: Prisma.CanvasItemWhereInput = { roomId: null, deletedAt: null };
    if (Number.isFinite(minX) && Number.isFinite(maxX)) where.x = { gte: minX, lte: maxX };
    if (Number.isFinite(minY) && Number.isFinite(maxY)) where.y = { gte: minY, lte: maxY };
    if (before) where.createdAt = { lt: new Date(before) };

    const items = await prisma.canvasItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { displayName: true } } },
    });
    const ordered = [...items].reverse();
    const body = {
      items: ordered.map(publicItem),
      next: ordered.length === limit ? ordered[0]?.createdAt.toISOString() ?? null : null,
    };
    if (cacheable) cache.set(cacheKey, JSON.stringify(body), CACHE_TTL.itemsFirstPage);
    res.json(body);
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
    void recordItemEdit({
      itemId: item.id,
      action: "create",
      snapshot: { type, content: item.content, x, y },
      actorId: req.user?.sub ?? null,
      actorName: req.user?.displayName ?? req.user?.username ?? null,
    });
    const responseItem = {
      ...publicItem(item),
      authorName: req.user?.displayName ?? null,
    };
    res.json({ item: responseItem });
  } catch {
    res.status(500).json({ error: "Failed to create item" });
  }
});

// GET /api/activity - recent item activity feed (from the ItemEdit history)
apiRouter.get("/activity", async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const edits = await prisma.itemEdit.findMany({
      orderBy: { at: "desc" },
      take: limit,
      include: { item: { select: { type: true, content: true, roomId: true } } },
    });
    res.json({
      activity: edits.map((e) => ({
        id: e.id,
        action: e.action,
        itemId: e.itemId,
        itemType: e.item.type,
        preview: e.item.content.slice(0, 120),
        actorName: e.actorName ?? null,
        at: e.at.toISOString(),
        roomId: e.item.roomId,
      })),
    });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/upload - upload an image (stored in R2 or local fallback)
apiRouter.post("/upload", requireNotBanned, strictLimiter, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }
    // Never trust the client Content-Type: verify the file's magic bytes so a
    // crafted HTML/SVG polyglot cannot be stored and served to other users.
    const realMime = sniffImageMime(req.file.buffer);
    if (!realMime) {
      res.status(400).json({ error: "Unsupported or invalid image file" });
      return;
    }
    const url = await storage.upload(req.file.buffer, realMime);
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

// POST /api/report - report an item for moderation
apiRouter.post("/report", attachUser, strictLimiter, validateBody(reportCreateSchema), async (req, res) => {
  try {
    const { itemId, reason } = res.locals.body as { itemId: string; reason: string };
    const item = await prisma.canvasItem.findUnique({ where: { id: itemId } });
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const report = await prisma.report.create({
      data: {
        itemId,
        reason,
        reporterId: req.user?.sub ?? null,
      },
    });
    res.status(201).json({ report });
  } catch {
    res.status(500).json({ error: "Failed to create report" });
  }
});

let online = 0;
export function setOnlineCount(n: number): void {
  online = n;
}
export function onlineCount(): number {
  return online;
}
