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
 * Dedupe state is in-memory (single app instance). After a restart the window
 * simply starts over, which is acceptable for the "most read" analytics.
 */

const VIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

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

/** Per-`visitor:quote` cooldown map. Rejects repeated views within the window. */
export class ViewDedupe {
  private readonly seen = new Map<string, number>();

  /** True when this key has not been seen within the window (a fresh view). */
  shouldCount(key: string, now: number = Date.now()): boolean {
    const last = this.seen.get(key);
    if (last !== undefined && now - last < VIEW_WINDOW_MS) return false;
    this.seen.set(key, now);
    return true;
  }

  /** Drops entries older than the window so memory stays bounded. */
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
