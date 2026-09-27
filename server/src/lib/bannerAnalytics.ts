/**
 * Banner ad analytics (MRC viewability / AdSense-style Active View).
 *
 * Impressions are counted only for facts the browser really saw: the frontend
 * fires `POST /api/banners/track` when ≥50% of a banner stayed visible for
 * ≥1000ms and again on a real click. This module keeps the counters honest by
 * enforcing the same guard used for quote views:
 *  - one view/click per visitor per slot per 1h window (visitor = IP + UA hash), and
 *  - requests from known bots / headless crawlers never count at all.
 *
 * Dedupe state lives in Redis (`banner:track:<slot>:<type>:<ip>:<ua>` with a 1h
 * TTL) so the window survives restarts and multiple instances share one
 * counter. When Redis is not available the same keys are tracked in memory with
 * the exact same 1h window, which keeps local development zero-setup.
 */

import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";
import { redis } from "./redis.js";
import { isBotUserAgent } from "./views.js";

export { isBotUserAgent };

/** All placements a banner can occupy. Kept in sync with the frontend. */
export const BANNER_SLOTS = ["left", "right", "top", "feed", "bottom"] as const;
export type BannerSlot = (typeof BANNER_SLOTS)[number];

/** Event kinds the public track endpoint accepts. */
export type BannerEventType = "view" | "click";

const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const DEDUPE_WINDOW_SECONDS = 60 * 60;

export function isBannerSlot(value: unknown): value is BannerSlot {
  return typeof value === "string" && (BANNER_SLOTS as readonly string[]).includes(value);
}

/** Stable short digest of a visitor's User-Agent for the dedupe key. */
export function uaHash(userAgent: string): string {
  return createHash("sha1").update(userAgent).digest("hex").slice(0, 16);
}

/** 1h per-`visitor:slot:event` cooldown backed by Redis, with an in-memory
 *  window used whenever Redis is unavailable (local development, tests). */
export class BannerDedupe {
  private readonly seen = new Map<string, number>();

  private markDone(key: string, now: number): void {
    // Bound memory: drop entries older than the window first.
    for (const [k, at] of this.seen) {
      if (now - at >= DEDUPE_WINDOW_MS) this.seen.delete(k);
    }
    this.seen.set(key, now);
  }

  /** True when this key has not been seen within the window. Marks it seen. */
  async shouldCount(key: string, now: number = Date.now()): Promise<boolean> {
    if (redis.available) {
      try {
        const result = await redis.client!.set(key, "1", "EX", DEDUPE_WINDOW_SECONDS, "NX");
        return result === "OK";
      } catch {
        /* fall back to the in-memory window */
      }
    }
    const last = this.seen.get(key);
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
    this.markDone(key, now);
    return true;
  }

  /** Test helper: forget everything. */
  clear(): void {
    this.seen.clear();
  }
}

export const bannerDedupe = new BannerDedupe();

/**
 * Counts a single view/click after the 1h dedupe pass.
 * Returns false when this visitor+UA already counted in this window.
 */
export async function countBannerEvent(slot: BannerSlot, type: BannerEventType, ip: string, userAgent: string): Promise<boolean> {
  const key = `banner:track:${slot}:${type}:${ip}:${uaHash(userAgent)}`;
  if (!(await bannerDedupe.shouldCount(key))) return false;
  if (type === "click") {
    await prisma.bannerAnalytics.upsert({
      where: { slot },
      update: { clicks: { increment: 1 } },
      create: { slot, clicks: 1 },
    });
  } else {
    await prisma.bannerAnalytics.upsert({
      where: { slot },
      update: { views: { increment: 1 } },
      create: { slot, views: 1 },
    });
  }
  return true;
}

export interface BannerStatsRow {
  slot: BannerSlot;
  views: number;
  clicks: number;
  /** Click-through rate as a percentage (0 when there are no views yet). */
  ctr: number;
}

/** Full per-slot stats in slot order, including slots with no data yet. */
export async function bannerStats(): Promise<BannerStatsRow[]> {
  const rows = await prisma.bannerAnalytics.findMany();
  const map = new Map(rows.map((r) => [r.slot, r]));
  return BANNER_SLOTS.map((slot) => {
    const row = map.get(slot);
    const views = row?.views ?? 0;
    const clicks = row?.clicks ?? 0;
    return { slot, views, clicks, ctr: views > 0 ? (clicks / views) * 100 : 0 };
  });
}

/** Zeroes the counters of a single slot (keeps the row so ordering is stable). */
export async function resetBannerStats(slot: BannerSlot): Promise<void> {
  await prisma.bannerAnalytics.upsert({
    where: { slot },
    update: { views: 0, clicks: 0 },
    create: { slot, views: 0, clicks: 0 },
  });
}