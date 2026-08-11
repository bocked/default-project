import { Router } from "express";

export const apiRouter = Router();

let online = 0;

/** Sets the number of connected socket clients (called by the socket layer). */
export function setOnlineCount(n: number): void {
  online = n;
}

/** Current number of connected socket clients. */
export function onlineCount(): number {
  return online;
}

// GET /api/health
apiRouter.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// GET /api/online - connected client count
apiRouter.get("/online", (_req, res) => {
  res.json({ online: onlineCount() });
});
