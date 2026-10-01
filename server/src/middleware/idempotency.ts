import crypto from "node:crypto";
import type { RequestHandler, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { clientIp } from "../lib/ip.js";

/**
 * Server half of the client's retry-idempotency contract.
 *
 * The browser client retries a request up to three times when a network error or
 * timeout occurs (see MAX_RETRIES in client/src/lib/api.ts). For a non-idempotent
 * POST that is not safe by itself: a request that timed out *after* the server
 * committed it would be executed twice, so an admin could double-approve a quote,
 * double-charge a payment-like action, or post the same announcement to the
 * Telegram channel twice. The client now sends a stable `X-Idempotency-Key` for
 * every mutating call, and this middleware replays the first successful outcome
 * for any repeat of that key.
 *
 * Scope and safety decisions:
 *  - The key is scoped per caller. A shared secret such as the ADMIN_PASSWORD
 *    bearer must not let one admin suppress or observe another's action, so the
 *    cache key mixes in the client IP and a SHA-256 of the Authorization header.
 *    Hashing means no token is stored in memory.
 *  - Only 2xx responses are cached. Caching a 500 would make a genuine server
 *    fault permanent for that key, and an error body is not a useful replay.
 *  - Responses carrying Set-Cookie are never cached. Auth endpoints mint cookies
 *    and are not idempotent in their observable effects, so they bypass this
 *    entirely and rely on their own single-use guards.
 *  - The cache is bounded by entry count and swept lazily on write, so a burst of
 *    one-shot keys cannot grow the heap without limit.
 *
 * Limitation: the cache lives in process memory, so replay protection is per
 * instance. That matches the single-instance PM2 topology in
 * deploy/ecosystem.config.cjs; a horizontal scale-out would need this moved to
 * Redis (the bus already provides the Redis client for exactly this kind of
 * cross-instance state).
 */

const HEADER = "x-idempotency-key";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type CachedResponse = { status: number; body: unknown; expiresAt: number };

const cache = new Map<string, CachedResponse>();

/** Drops expired entries and enforces the cap; called on every cache write. */
function sweep(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  // Map preserves insertion order, so the oldest keys come first.
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) break;
    cache.delete(oldest.value);
  }
}

/**
 * Derives the cache scope. Hashing the Authorization header keeps the caller's
 * token out of memory while still separating "admin A retries" from
 * "admin B reuses the same key".
 */
function scopeFor(req: Parameters<RequestHandler>[0]): string | null {
  const raw = req.headers[HEADER];
  const key = Array.isArray(raw) ? raw[0] : raw;
  if (!key || key.length > 200) return null;
  const auth = req.headers.authorization ?? "";
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${clientIp(req.headers)}|${auth}`)
    .digest("hex")
    .slice(0, 32);
  return `${fingerprint}:${key}`;
}

export const idempotencyGuard: RequestHandler = asyncHandler(async (req, res, next) => {
  if (!MUTATING.has(req.method)) {
    next();
    return;
  }
  const scope = scopeFor(req);
  if (!scope) {
    next();
    return;
  }

  const now = Date.now();
  const hit = cache.get(scope);
  if (hit) {
    if (hit.expiresAt > now) {
      // Replay the original outcome instead of executing the handler again.
      res.setHeader("X-Idempotency-Replayed", "1");
      res.status(hit.status).json(hit.body);
      return;
    }
    cache.delete(scope);
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    const response = res as Response;
    const setCookie = response.getHeader("Set-Cookie");
    if (response.statusCode >= 200 && response.statusCode < 300 && setCookie === undefined) {
      cache.set(scope, { status: response.statusCode, body, expiresAt: Date.now() + TTL_MS });
      sweep(Date.now());
    }
    return originalJson(body);
  }) as Response["json"];

  next();
});

/** Test seam: drops all remembered outcomes. */
export function __resetIdempotencyCache(): void {
  cache.clear();
}