import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, cleanDatabase, request, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

// The public admin password is only safe to use in a throwaway test database.
const ADMIN = ADMIN_PASSWORD;

const BROWSER_UA = {
  viewA: "Mozilla/5.0 (E2E-ViewA/1.0; +tests) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
  viewB: "Mozilla/5.0 (E2E-ViewB/1.0; +tests) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
  clickC: "Mozilla/5.0 (E2E-ClickC/1.0; +tests) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
  bot: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
};

const track = (base: string, slot: string, type: string, ua: string) =>
  request(base, "POST", "/api/banners/track", {
    headers: { "User-Agent": ua },
    body: { slot, type },
  });

describe("E2E: banner analytics (track, dedupe, admin stats/reset)", () => {
  let ts: TestServer;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
  });

  afterAll(async () => {
    await ts.close();
  });

  it("rejects unknown slots and event types", async () => {
    const badSlot = await track(base, "middle", "view", BROWSER_UA.viewA);
    expect(badSlot.status).toBe(400);

    const badType = await track(base, "top", "hover", BROWSER_UA.viewA);
    expect(badType.status).toBe(400);
  });

  it("rejects bots and missing User-Agents", async () => {
    const bot = await track(base, "top", "view", BROWSER_UA.bot);
    expect(bot.status).toBe(403);
    // A truly UA-less request cannot be crafted via fetch/undici (it injects
    // its own header); the missing-UA → bot shortcut is covered by the unit
    // tests (isBotUserAgent(undefined) === true).
  });

  it("counts a real view once, then dedupes inside the 1h window", async () => {
    const first = await track(base, "top", "view", BROWSER_UA.viewA);
    expect(first.status).toBe(200);
    expect(first.json.counted).toBe(true);

    const repeat = await track(base, "top", "view", BROWSER_UA.viewA);
    expect(repeat.status).toBe(200);
    expect(repeat.json.counted).toBe(false);

    const otherVisitor = await track(base, "top", "view", BROWSER_UA.viewB);
    expect(otherVisitor.status).toBe(200);
    expect(otherVisitor.json.counted).toBe(true);
  });

  it("counts a click separately from views", async () => {
    const click = await track(base, "top", "click", BROWSER_UA.clickC);
    expect(click.status).toBe(200);
    expect(click.json.counted).toBe(true);

    const echoClick = await track(base, "top", "click", BROWSER_UA.viewA);
    expect(echoClick.status).toBe(200);
    expect(echoClick.json.counted).toBe(true);
  });

  it("blocks unauthenticated admin access to banner stats", async () => {
    const res = await request(base, "GET", "/api/admin/banners/stats");
    expect(res.status).toBe(401);
  });

  it("returns per-slot stats with ctr and the counted values", async () => {
    const res = await request(base, "GET", "/api/admin/banners/stats", { token: ADMIN });
    expect(res.status).toBe(200);
    expect(res.json.stats).toHaveLength(5);
    const top = res.json.stats.find((s: any) => s.slot === "top");
    expect(top.views).toBe(2);
    expect(top.clicks).toBe(2);
    expect(top.ctr).toBe(100);
    for (const s of res.json.stats) {
      expect(s).toMatchObject({ slot: expect.any(String), views: expect.any(Number), clicks: expect.any(Number) });
    }
  });

  it("resets a single slot back to zero", async () => {
    const reset = await request(base, "POST", "/api/admin/banners/stats/reset", {
      token: ADMIN,
      body: { slot: "top" },
    });
    expect(reset.status).toBe(200);
    expect(reset.json.ok).toBe(true);

    const after = await request(base, "GET", "/api/admin/banners/stats", { token: ADMIN });
    const top = after.json.stats.find((s: any) => s.slot === "top");
    expect(top.views).toBe(0);
    expect(top.clicks).toBe(0);
  });

  it("rejects resetting an unknown slot", async () => {
    const res = await request(base, "POST", "/api/admin/banners/stats/reset", {
      token: ADMIN,
      body: { slot: "middle" },
    });
    expect(res.status).toBe(400);
  });
});