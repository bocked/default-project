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

const CURSOR_THROTTLE_MS = 30;
const ITEM_ADD_COOLDOWN_MS = 1000;
const REACTION_COOLDOWN_MS = 300;

function isFiniteNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

  io.on("connection", (socket) => {
    handleConnection(socket);
  });
}

function handleConnection(socket: Socket): void {
  const ip = clientIp(socket.handshake.headers);
  socket.data.ip = ip;

  // Reject banned clients immediately.
  prisma.bannedIp
    .findUnique({ where: { ipAddress: ip } })
    .then((banned) => {
      if (banned) {
        socket.emit("banned", { reason: banned.reason ?? "You have been banned" });
        socket.disconnect(true);
        return;
      }

      const name = randomGuestName();
      const color = randomCursorColor();
      socket.data.name = name;
      presence.join(socket.id, ip, name, color);
      setOnlineCount(presence.count());
      broadcastPresence();

      socket.emit("canvas:init", {
        online: presence.count(),
        ip,
        name,
        color,
      });

      // Initial items are fetched by the client over HTTP (/api/items) so we
      // keep the socket handshake fast.
      registerHandlers(socket, name, color);
    })
    .catch(() => {
      // Database unavailable - still allow the client to connect (read-only).
      const name = randomGuestName();
      const color = randomCursorColor();
      socket.data.name = name;
      presence.join(socket.id, ip, name, color);
      setOnlineCount(presence.count());
      broadcastPresence();
      socket.emit("canvas:init", { online: presence.count(), ip, name, color });
      registerHandlers(socket, name, color);
    });

  socket.on("disconnect", () => {
    presence.leave(socket.id);
    setOnlineCount(presence.count());
    broadcastPresence();
  });
}

function registerHandlers(socket: Socket, name: string, color: string): void {
  // ----------------------------- cursor -----------------------------
  socket.on("cursor:move", (data: { x?: unknown; y?: unknown }) => {
    if (!isFiniteNum(data?.x) || !isFiniteNum(data?.y)) return;
    const now = Date.now();
    const last = socket.data.lastCursor as number | undefined;
    if (last !== undefined && now - last < CURSOR_THROTTLE_MS) return;
    socket.data.lastCursor = now;

    const x = Number(data.x);
    const y = Number(data.y);
    presence.touch(socket.id, x, y);
    bus.publish("cursor:move", { id: socket.id, name, color, x, y });
  });

  // ----------------------------- items -----------------------------
  socket.on(
    "canvas:item-add",
    async (data: { type?: string; content?: unknown; x?: unknown; y?: unknown; color?: unknown }) => {
      const now = Date.now();
      const last = socket.data.lastAdd as number | undefined;
      if (last !== undefined && now - last < ITEM_ADD_COOLDOWN_MS) return;
      socket.data.lastAdd = now;

      const type = data?.type;
      if (!["TEXT", "STICKY", "IMAGE"].includes(type ?? "")) return;
      if (typeof data?.content !== "string" || data.content.length === 0) return;
      if (!isFiniteNum(data?.x) || !isFiniteNum(data?.y)) return;

      try {
        const item = await prisma.canvasItem.create({
          data: {
            type: type as string,
            content: censorText(data.content.slice(0, 4000)),
            x: Number(data.x),
            y: Number(data.y),
            color: typeof data.color === "string" ? data.color.slice(0, 32) : null,
            ipAddress: socket.data.ip,
          },
        });
        await bus.publish("canvas:item-add", { item: publicItem(item) });
      } catch {
        socket.emit("error", "Failed to save item");
      }
    }
  );

  socket.on("canvas:item-move", async (data: { id?: unknown; x?: unknown; y?: unknown }) => {
    if (typeof data?.id !== "string" || !isFiniteNum(data?.x) || !isFiniteNum(data?.y)) return;

    // Debounce persistence: track last write per item id.
    try {
      const now = Date.now();
      const key = `move:${data.id}`;
      const lastWrite = socket.data[key] as number | undefined;
      if (lastWrite !== undefined && now - lastWrite < 100) return;
      socket.data[key] = now;

      const x = Number(data.x);
      const y = Number(data.y);
      await prisma.canvasItem.update({ where: { id: data.id }, data: { x, y } });
      await bus.publish("canvas:item-move", { id: data.id, x, y });
    } catch {
      // Item may have been deleted concurrently - ignore.
    }
  });

  socket.on("canvas:item-delete", async (data: { id?: unknown }) => {
    if (typeof data?.id !== "string") return;
    try {
      const existing = await prisma.canvasItem.findUnique({ where: { id: data.id } });
      if (!existing) return;
      // Users may delete their own items; admins may delete anything.
      if (!socket.data.isAdmin && existing.ipAddress !== socket.data.ip) return;
      await prisma.canvasItem.delete({ where: { id: data.id } });
      await bus.publish("canvas:item-delete", { id: data.id });
    } catch {
      /* ignore */
    }
  });

  socket.on("canvas:reaction", async (data: { id?: unknown; emoji?: unknown }) => {
    if (typeof data?.id !== "string" || typeof data?.emoji !== "string" || !data.emoji) return;
    const now = Date.now();
    const last = socket.data.lastReaction as number | undefined;
    if (last !== undefined && now - last < REACTION_COOLDOWN_MS) return;
    socket.data.lastReaction = now;

    try {
      const item = await prisma.canvasItem.findUnique({ where: { id: data.id } });
      if (!item) return;
      let reactions: Record<string, number> = {};
      try {
        reactions = JSON.parse(item.reactions ?? "{}");
      } catch {
        reactions = {};
      }
      reactions[data.emoji.slice(0, 8)] = (reactions[data.emoji.slice(0, 8)] ?? 0) + 1;
      await prisma.canvasItem.update({ where: { id: data.id }, data: { reactions: JSON.stringify(reactions) } });
      await bus.publish("canvas:item-reaction", { id: data.id, reactions });
    } catch {
      /* ignore */
    }
  });

  // ----------------------------- admin -----------------------------
  socket.on("admin:auth", (data: { password?: unknown }) => {
    if (typeof data?.password !== "string") return;
    if (data.password === config.adminPassword) {
      socket.data.isAdmin = true;
      socket.emit("admin:authed", { ok: true });
      addLog("info", `Admin logged in (socket ${socket.id.slice(0, 8)})`);
    } else {
      socket.emit("admin:authed", { ok: false });
    }
  });

  socket.on("admin:ban", async (data: { ipAddress?: unknown; reason?: unknown }) => {
    if (!socket.data.isAdmin) return;
    if (typeof data?.ipAddress !== "string" || !data.ipAddress.trim()) return;
    const ipAddress = data.ipAddress.trim();
    try {
      await prisma.bannedIp.upsert({
        where: { ipAddress },
        update: { reason: typeof data.reason === "string" ? data.reason.slice(0, 500) : null },
        create: { ipAddress, reason: typeof data.reason === "string" ? data.reason.slice(0, 500) : null },
      });
      await bus.publish("admin:ban", { ipAddress, reason: typeof data.reason === "string" ? data.reason.slice(0, 500) : null });
      addLog("ban", `IP ${ipAddress} banned (socket)`);
    } catch {
      /* ignore */
    }
  });

  socket.on("admin:unban", async (data: { ipAddress?: unknown }) => {
    if (!socket.data.isAdmin) return;
    if (typeof data?.ipAddress !== "string") return;
    try {
      await prisma.bannedIp.delete({ where: { ipAddress: data.ipAddress } });
      await bus.publish("admin:unban", { ipAddress: data.ipAddress });
      addLog("info", `IP ${data.ipAddress} unbanned (socket)`);
    } catch {
      /* ignore */
    }
  });

  socket.on("admin:delete", async (data: { id?: unknown }) => {
    if (!socket.data.isAdmin) return;
    if (typeof data?.id !== "string") return;
    try {
      await prisma.canvasItem.delete({ where: { id: data.id } });
      await bus.publish("canvas:item-delete", { id: data.id });
      addLog("delete", `Item ${data.id.slice(0, 8)} deleted by admin (socket)`);
    } catch {
      /* ignore */
    }
  });
}
