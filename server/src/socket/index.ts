import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { bus } from "../lib/bus.js";
import { config } from "../config.js";
import { censorText } from "../lib/profanity.js";
import { clientIp } from "../lib/ip.js";
import { addLog } from "../lib/logstore.js";
import { setOnlineCount } from "../routes/api.js";
import { presence, randomGuestName, randomCursorColor } from "./presence.js";
import { publicItem } from "../routes/api.js";
import {
  parseZod,
  cursorMoveSchema,
  itemCreateSchema,
  itemMoveSchema,
  itemDeleteSchema,
  itemReactionSchema,
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
const MOVE_WRITE_DEBOUNCE_MS = 100;

// Per-socket throttle for cursor events (bounded by CURSOR_THROTTLE_MS anyway).
const cursorCooldown = new Cooldown(CURSOR_THROTTLE_MS);
const addCooldown = new Cooldown(ITEM_ADD_COOLDOWN_MS);
const reactionCooldown = new Cooldown(REACTION_COOLDOWN_MS);

// Socket rate limiting: per-socket event budget + per-IP mutation budget.
const socketEventLimiter = new SocketRateLimiter(10_000, 400);
const socketIpLimiter = new SocketRateLimiter(60_000, 120);
const MAX_CONNECTIONS_PER_IP = 30;

const ADMIN_ROLES = ["ADMIN", "MODERATOR"];

/** Ownership check: admins always pass, otherwise the item must belong to the
 * connected user (or be an old guest item created from this same IP). */
function canEditItem(item: { userId: string | null; ipAddress: string }, socket: Socket): boolean {
  if (socket.data.isAdmin) return true;
  if (socket.data.userId && item.userId === socket.data.userId) return true;
  if (!item.userId && item.ipAddress === socket.data.ip) return true;
  return false;
}

async function broadcastPresence(): Promise<void> {
  await bus.publish("presence:update", {
    users: presence.snapshot(),
    online: presence.count(),
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
  bus.subscribe("canvas:item-add", (payload) => io.emit("canvas:item-add", payload));
  bus.subscribe("canvas:item-move", (payload) => io.emit("canvas:item-move", payload));
  bus.subscribe("canvas:item-delete", (payload) => io.emit("canvas:item-delete", payload));
  bus.subscribe("canvas:item-reaction", (payload) => io.emit("canvas:item-reaction", payload));
  bus.subscribe("canvas:clear", () => io.emit("canvas:clear"));
  bus.subscribe("presence:update", (payload) => io.emit("presence:update", payload));

  bus.subscribe("cursor:move", (payload) => {
    const p = payload as { id: string };
    for (const socket of io.sockets.sockets.values()) {
      if (socket.id !== p.id) socket.emit("cursor:move", payload);
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

  // Presence sweeper - drop users that stopped sending heartbeats.
  setInterval(() => {
    const before = presence.count();
    presence.sweep(30_000);
    if (presence.count() !== before) {
      setOnlineCount(presence.count());
      broadcastPresence();
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
  const user = socket.data.user as
    | { id: string; username: string; role: string; displayName?: string; color?: string }
    | undefined;
  const name = user?.displayName ?? user?.username ?? randomGuestName();
  const color = user?.color ?? randomCursorColor();
  socket.data.name = name;
  socket.data.userId = user?.id;

  // Guard against one IP opening too many sockets.
  if (presence.countByIp(ip) >= MAX_CONNECTIONS_PER_IP) {
    socket.emit("error", "Too many connections from this address");
    socket.disconnect(true);
    return;
  }

  const join = (): void => {
    presence.join(socket.id, ip, name, color, user?.id);
    setOnlineCount(presence.count());
    broadcastPresence();
    socket.emit("canvas:init", {
      online: presence.count(),
      ip,
      name,
      color,
      userId: user?.id ?? null,
    });
    registerHandlers(socket, name, color);
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
    presence.leave(socket.id);
    addCooldown.remove(socket.id);
    reactionCooldown.remove(socket.id);
    cursorCooldown.remove(socket.id);
    socketIpLimiter.prune();
    setOnlineCount(presence.count());
    broadcastPresence();
  });
}

function registerHandlers(socket: Socket, name: string, color: string): void {
  // ----------------------------- cursor -----------------------------
  socket.on("cursor:move", (data: unknown) => {
    const parsed = parseZod(cursorMoveSchema, data);
    if (!parsed) return;
    if (!socketEventLimiter.allow(socket.id)) return;
    if (!cursorCooldown.check(socket.id)) return;

    presence.touch(socket.id, parsed.x, parsed.y);
    bus.publish("cursor:move", { id: socket.id, name, color, x: parsed.x, y: parsed.y });
  });

  // ----------------------------- items -----------------------------
  socket.on("canvas:item-add", async (data: unknown) => {
    const parsed = parseZod(itemCreateSchema, data);
    if (!parsed) return;
    if (!addCooldown.check(socket.id)) return;
    if (!socketIpLimiter.allow(socket.data.ip)) return;

    try {
      const item = await prisma.canvasItem.create({
        data: {
          type: parsed.type,
          content: censorText(parsed.content),
          x: parsed.x,
          y: parsed.y,
          color: parsed.color ?? null,
          ipAddress: socket.data.ip,
          userId: socket.data.userId ?? null,
        },
      });
      const authorName = socket.data.userId ? (socket.data.user?.displayName ?? socket.data.user?.username ?? null) : null;
      await bus.publish("canvas:item-add", { item: { ...publicItem(item), authorName } });
    } catch {
      socket.emit("error", "Failed to save item");
    }
  });

  socket.on("canvas:item-move", async (data: unknown) => {
    const parsed = parseZod(itemMoveSchema, data);
    if (!parsed) return;
    if (!socketIpLimiter.allow(socket.data.ip)) return;

    // Only the author (or an admin) may move an item.
    try {
      const existing = await prisma.canvasItem.findUnique({ where: { id: parsed.id } });
      if (!existing) return;
      if (!socket.data.isAdmin && !canEditItem(existing, socket)) return;
    } catch {
      return;
    }

    // Debounce persistence: track last write per item id on this socket.
    const now = Date.now();
    const key = `move:${parsed.id}`;
    const lastWrite = socket.data[key] as number | undefined;
    if (lastWrite !== undefined && now - lastWrite < MOVE_WRITE_DEBOUNCE_MS) return;
    socket.data[key] = now;

    try {
      await prisma.canvasItem.update({ where: { id: parsed.id }, data: { x: parsed.x, y: parsed.y } });
      await bus.publish("canvas:item-move", { id: parsed.id, x: parsed.x, y: parsed.y });
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
      if (!existing) return;
      // Users may delete their own items; admins may delete anything.
      if (!socket.data.isAdmin && !canEditItem(existing, socket)) return;
      await prisma.canvasItem.delete({ where: { id: parsed.id } });
      await bus.publish("canvas:item-delete", { id: parsed.id });
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
      if (!item) return;
      let reactions: Record<string, number> = {};
      try {
        reactions = JSON.parse(item.reactions ?? "{}");
      } catch {
        reactions = {};
      }
      reactions[parsed.emoji] = (reactions[parsed.emoji] ?? 0) + 1;
      await prisma.canvasItem.update({ where: { id: parsed.id }, data: { reactions: JSON.stringify(reactions) } });
      await bus.publish("canvas:item-reaction", { id: parsed.id, reactions });
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
      await prisma.canvasItem.delete({ where: { id: parsed.id } });
      await bus.publish("canvas:item-delete", { id: parsed.id });
      addLog("delete", `Item ${parsed.id.slice(0, 8)} deleted by admin (socket)`);
    } catch {
      /* ignore */
    }
  });
}
