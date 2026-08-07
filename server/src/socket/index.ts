import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { bus } from "../lib/bus.js";
import { config } from "../config.js";
import { censorText } from "../lib/profanity.js";
import { clientIp } from "../lib/ip.js";
import { addLog } from "../lib/logstore.js";
import { setOnlineCount } from "../routes/api.js";
import { password } from "../lib/password.js";
import { presence, randomGuestName, randomCursorColor } from "./presence.js";
import {
  syncRoom as syncPresenceRoom,
  removeMember as removePresenceMember,
  count as countPresence,
} from "../lib/redisPresence.js";
import { publicItem } from "../routes/api.js";
import {
  parseZod,
  cursorMoveSchema,
  itemCreateSchema,
  itemMoveSchema,
  itemDeleteSchema,
  itemReactionSchema,
  identityUpdateSchema,
  roomJoinSchema,
  adminAuthSchema,
  adminBanSchema,
  adminUnbanSchema,
} from "../schemas.js";
import { Cooldown } from "../lib/cooldown.js";
import { SocketRateLimiter } from "../lib/socketRateLimit.js";
import { verifyToken } from "../lib/token.js";

const CURSOR_THROTTLE_MS = 30;
const ITEM_ADD_COOLDOWN_MS = 1000;
const REACTION_COOLDOWN_MS = 300;
const IDENTITY_COOLDOWN_MS = 2000;
const MOVE_WRITE_DEBOUNCE_MS = 100;
const MOVE_HISTORY_DELAY_MS = 1500;

// Per-socket throttle for cursor events (bounded by CURSOR_THROTTLE_MS anyway).
const cursorCooldown = new Cooldown(CURSOR_THROTTLE_MS);
const addCooldown = new Cooldown(ITEM_ADD_COOLDOWN_MS);
const reactionCooldown = new Cooldown(REACTION_COOLDOWN_MS);
const identityCooldown = new Cooldown(IDENTITY_COOLDOWN_MS);

// Socket rate limiting: per-socket event budget + per-IP mutation budget.
const socketEventLimiter = new SocketRateLimiter(10_000, 400);
const socketIpLimiter = new SocketRateLimiter(60_000, 120);
const MAX_CONNECTIONS_PER_IP = 30;

const ADMIN_ROLES = ["ADMIN", "MODERATOR"];

/** Room the socket is currently in (`null` = public main canvas). */
function roomIdOf(socket: Socket): string | null {
  return (socket.data.roomId as string | undefined) ?? null;
}

/** Broadcasts to a room (or globally for the main canvas). */
function emitToRoom(io: Server, roomId: string | null, event: string, payload: unknown): void {
  if (roomId) io.to(roomId).emit(event, payload);
  else io.emit(event, payload);
}

/** Ownership check: admins always pass, otherwise the item must belong to the
 * connected user (or be an old guest item created from this same IP). */
function canEditItem(item: { userId: string | null; ipAddress: string }, socket: Socket): boolean {
  if (socket.data.isAdmin) return true;
  if (socket.data.userId && item.userId === socket.data.userId) return true;
  if (!item.userId && item.ipAddress === socket.data.ip) return true;
  return false;
}

/** Whether the item lives in the room the socket is currently in. */
function sameRoom(item: { roomId: string | null }, socket: Socket): boolean {
  return (item.roomId ?? null) === roomIdOf(socket);
}

async function recordEdit(
  itemId: string,
  action: string,
  snapshot: unknown,
  socket: Socket
): Promise<void> {
  try {
    await prisma.itemEdit.create({
      data: {
        itemId,
        action,
        snapshot: JSON.stringify(snapshot),
        actorId: socket.data.userId ?? null,
        actorName: (socket.data.user?.displayName ?? socket.data.user?.username) ?? null,
      },
    });
  } catch {
    /* history is best-effort */
  }
}

function scheduleMoveHistory(socket: Socket, itemId: string, x: number, y: number): void {
  const timerKey = `histTimer:${itemId}`;
  const prev = socket.data[timerKey] as NodeJS.Timeout | undefined;
  clearTimeout(prev);
  socket.data[timerKey] = setTimeout(() => {
    delete socket.data[timerKey];
    void recordEdit(itemId, "move", { x, y }, socket);
  }, MOVE_HISTORY_DELAY_MS);
}

function clearMoveTimers(socket: Socket): void {
  for (const key of Object.keys(socket.data)) {
    if (key.startsWith("histTimer:")) {
      clearTimeout(socket.data[key] as NodeJS.Timeout);
      delete socket.data[key];
    }
  }
}

async function broadcastPresence(roomId: string | null): Promise<void> {
  const redisOnline = await countPresence(roomId);
  await bus.publish("presence:update", {
    roomId,
    users: presence.snapshotForRoom(roomId),
    online: redisOnline ?? presence.countByRoom(roomId),
  });
}

async function disconnectBannedIp(io: Server, ipAddress: string): Promise<void> {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.ip === ipAddress) {
      socket.emit("banned", { reason: "You have been banned" });
      socket.disconnect(true);
    }
  }
}

export function initSocket(io: Server): void {
  // ---------------------------------------------------------------------
  // Cross-instance subscriptions -> broadcast to connected clients
  // ---------------------------------------------------------------------
  bus.subscribe("canvas:item-add", (payload) => {
    const p = payload as { roomId?: string | null };
    emitToRoom(io, p.roomId ?? null, "canvas:item-add", payload);
  });
  bus.subscribe("canvas:item-move", (payload) => {
    const p = payload as { roomId?: string | null };
    emitToRoom(io, p.roomId ?? null, "canvas:item-move", payload);
  });
  bus.subscribe("canvas:item-delete", (payload) => {
    const p = payload as { roomId?: string | null };
    emitToRoom(io, p.roomId ?? null, "canvas:item-delete", payload);
  });
  bus.subscribe("canvas:item-reaction", (payload) => {
    const p = payload as { roomId?: string | null };
    emitToRoom(io, p.roomId ?? null, "canvas:item-reaction", payload);
  });
  bus.subscribe("canvas:clear", () => io.emit("canvas:clear"));
  bus.subscribe("presence:update", (payload) => {
    const p = payload as { roomId?: string | null };
    emitToRoom(io, p.roomId ?? null, "presence:update", payload);
  });

  bus.subscribe("cursor:move", (payload) => {
    const p = payload as { id: string; roomId?: string | null };
    const room = p.roomId ?? null;
    for (const socket of io.sockets.sockets.values()) {
      if (socket.id !== p.id && roomIdOf(socket) === room) socket.emit("cursor:move", payload);
    }
  });

  bus.subscribe("admin:ban", (payload) => {
    const p = payload as { ipAddress: string };
    disconnectBannedIp(io, p.ipAddress);
    io.emit("admin:ban", payload);
  });
  bus.subscribe("admin:unban", (payload) => io.emit("admin:unban", payload));
  bus.subscribe("admin:log", (payload) => {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.isAdmin) socket.emit("admin:log", payload);
    }
  });

  // Presence sweeper - drop users that stopped sending heartbeats and sync the
  // local presence table into Redis for cross-instance online counts.
  sweeper = setInterval(() => {
    const rooms = presence.rooms();
    for (const room of rooms) {
      void syncPresenceRoom(room, presence.snapshotForRoom(room));
    }
    const before = presence.count();
    presence.sweep(30_000);
    if (presence.count() !== before) {
      setOnlineCount(presence.count());
      for (const room of rooms) void broadcastPresence(room);
    }
  }, 10_000);

  io.use((socket, next) => {
    const token =
      typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
    if (!token) {
      // Anonymous guest - allowed.
      next();
      return;
    }
    verifyToken(token)
      .then((payload) => {
        if (!payload) {
          next(new Error("Invalid token"));
          return;
        }
        socket.data.user = payload;
        next();
      })
      .catch(() => next(new Error("Invalid token")));
  });

  io.on("connection", (socket) => {
    handleConnection(socket);
  });
}

function handleConnection(socket: Socket): void {
  const ip = clientIp(socket.handshake.headers);
  socket.data.ip = ip;

  // Authenticated users keep their account identity; guests get a random name.
  // The verified JWT payload carries the user id as `sub`.
  const user = socket.data.user as
    | { sub: string; username: string; role: string; displayName?: string; color?: string }
    | undefined;
  // Mutable identity: guests can rename themselves later via `identity:update`.
  const identity = {
    name: user?.displayName ?? user?.username ?? randomGuestName(),
    color: user?.color ?? randomCursorColor(),
  };
  socket.data.name = identity.name;
  socket.data.userId = user?.sub ?? undefined;

  // Guard against one IP opening too many sockets.
  if (presence.countByIp(ip) >= MAX_CONNECTIONS_PER_IP) {
    socket.emit("error", "Too many connections from this address");
    socket.disconnect(true);
    return;
  }

  const join = (): void => {
    presence.join(socket.id, ip, identity.name, identity.color, user?.sub ?? undefined, null);
    setOnlineCount(presence.count());
    void syncPresenceRoom(null, presence.snapshotForRoom(null));
    void broadcastPresence(null);
    socket.emit("canvas:init", {
      online: presence.count(),
      ip,
      name: identity.name,
      color: identity.color,
      userId: user?.sub ?? null,
    });
    // Role-based admins are authenticated on connect; no password needed.
    if (user && ADMIN_ROLES.includes(user.role)) {
      socket.data.isAdmin = true;
      socket.emit("admin:authed", { ok: true });
      addLog("info", `Admin ${user.username} connected`);
    }
    registerHandlers(socket, identity);
  };

  // Reject banned clients immediately.
  prisma.bannedIp
    .findUnique({ where: { ipAddress: ip } })
    .then((banned) => {
      if (banned) {
        socket.emit("banned", { reason: banned.reason ?? "You have been banned" });
        socket.disconnect(true);
        return;
      }
      join();
    })
    .catch(() => {
      // Database unavailable - still allow the client to connect (read-only).
      join();
    });

  socket.on("disconnect", () => {
    const room = presence.roomOf(socket.id) ?? null;
    presence.leave(socket.id);
    void removePresenceMember(room, socket.id);
    clearMoveTimers(socket);
    addCooldown.remove(socket.id);
    reactionCooldown.remove(socket.id);
    identityCooldown.remove(socket.id);
    cursorCooldown.remove(socket.id);
    socketIpLimiter.prune();
    setOnlineCount(presence.count());
    void broadcastPresence(room);
  });
}

function registerHandlers(socket: Socket, identity: { name: string; color: string }): void {
  // ----------------------------- cursor -----------------------------
  socket.on("cursor:move", (data: unknown) => {
    const parsed = parseZod(cursorMoveSchema, data);
    if (!parsed) return;
    if (!socketEventLimiter.allow(socket.id)) return;
    if (!cursorCooldown.check(socket.id)) return;

    presence.touch(socket.id, parsed.x, parsed.y);
    bus.publish("cursor:move", {
      id: socket.id,
      name: identity.name,
      color: identity.color,
      x: parsed.x,
      y: parsed.y,
      roomId: roomIdOf(socket),
    });
  });

  // --------------------------- identity ----------------------------
  // Guests may set a custom display name and anyone may tweak their cursor
  // color. Authenticated users always keep their account display name.
  socket.on("identity:update", (data: unknown) => {
    if (!identityCooldown.check(socket.id)) return;
    const parsed = parseZod(identityUpdateSchema, data);
    if (!parsed) return;
    if (!parsed.name && !parsed.color) return;

    const isGuest = !socket.data.userId;
    let name = identity.name;
    if (parsed.name && isGuest) {
      const clean = censorText(parsed.name).trim();
      name = clean.length > 0 ? clean.slice(0, 32) : identity.name;
    }
    const color = parsed.color ?? identity.color;
    identity.name = name;
    identity.color = color;
    socket.data.name = name;

    presence.setIdentity(socket.id, name, color);
    const room = presence.roomOf(socket.id) ?? null;
    void syncPresenceRoom(room, presence.snapshotForRoom(room));
    void broadcastPresence(room);
    socket.emit("identity:updated", { name, color });
  });

  // ----------------------------- rooms -----------------------------
  socket.on("room:join", async (data: unknown) => {
    const parsed = parseZod(roomJoinSchema, data);
    if (!parsed) return;
    try {
      const room = await prisma.room.findUnique({ where: { slug: parsed.slug } });
      if (!room) {
        socket.emit("room:error", { error: "Xona topilmadi" });
        return;
      }
      if (!room.isPublic) {
        if (!room.passwordHash || !(await password.verify(room.passwordHash, parsed.password ?? ""))) {
          socket.emit("room:error", { error: "Parol noto'g'ri" });
          return;
        }
      }
      const oldRoom = presence.roomOf(socket.id) ?? null;
      socket.data.roomId = room.id;
      socket.join(room.id);
      presence.setRoom(socket.id, room.id);
      socket.emit("room:joined", {
        room: { id: room.id, slug: room.slug, name: room.name, isPublic: room.isPublic },
      });
      void syncPresenceRoom(oldRoom, presence.snapshotForRoom(oldRoom));
      void syncPresenceRoom(room.id, presence.snapshotForRoom(room.id));
      void broadcastPresence(oldRoom);
      void broadcastPresence(room.id);
    } catch {
      socket.emit("room:error", { error: "Xonaga kirib bo'lmadi" });
    }
  });

  socket.on("room:leave", () => {
    const current = roomIdOf(socket);
    if (!current) return;
    socket.leave(current);
    socket.data.roomId = null;
    presence.setRoom(socket.id, null);
    socket.emit("room:left", {});
    void syncPresenceRoom(current, presence.snapshotForRoom(current));
    void syncPresenceRoom(null, presence.snapshotForRoom(null));
    void broadcastPresence(current);
    void broadcastPresence(null);
  });

  // ----------------------------- items -----------------------------
  socket.on("canvas:item-add", async (data: unknown) => {
    const parsed = parseZod(itemCreateSchema, data);
    if (!parsed) return;
    if (!addCooldown.check(socket.id)) return;
    if (!socketIpLimiter.allow(socket.data.ip)) return;

    try {
      const roomId = roomIdOf(socket);
      const item = await prisma.canvasItem.create({
        data: {
          type: parsed.type,
          content: censorText(parsed.content),
          x: parsed.x,
          y: parsed.y,
          color: parsed.color ?? null,
          ipAddress: socket.data.ip,
          userId: socket.data.userId ?? null,
          roomId,
        },
      });
      const authorName = socket.data.userId
        ? (socket.data.user?.displayName ?? socket.data.user?.username ?? null)
        : null;
      await bus.publish("canvas:item-add", {
        item: { ...publicItem(item), authorName },
        roomId,
      });
      void recordEdit(item.id, "create", { type: item.type, content: item.content, x: item.x, y: item.y }, socket);
    } catch {
      socket.emit("error", "Failed to save item");
    }
  });

  socket.on("canvas:item-move", async (data: unknown) => {
    const parsed = parseZod(itemMoveSchema, data);
    if (!parsed) return;
    if (!socketIpLimiter.allow(socket.data.ip)) return;

    // Only the author (or an admin) may move an item, and only within its room.
    const existing = await prisma.canvasItem.findUnique({ where: { id: parsed.id } }).catch(() => null);
    if (!existing || existing.deletedAt) return;
    if (!sameRoom(existing, socket)) return;
    if (!socket.data.isAdmin && !canEditItem(existing, socket)) return;

    // Debounce persistence: track last write per item id on this socket.
    const now = Date.now();
    const key = `move:${parsed.id}`;
    const lastWrite = socket.data[key] as number | undefined;
    if (lastWrite !== undefined && now - lastWrite < MOVE_WRITE_DEBOUNCE_MS) return;
    socket.data[key] = now;

    try {
      await prisma.canvasItem.update({ where: { id: parsed.id }, data: { x: parsed.x, y: parsed.y } });
      await bus.publish("canvas:item-move", {
        id: parsed.id,
        x: parsed.x,
        y: parsed.y,
        roomId: existing.roomId,
      });
      scheduleMoveHistory(socket, parsed.id, parsed.x, parsed.y);
    } catch {
      // Item may have been deleted concurrently - ignore.
    }
  });

  socket.on("canvas:item-delete", async (data: unknown) => {
    const parsed = parseZod(itemDeleteSchema, data);
    if (!parsed) return;
    if (!socketIpLimiter.allow(socket.data.ip)) return;

    try {
      const existing = await prisma.canvasItem.findUnique({ where: { id: parsed.id } });
      if (!existing || existing.deletedAt) return;
      if (!sameRoom(existing, socket)) return;
      // Users may delete their own items; admins may delete anything.
      if (!socket.data.isAdmin && !canEditItem(existing, socket)) return;
      await prisma.canvasItem.update({ where: { id: parsed.id }, data: { deletedAt: new Date() } });
      await bus.publish("canvas:item-delete", { id: parsed.id, roomId: existing.roomId });
      void recordEdit(parsed.id, "delete", {}, socket);
    } catch {
      /* ignore */
    }
  });

  socket.on("canvas:item-undo", async (data: unknown) => {
    const parsed = parseZod(itemDeleteSchema, data);
    if (!parsed) return;
    try {
      const item = await prisma.canvasItem.findUnique({ where: { id: parsed.id } });
      if (!item || item.deletedAt === null) return;
      if (!socket.data.isAdmin && !canEditItem(item, socket)) return;
      await prisma.canvasItem.update({ where: { id: parsed.id }, data: { deletedAt: null } });
      const restored = await prisma.canvasItem.findUnique({
        where: { id: parsed.id },
        include: { user: { select: { displayName: true } } },
      });
      if (!restored) return;
      await bus.publish("canvas:item-add", { item: publicItem(restored), roomId: restored.roomId });
      void recordEdit(parsed.id, "undo", {}, socket);
    } catch {
      /* ignore */
    }
  });

  socket.on("canvas:reaction", async (data: unknown) => {
    const parsed = parseZod(itemReactionSchema, data);
    if (!parsed) return;
    if (!reactionCooldown.check(socket.id)) return;
    if (!socketIpLimiter.allow(socket.data.ip)) return;

    try {
      const item = await prisma.canvasItem.findUnique({ where: { id: parsed.id } });
      if (!item || item.deletedAt) return;
      if (!sameRoom(item, socket)) return;
      let reactions: Record<string, number> = {};
      try {
        reactions = JSON.parse(item.reactions ?? "{}");
      } catch {
        reactions = {};
      }
      reactions[parsed.emoji] = (reactions[parsed.emoji] ?? 0) + 1;
      await prisma.canvasItem.update({ where: { id: parsed.id }, data: { reactions: JSON.stringify(reactions) } });
      await bus.publish("canvas:item-reaction", {
        id: parsed.id,
        reactions,
        roomId: item.roomId,
      });
    } catch {
      /* ignore */
    }
  });

  // ----------------------------- admin -----------------------------
  socket.on("admin:auth", (data: unknown) => {
    const user = socket.data.user as { role: string } | undefined;
    // Role-based admins (JWT) are already authenticated.
    if (user && ADMIN_ROLES.includes(user.role)) {
      socket.data.isAdmin = true;
      socket.emit("admin:authed", { ok: true });
      addLog("info", `Admin logged in (socket ${socket.id.slice(0, 8)})`);
      return;
    }
    const parsed = parseZod(adminAuthSchema, data);
    if (!parsed) return;
    if (parsed.password === config.adminPassword) {
      socket.data.isAdmin = true;
      socket.emit("admin:authed", { ok: true });
      addLog("info", `Admin logged in (socket ${socket.id.slice(0, 8)})`);
    } else {
      socket.emit("admin:authed", { ok: false });
    }
  });

  socket.on("admin:ban", async (data: unknown) => {
    if (!socket.data.isAdmin) return;
    const parsed = parseZod(adminBanSchema, data);
    if (!parsed) return;
    try {
      await prisma.bannedIp.upsert({
        where: { ipAddress: parsed.ipAddress },
        update: { reason: parsed.reason ?? null },
        create: { ipAddress: parsed.ipAddress, reason: parsed.reason ?? null },
      });
      await bus.publish("admin:ban", { ipAddress: parsed.ipAddress, reason: parsed.reason ?? null });
      addLog("ban", `IP ${parsed.ipAddress} banned (socket)`);
    } catch {
      /* ignore */
    }
  });

  socket.on("admin:unban", async (data: unknown) => {
    if (!socket.data.isAdmin) return;
    const parsed = parseZod(adminUnbanSchema, data);
    if (!parsed) return;
    try {
      await prisma.bannedIp.delete({ where: { ipAddress: parsed.ipAddress } });
      await bus.publish("admin:unban", { ipAddress: parsed.ipAddress });
      addLog("info", `IP ${parsed.ipAddress} unbanned (socket)`);
    } catch {
      /* ignore */
    }
  });

  socket.on("admin:delete", async (data: unknown) => {
    if (!socket.data.isAdmin) return;
    const parsed = parseZod(itemDeleteSchema, data);
    if (!parsed) return;
    try {
      const existing = await prisma.canvasItem.findUnique({ where: { id: parsed.id } });
      if (!existing) return;
      await prisma.canvasItem.delete({ where: { id: parsed.id } });
      await bus.publish("canvas:item-delete", { id: parsed.id, roomId: existing.roomId });
      addLog("delete", `Item ${parsed.id.slice(0, 8)} deleted by admin (socket)`);
    } catch {
      /* ignore */
    }
  });
}

let sweeper: ReturnType<typeof setInterval> | null = null;

/**
 * Stops background loops started by initSocket. Called by the E2E test helper
 * (and could be wired into graceful shutdown) so the process can exit cleanly.
 */
export function disposeSocket(): void {
  if (sweeper) {
    clearInterval(sweeper);
    sweeper = null;
  }
}

