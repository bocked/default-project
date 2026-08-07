import { Router } from "express";
import { Prisma, type Room } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { password } from "../lib/password.js";
import { requireAuth, attachUser } from "../middleware/auth.js";
import { validateBody, roomCreateSchema, roomAccessSchema } from "../schemas.js";
import { publicItem, type ItemWithAuthor } from "./api.js";

export const roomsRouter = Router();

export interface PublicRoom {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
}

function publicRoom(room: Room & { _count?: { items: number } }, itemCount?: number): PublicRoom {
  return {
    id: room.id,
    slug: room.slug,
    name: room.name,
    description: room.description,
    isPublic: room.isPublic,
    itemCount: itemCount ?? room._count?.items ?? 0,
    createdAt: room.createdAt.toISOString(),
  };
}

async function slugify(name: string): Promise<string> {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const core = base || "xona";
  let candidate = core;
  let i = 1;
  while (await prisma.room.findUnique({ where: { slug: candidate } })) {
    candidate = `${core}-${i++}`;
  }
  return candidate;
}

// GET /api/rooms - list public rooms with item counts
roomsRouter.get("/", async (_req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { isPublic: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    // One GROUP BY over the whole list instead of a per-room correlated
    // _count subquery (avoids N+1 under load).
    const roomIds = rooms.map((r) => r.id);
    const counts = new Map<string, number>();
    if (roomIds.length > 0) {
      const rows: { roomId: string; count: number }[] = await prisma.$queryRaw`
        SELECT "roomId" AS "roomId", COUNT(*)::int AS "count"
        FROM "CanvasItem"
        WHERE "roomId" IN (${Prisma.join(roomIds)}) AND "deletedAt" IS NULL
        GROUP BY "roomId"
      `;
      for (const row of rows) counts.set(row.roomId, row.count);
    }
    res.json({ rooms: rooms.map((r) => publicRoom(r, counts.get(r.id) ?? 0)) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/rooms - create a room (requires an account)
roomsRouter.post("/", requireAuth, validateBody(roomCreateSchema), async (req, res) => {
  try {
    const { name, slug, description, isPublic, password: plain } = res.locals.body;
    const finalSlug = slug ?? (await slugify(name));
    const room = await prisma.room.create({
      data: {
        slug: finalSlug,
        name,
        description: description ?? null,
        isPublic: isPublic ?? true,
        passwordHash: plain ? await password.hash(plain) : null,
        ownerId: req.user!.sub,
      },
    });
    res.status(201).json({ room: publicRoom(room, 0) });
  } catch {
    res.status(500).json({ error: "Failed to create room" });
  }
});

// GET /api/rooms/:slug - room metadata
roomsRouter.get("/:slug", async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { slug: req.params.slug } });
    if (!room) {
      res.status(404).json({ error: "Xona topilmadi" });
      return;
    }
    res.json({ room: publicRoom(room) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});

// POST /api/rooms/:slug/items - room items (password required for private rooms)
roomsRouter.post("/:slug/items", attachUser, validateBody(roomAccessSchema), async (req, res) => {
  try {
    const room = await prisma.room.findUnique({ where: { slug: req.params.slug } });
    if (!room) {
      res.status(404).json({ error: "Xona topilmadi" });
      return;
    }
    if (!room.isPublic) {
      const plain = (res.locals.body as { password?: string }).password ?? "";
      if (!room.passwordHash || !(await password.verify(room.passwordHash, plain))) {
        res.status(403).json({ error: "Maxfiy xona. Parol noto'g'ri." });
        return;
      }
    }
    const items = await prisma.canvasItem.findMany({
      where: { roomId: room.id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: 2000,
      include: { user: { select: { displayName: true } } },
    });
    res.json({ room: publicRoom(room, items.length), items: items.map((i: ItemWithAuthor) => publicItem(i)) });
  } catch {
    res.status(500).json({ error: "Database unavailable" });
  }
});
