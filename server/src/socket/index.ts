import type { Server, Socket } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { bus } from "../lib/bus.js";
import { config } from "../config.js";
import { clientIp } from "../lib/ip.js";
import { addLog } from "../lib/logstore.js";
import { setOnlineCount } from "../routes/api.js";
import { parseZod, adminAuthSchema, adminBanSchema, adminUnbanSchema } from "../schemas.js";
import { safeEqual } from "../middleware/adminAuth.js";
import { verifyAuthToken } from "../lib/tokens.js";
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

/** Cross-instance admin events -> act on the local socket registry. */
function emitToAdmins(io: Server, event: string, payload: unknown): void {
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.isAdmin) socket.emit(event, payload);
  }
}

// The bus is a module-level singleton while a process owns exactly one HTTP
// server, so a second initSocket without a matching teardown would otherwise
// leave the previous set of listeners attached: every admin event would fan out
// once per init, and each stale listener pins the dead `Server` in memory.
// Tracking the active disposer makes re-init self-healing, and the returned
// function lets callers (and the E2E harness) release listeners deterministically.
let activeDispose: (() => void) | null = null;

export function initSocket(io: Server): () => void {
  activeDispose?.();
  activeDispose = null;

  const unsubscribes: Array<() => void> = [];
  /** Subscribe through the bus so every listener is tracked for teardown. */
  const on = (channel: string, handler: (payload: unknown) => void): void => {
    unsubscribes.push(bus.subscribe(channel, handler));
  };

  // Ban events carry the banned IP address and its reason. They must reach the
  // affected sockets (via disconnectBannedIp) and the admin panels, never the
  // public audience: `io.emit` would hand every connected visitor the ban list.
  on("admin:ban", (payload) => {
    const p = payload as { ipAddress: string };
    disconnectBannedIp(io, p.ipAddress);
    emitToAdmins(io, "admin:ban", payload);
  });
  on("admin:unban", (payload) => emitToAdmins(io, "admin:unban", payload));
  on("admin:log", (payload) => emitToAdmins(io, "admin:log", payload));
  // Dynamic-registry & policy-review push: delivered on top of the bus so every
  // instance forwards it, then re-broadcast to the connected admin sockets.
  on("admin:feature:new", (payload) => emitToAdmins(io, "admin:feature:new", payload));
  on("admin:policy:review", (payload) => emitToAdmins(io, "admin:policy:review", payload));
  on("admin:permissions:changed", (payload) => emitToAdmins(io, "admin:permissions:changed", payload));
  on("admin:telegram:status", (payload) => emitToAdmins(io, "admin:telegram:status", payload));

  io.use(banCheck);

  io.on("connection", (socket) => {
    socket.data.isAdmin = false;
    setOnlineCount(io.engine.clientsCount);
    io.emit("online", { online: io.engine.clientsCount });
    socket.emit("connected", {
      online: io.engine.clientsCount,
      ip: socket.data.ip ?? "unknown",
    });

    // Browser admin panels authenticate their socket with the short-lived JWT
    // (sent via handshake.auth.token). Verifying it lets the admin push events
    // reach real admin sessions instead of only the shared-password bots.
    const rawToken = socket.handshake.auth?.token;
    if (typeof rawToken === "string" && rawToken.length > 0 && rawToken.length < 4096) {
      const payload = verifyAuthToken(rawToken);
      if (payload) {
        void prisma.user
          .findUnique({ where: { id: payload.sub }, select: { role: true, blocked: true } })
          .then((user) => {
            if (
              user &&
              !user.blocked &&
              (user.role === "ADMIN" || user.role === "SUPER_ADMIN")
            ) {
              socket.data.isAdmin = true;
            }
          })
          .catch(() => {});
      }
    }

    socket.on("disconnect", () => {
      adminAuthCooldown.remove(socket.id);
      setOnlineCount(io.engine.clientsCount);
      io.emit("online", { online: io.engine.clientsCount });
    });

    registerAdminHandlers(socket);
  });

  const dispose = () => {
    for (const u of unsubscribes) u();
    unsubscribes.length = 0;
    activeDispose = null;
  };
  activeDispose = dispose;
  return dispose;
}

function registerAdminHandlers(socket: Socket): void {
  // Authenticate as an admin with the shared password.
  socket.on("admin:auth", (data: unknown) => {
    if (!adminAuthCooldown.check(socket.id)) return;
    if (!adminAuthLimiter.allow(socket.data.ip ?? "unknown")) return;
    const parsed = parseZod(adminAuthSchema, data);
    if (!parsed) return;
    if (safeEqual(parsed.password, config.adminPassword)) {
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
