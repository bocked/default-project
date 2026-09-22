/**
 * View counting guard.
 *
 * The public feed used to increment `views` on every request, so refreshes,
 * pagination and crawler runs inflated the numbers far beyond real visitors.
 * This module enforces two rules:
 *  - one view per quote per visitor per 24h window (visitor = authenticated
 *    user id, otherwise the client IP), and
 *  - requests from known bots / headless crawlers never count at all.
 *
 * Dedupe state lives in Redis (`view:<visitor>:<quoteId>` with a 24h TTL) so
 * the window survives restarts and multiple instances share one counter. When
 * Redis is not available the same keys are tracked in memory with the exact
 * same 24h window, which keeps local development zero-setup.
 */

import { redis } from "./redis.js";

const VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;
const VIEW_WINDOW_SECONDS = 24 * 60 * 60;

/** Common bots, crawlers and automated downloaders that must not inflate views. */
const BOT_PATTERNS = [
  "googlebot",
  "bingbot",
  "yandex",
  "duckduckbot",
  "baiduspider",
  "ia_archiver",
  "archive.org_bot",
  "semrush",
  "ahrefs",
  "mj12bot",
  "dotbot",
  "serpstatbot",
  "seznamBot",
  "sogou",
  "twitterbot",
  "facebookexternalhit",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  "slackbot",
  "discordbot",
  "viber",
  "skypeuripreview",
  "pinterest",
  "snapchat",
  "tumblr",
  "redditbot",
  "bingpreview",
  "petalbot",
  "applebot",
  "bytespider",
  "gptbot",
  "ccbot",
  "amazonbot",
  "curl",
  "wget",
  "python-requests",
  "python-urllib",
  "go-http-client",
  "java/",
  "okhttp",
  "libwww-perl",
  "node-fetch",
  "axios",
  "postmanruntime",
  "headlesschrome",
  "phantomjs",
  "puppeteer",
  "playwright",
  "selenium",
  "chrome-lighthouse",
  "lighthouse",
  "page speed insights",
  "gtmetrix",
  "pingdom",
  "uptimerobot",
  "internetseer",
  "zgrab",
  "masscan",
  "nmap",
  "scrapy",
  "monitoring",
  "healthcheck",
];

/** True when the User-Agent looks like a bot / automated client. A missing
 *  User-Agent is treated as a bot because browsers always send one. */
export function isBotUserAgent(userAgent: string | undefined): boolean {
  if (!userAgent) return true;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p));
}

/** Per-`visitor:quote` 24h cooldown backed by Redis, with an in-memory window
 *  used whenever Redis is unavailable (local development, tests). */
export class ViewDedupe {
  private readonly seen = new Map<string, number>();

  private markDone(key: string, now: number): void {
    // Bound memory: drop entries older than the window first.
    for (const [k, at] of this.seen) {
      if (now - at >= VIEW_WINDOW_MS) this.seen.delete(k);
    }
    this.seen.set(key, now);
  }

  /** True when this key has not been seen within the window. Marks it seen. */
  async shouldCount(key: string, now: number = Date.now()): Promise<boolean> {
    if (redis.available) {
      try {
        const result = await redis.client!.set(key, "1", "EX", VIEW_WINDOW_SECONDS, "NX");
        return result === "OK";
      } catch {
        /* fall back to the in-memory window */
      }
    }
    const last = this.seen.get(key);
    if (last !== undefined && now - last < VIEW_WINDOW_MS) return false;
    this.markDone(key, now);
    return true;
  }

  /** Bulk variant of shouldCount for feeds: sets all keys in one Redis
   *  pipeline and returns which ones were fresh. Falls back to sequential
   *  in-memory checks when Redis is unavailable. */
  async countFresh(keys: readonly string[]): Promise<boolean[]> {
    if (keys.length === 0) return [];
    if (redis.available) {
      try {
        const client = redis.client!;
        const pipe = client.pipeline();
        for (const key of keys) pipe.set(key, "1", "EX", VIEW_WINDOW_SECONDS, "NX");
        const results = await pipe.exec();
        if (results == null) throw new Error("redis pipeline failed");
        return results.map(([err, res]) => {
          if (err) return false;
          return res === "OK" || res === true || typeof res === "number";
        });
      } catch {
        /* fall back to the in-memory window */
      }
    }
    const now = Date.now();
    return keys.map((key) => {
      const last = this.seen.get(key);
      if (last !== undefined && now - last < VIEW_WINDOW_MS) return false;
      this.markDone(key, now);
      return true;
    });
  }

  /** Drops entries older than the window (memory fallback only). */
  prune(now: number = Date.now()): void {
    for (const [key, at] of this.seen) {
      if (now - at >= VIEW_WINDOW_MS) this.seen.delete(key);
    }
  }

  /** Test helper: forget everything. */
  clear(): void {
    this.seen.clear();
  }
}

export const viewDedupe = new ViewDedupe();