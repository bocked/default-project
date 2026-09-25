import { io, type Socket } from "socket.io-client";
import { config } from "./config";
import { tokenStore } from "./api";

let socket: Socket | null = null;

/** Shared Socket.IO connection to the backend. Used by the admin UI to receive
 *  real-time "online" updates and the admin push events (policy review,
 *  feature registration, permission changes). The current admin JWT rides the
 *  handshake (evaluated live) so the server can mark this socket as an admin
 *  and push the admin-only events to it. Single shared instance per page. */
export function adminSocket(): Socket {
  if (!socket) {
    socket = io(config.url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      timeout: 8000,
      auth: (cb) => cb({ token: tokenStore.get() }),
    });
  }
  return socket;
}

/** Disconnects the shared socket (best-effort; used when leaving the admin UI). */
export function closeAdminSocket(): void {
  socket?.disconnect();
  socket = null;
}