/**
 * Strict unique-visitor analytics.
 *
 * Every page view is deduplicated server-side before it is counted:
 *  - a unique visitor key `visitor:<day>:<sha256(ip|ua)>` is written to Redis
 *    with a 24h TTL (`NX`), so the same IP+User-Agent only counts once per day;
 *  - bots / crawlers are filtered out by User-Agent and never count;
 *  - running per-day counters live in Redis (`analytics:uv:<day>`,
 *    `analytics:pv:<day>`), so a page view never touches the database;
 *  - a background flush folds the counters into the `DailyStat` table (DB is
 *    the durable, chartable record), and today's numbers are read straight
 *    from Redis for real-time admin stats.
 *
 * When Redis is unavailable the same logic runs against in-memory maps, so
 * local development behaves identically.
 */

import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { redis } from "./redis.js";
import { clientIp } from "./ip.js";
import { isBotUserAgent } from "./views.js";
import { cachedGet, CACHE_PREFIXES } from "./redisCache.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Redis key layout
//   visitor:<day>:<hash>       unique-visitor marker (SET NX, EXPIRE 24h)
//   analytics:uv:<day>         running unique-visitor counter
//   analytics:pv:<day>         running page-view counter
//   analytics:flushed:<day>    counter snapshots already folded into the DB
//   analytics:days             index of days that have counters
// ---------------------------------------------------------------------------

const VISITOR_PREFIX = "visitor";
const COUNTER_PREFIX = "analytics";
const DAY_INDEX_KEY = "analytics:days";

function visitorKey(day: string, hash: string): string {
  return `${VISITOR_PREFIX}:${day}:${hash}`;
}

function uvKey(day: string): string {
  return `${COUNTER_PREFIX}:uv:${day}`;
}

function pvKey(day: string): string {
  return `${COUNTER_PREFIX}:pv:${day}`;
}

function flushedKey(day: string): string {
  return `${COUNTER_PREFIX}:flushed:${day}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

/** Stable, deterministic digest of the visitor's IP + User-Agent. The 24-char
 *  SHA-256 prefix is enough to identify a visitor without storing raw data. */
function visitorHash(ip: string, userAgent: string): string {
  return crypto.createHash("sha256").update(`${ip}|${userAgent}`).digest("hex").slice(0, 24);
}

// ---------------------------------------------------------------------------
// In-memory fallback (no Redis)
// ---------------------------------------------------------------------------

interface MemDay {
  pv: number;
  uv: number;
  visitors: Map<string, number>;
  flushedPv: number;
  flushedUv: number;
}

const memCounters = new Map<string, MemDay>();

/** Keep the fallback map bounded to rolling ~90 days. */
function pruneMemory(): void {
  const keep = dayAgo(90);
  for (const day of memCounters.keys()) {
    if (day < keep) memCounters.delete(day);
  }
}

function memDay(day: string): MemDay {
  let entry = memCounters.get(day);
  if (!entry) {
    entry = { pv: 0, uv: 0, visitors: new Map(), flushedPv: 0, flushedUv: 0 };
    memCounters.set(day, entry);
    if (memCounters.size > 90) pruneMemory();
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

/** Records a page view for the request. Bots are ignored; the same visitor
 *  counts at most once per day. Never touches the database. */
export async function trackPageView(
  headers: Record<string, string | string[] | undefined>
): Promise<void> {
  const userAgent = typeof headers["user-agent"] === "string" ? headers["user-agent"] : "";
  if (isBotUserAgent(userAgent)) return;
  const ip = clientIp(headers) === "unknown" ? "anon" : clientIp(headers);
  const day = today();
  const hash = visitorHash(ip, userAgent.toLowerCase());

  if (redis.available) {
    try {
      const client = redis.client!;
      const key = visitorKey(day, hash);
      const pipe = client.pipeline();
      pipe.sadd(DAY_INDEX_KEY, day);
      pipe.set(key, "1", "EX", DAY_MS / 1000, "NX");
      pipe.incr(pvKey(day));
      const results = await pipe.exec();
      if (results == null) return;
      // `SET key 1 EX 86400 NX` answers "OK" only when the visitor is new today.
      const setResult = results[1];
      const fresh = setResult != null && setResult[0] == null && setResult[1] === "OK";
      if (fresh) await client.incr(uvKey(day));
      return;
    } catch {
      /* fall back to the in-memory counters */
    }
  }

  const entry = memDay(day);
  const now = Date.now();
  const last = entry.visitors.get(hash);
  if (last === undefined || now - last >= DAY_MS) {
    entry.visitors.set(hash, now);
    entry.uv += 1;
  }
  entry.pv += 1;
}

// ---------------------------------------------------------------------------
// Reads (Redis-first; the DB is the durable store for history)
// ---------------------------------------------------------------------------

export interface DayStats {
  date: string;
  visitors: number;
  pageViews: number;
}

/** Today's live numbers straight from the counters (no DB read). */
export async function todayAnalytics(): Promise<{ visitors: number; pageViews: number }> {
  if (redis.available) {
    try {
      const day = today();
      const [uv, pv] = await Promise.all([redis.client!.get(uvKey(day)), redis.client!.get(pvKey(day))]);
      return { visitors: Number(uv ?? 0), pageViews: Number(pv ?? 0) };
    } catch {
      /* fall through */
    }
  }
  const entry = memCounters.get(today());
  return { visitors: entry?.uv ?? 0, pageViews: entry?.pv ?? 0 };
}

/** Last `days` days of unique visitors / page views, oldest first. History comes
 *  from the DB (cached in Redis); today's point is the live counter value. */
export async function visitorHistory(days: number): Promise<DayStats[]> {
  const safeDays = Math.min(90, Math.max(7, Math.floor(days) || 30));
  // The result changes every minute and whenever counters flush, so keep the
  // cache short-lived. Redis is always checked before any DB work.
  return cachedGet(CACHE_PREFIXES.analytics, `visitors:${safeDays}`, 60_000, async () => {
    const end = today();
    const start = dayAgo(safeDays - 1);
    const rows = await prisma.dailyStat.findMany({
      where: { date: { gte: start, lte: end } },
      select: { date: true, visitors: true, pageViews: true },
    });
    const byDate = new Map(rows.map((r) => [r.date, r]));

    const points: DayStats[] = [];
    for (let i = 0; i < safeDays; i++) {
      const date = dayAgo(safeDays - 1 - i);
      const stored = byDate.get(date);
      points.push({ date, visitors: stored?.visitors ?? 0, pageViews: stored?.pageViews ?? 0 });
    }
    // The last point (today) reflects the live Redis counters on top of the
    // DB baseline the flush already committed.
    const live = await todayAnalytics();
    points[points.length - 1] = { ...points[points.length - 1], ...live };
    return points;
  });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Folds pending Redis/memory counters into the `DailyStat` table. Runs on a
 *  background interval and on shutdown. DB writes only happen for deltas. A
 *  simple in-flight guard stops concurrent flushes from double-applying. */
let flushing = false;

export async function flushAnalyticsToDb(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    if (redis.available) {
      await flushFromRedis();
    } else {
      await flushFromMemory();
    }
  } catch (err) {
    // A failed fold is non-fatal; the next interval retries the same window.
    console.error("analytics flush failed", err);
  } finally {
    flushing = false;
  }
}

async function flushFromRedis(): Promise<void> {
  const client = redis.client!;
  let days: string[];
  try {
    days = await client.smembers(DAY_INDEX_KEY);
  } catch {
    return;
  }
  if (days.length === 0) return;

  const pipe = client.pipeline();
  for (const day of days) {
    pipe.get(uvKey(day));
    pipe.get(pvKey(day));
    pipe.get(flushedKey(day));
  }
  const results = await pipe.exec();
  if (results == null) return;

  const writes = days.map(async (day, i) => {
    const [, uv] = results[i * 3] ?? [];
    const [, pv] = results[i * 3 + 1] ?? [];
    const [, flushedRaw] = results[i * 3 + 2] ?? [];
    const uvN = Number(uv ?? 0);
    const pvN = Number(pv ?? 0);
    const [flushedUv, flushedPv] = parseFlushed(flushedRaw);
    const dUv = uvN - flushedUv;
    const dPv = pvN - flushedPv;
    if (dUv <= 0 && dPv <= 0) return;
    const ok = await applyDelta(day, dUv, dPv);
    if (ok) await client.set(flushedKey(day), `${uvN}:${pvN}`);
  });
  await Promise.all(writes);
}

async function flushFromMemory(): Promise<void> {
  for (const [day, entry] of memCounters) {
    const dUv = entry.uv - entry.flushedUv;
    const dPv = entry.pv - entry.flushedPv;
    if (dUv <= 0 && dPv <= 0) continue;
    const ok = await applyDelta(day, dUv, dPv);
    if (ok) {
      entry.flushedUv = entry.uv;
      entry.flushedPv = entry.pv;
    }
  }
}

function parseFlushed(raw: unknown): [number, number] {
  const text = typeof raw === "string" ? raw : "";
  const [uv, pv] = text.split(":").map((n) => Number(n));
  return [Number.isFinite(uv) ? uv : 0, Number.isFinite(pv) ? pv : 0];
}

async function applyDelta(day: string, visitors: number, pageViews: number): Promise<boolean> {
  try {
    await prisma.dailyStat.upsert({
      where: { date: day },
      update: { visitors: { increment: visitors }, pageViews: { increment: pageViews } },
      create: { date: day, visitors, pageViews },
    });
    return true;
  } catch {
    return false;
  }
}