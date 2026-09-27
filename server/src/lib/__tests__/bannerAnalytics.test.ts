import { describe, expect, it } from "vitest";
import { BannerDedupe, BANNER_SLOTS, isBannerSlot, isBotUserAgent, uaHash } from "../bannerAnalytics.js";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MINUS_ONE = HOUR_MS - 1;
const WINDOW_PLUS_ONE = HOUR_MS + 1;

describe("banner slots", () => {
  it("exposes every placement used by the frontend", () => {
    expect(BANNER_SLOTS).toEqual(["left", "right", "top", "feed", "bottom"]);
  });

  it("isBannerSlot accepts only known slots", () => {
    for (const slot of BANNER_SLOTS) expect(isBannerSlot(slot)).toBe(true);
    expect(isBannerSlot("middle")).toBe(false);
    expect(isBannerSlot(123)).toBe(false);
    expect(isBannerSlot(undefined)).toBe(false);
  });
});

describe("uaHash", () => {
  it("is stable and short", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0) Chrome/125.0.0.0 Safari/537.36";
    expect(uaHash(ua)).toBe(uaHash(ua));
    expect(uaHash(ua)).toHaveLength(16);
    expect(uaHash(ua)).not.toBe(uaHash("different user agent"));
  });
});

describe("isBotUserAgent (banner import)", () => {
  it("rejects bots and missing agents, lets browsers through", () => {
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
    expect(
      isBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
    ).toBe(false);
  });
});

describe("BannerDedupe", () => {
  it("counts the first event and rejects repeats inside the 1h window", async () => {
    const d = new BannerDedupe();
    expect(await d.shouldCount("banner:track:top:view:1.1.1.1:abc", 0)).toBe(true);
    expect(await d.shouldCount("banner:track:top:view:1.1.1.1:abc", 1_000)).toBe(false);
    expect(await d.shouldCount("banner:track:top:view:1.1.1.1:abc", WINDOW_MINUS_ONE)).toBe(false);
  });

  it("counts again after the window", async () => {
    const d = new BannerDedupe();
    await d.shouldCount("banner:track:top:view:1.1.1.1:abc", 0);
    expect(await d.shouldCount("banner:track:top:view:1.1.1.1:abc", WINDOW_PLUS_ONE)).toBe(true);
  });

  it("keeps slots, event types and visitors independent", async () => {
    const d = new BannerDedupe();
    expect(await d.shouldCount("banner:track:top:view:1.1.1.1:abc", 0)).toBe(true);
    expect(await d.shouldCount("banner:track:top:click:1.1.1.1:abc", 0)).toBe(true);
    expect(await d.shouldCount("banner:track:left:view:1.1.1.1:abc", 0)).toBe(true);
    expect(await d.shouldCount("banner:track:top:view:2.2.2.2:abc", 0)).toBe(true);
    expect(await d.shouldCount("banner:track:top:view:1.1.1.1:def", 0)).toBe(true);
    expect(await d.shouldCount("banner:track:top:view:1.1.1.1:abc", 0)).toBe(false);
  });
});