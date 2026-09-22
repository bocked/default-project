import { io, type Socket } from "socket.io-client";
import { config } from "./config";

let socket: Socket | null = null;

/** Shared Socket.IO connection to the backend. Used by the admin dashboard to
 *  receive real-time "online" updates (the server broadcasts the client count
 *  on every connect/disconnect). Single shared instance per page. */
export function adminSocket(): Socket {
  if (!socket) {
    socket = io(config.url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 2000,
      timeout: 8000,
    });
  }
  return socket;
}

/** Disconnects the shared socket (best-effort; used when leaving the admin UI). */
export function closeAdminSocket(): void {
  socket?.disconnect();
  socket = null;
}