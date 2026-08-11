import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { bus } from "../lib/bus.js";
import { config } from "../config.js";
import { clientIp } from "../lib/ip.js";
import { addLog } from "../lib/logstore.js";
import { setOnlineCount } from "../routes/api.js";
import { parseZod, adminAuthSchema, adminBanSchema, adminUnbanSchema } from "../schemas.js";
import { Cooldown } from "../lib/cooldown.js";
import { SocketRateLimiter } from "../lib/socketRateLimit.js";

const ADMIN_AUTH_COOLDOWN_MS = 1000;
const adminAuthCooldown = new Cooldown(ADMIN_AUTH_COOLDOWN_MS);
const adminAuthLimiter = new SocketRateLimiter(60_000, 10);

/** Rejects banned clients before they can connect. */
function banCheck(socket: Socket, next: (err?: Error) => void): void {
  socket.data.ip = clientIp(socket.handshake.headers);
  const ip = socket.data.ip as string;
  if (ip === "unknown") {
    next();
    return;
  }
  prisma.bannedIp
    .findUnique({ where: { ipAddress: ip } })
    .then((banned) => {
      if (banned) next(new Error("Banned"));
      else next();
    })
    .catch(() => next());
}

/** Disconnects every connected socket coming from a freshly banned IP. */
function disconnectBannedIp(io: Server, ipAddress: string): void {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.ip === ipAddress) {
      socket.emit("banned", { reason: "You have been banned" });
      socket.disconnect(true);
    }
  }
}

export function initSocket(io: Server): void {
  // Cross-instance admin events -> act on the local socket registry.
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

  io.use(banCheck);

  io.on("connection", (socket) => {
    socket.data.isAdmin = false;
    setOnlineCount(io.engine.clientsCount);
    socket.emit("connected", {
      online: io.engine.clientsCount,
      ip: socket.data.ip ?? "unknown",
    });

    socket.on("disconnect", () => {
      adminAuthCooldown.remove(socket.id);
      setOnlineCount(io.engine.clientsCount);
    });

    registerAdminHandlers(socket);
  });
}

function registerAdminHandlers(socket: Socket): void {
  // Authenticate as an admin with the shared password.
  socket.on("admin:auth", (data: unknown) => {
    if (!adminAuthCooldown.check(socket.id)) return;
    if (!adminAuthLimiter.allow(socket.data.ip ?? "unknown")) return;
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
}
