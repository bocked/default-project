import { describe, expect, it } from "vitest";
import { ViewDedupe, isBotUserAgent } from "../views.js";

describe("isBotUserAgent", () => {
  it("treats a missing User-Agent as a bot", () => {
    expect(isBotUserAgent(undefined)).toBe(true);
  });

  it("recognises search-engine and social crawlers", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBotUserAgent("twitterbot/1.0")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; YandexBot/3.0)")).toBe(true);
  });

  it("recognises headless browsers and downloaders", () => {
    expect(isBotUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120 Safari/537.36")).toBe(true);
    expect(isBotUserAgent("curl/8.4.0")).toBe(true);
    expect(isBotUserAgent("python-requests/2.31.0")).toBe(true);
  });

  it("lets real browsers through", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
      )
    ).toBe(false);
    expect(isBotUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(false);
  });
});

describe("ViewDedupe", () => {
  it("counts the first view and rejects repeats inside the window", () => {
    const d = new ViewDedupe();
    expect(d.shouldCount("ip:1:quote-1", 0)).toBe(true);
    expect(d.shouldCount("ip:1:quote-1", 1000)).toBe(false);
    expect(d.shouldCount("ip:1:quote-1", VIEW_WINDOW_MINUS_ONE)).toBe(false);
  });

  it("counts again after the window", () => {
    const d = new ViewDedupe();
    d.shouldCount("ip:1:quote-1", 0);
    expect(d.shouldCount("ip:1:quote-1", VIEW_WINDOW_PLUS_ONE)).toBe(true);
  });

  it("tracks visitors and quotes independently", () => {
    const d = new ViewDedupe();
    expect(d.shouldCount("ip:1:quote-1", 0)).toBe(true);
    expect(d.shouldCount("ip:2:quote-1", 0)).toBe(true);
    expect(d.shouldCount("ip:1:quote-2", 0)).toBe(true);
    expect(d.shouldCount("ip:1:quote-1", 0)).toBe(false);
  });

  it("prunes expired keys", () => {
    const d = new ViewDedupe();
    d.shouldCount("ip:1:quote-1", 0);
    d.prune(VIEW_WINDOW_PLUS_ONE);
    expect(d.shouldCount("ip:1:quote-1", VIEW_WINDOW_PLUS_ONE)).toBe(true);
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;
const VIEW_WINDOW_MINUS_ONE = DAY_MS - 1;
const VIEW_WINDOW_PLUS_ONE = DAY_MS + 1;
