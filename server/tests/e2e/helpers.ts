import type { Server as HttpServer } from "node:http";
import type { Server as IOServer } from "socket.io";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";

export interface TestServer {
  base: string;
  server: HttpServer;
  io: IOServer;
  close: () => Promise<void>;
}

/** Boots the real app (Express + Socket.IO) on an ephemeral local port. */
export async function startTestServer(): Promise<TestServer> {
  const { server, io } = createApp({ autoLogging: false, noRateLimits: true });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind a port");
  const base = `http://127.0.0.1:${address.port}`;
  return {
    base,
    server,
    io,
    close: async () => {
      io.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.$disconnect();
    },
  };
}

/** Wipes every table so each test file starts from a known state. */
export async function cleanDatabase(): Promise<void> {
  await prisma.$transaction([prisma.bannedIp.deleteMany()]);
}

export interface ReqOptions {
  token?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/** Minimal fetch wrapper returning `{ status, json }`. */
export async function request(base: string, method: string, path: string, options: ReqOptions = {}): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  return { status: res.status, json };
}

export function unique(prefix: string): string {
  return `${prefix}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
}

/** Waits for an event matching `predicate`, rejecting after `timeoutMs`. */
export function onceMatch<T>(
  on: (cb: (payload: T) => void) => void,
  predicate: (payload: T) => boolean,
  timeoutMs = 8000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out waiting for socket event")), timeoutMs);
    on((payload) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        resolve(payload);
      }
    });
  });
}

export const ADMIN_PASSWORD = "change-me";
