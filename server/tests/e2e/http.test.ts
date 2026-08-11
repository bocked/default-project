import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, cleanDatabase, request, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

// The public admin password is only safe to use in a throwaway test database.
const ADMIN = ADMIN_PASSWORD;

describe("E2E: HTTP flows (health, online, admin, bans, logs)", () => {
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

  it("GET /health and GET /api/health answer ok", async () => {
    const health = await request(base, "GET", "/health");
    expect(health.status).toBe(200);
    expect(health.json.ok).toBe(true);
    const apiHealth = await request(base, "GET", "/api/health");
    expect(apiHealth.status).toBe(200);
    expect(apiHealth.json.ok).toBe(true);
  });

  it("GET /api/online returns a number", async () => {
    const res = await request(base, "GET", "/api/online");
    expect(res.status).toBe(200);
    expect(typeof res.json.online).toBe("number");
  });

  it("rejects unauthenticated admin access", async () => {
    const stats = await request(base, "GET", "/api/admin/stats");
    expect(stats.status).toBe(401);
  });

  it("returns admin stats with a valid admin password", async () => {
    const res = await request(base, "GET", "/api/admin/stats", { token: ADMIN });
    expect(res.status).toBe(200);
    expect(typeof res.json.bans).toBe("number");
    expect(typeof res.json.online).toBe("number");
  });

  it("bans an IP, lists it, then unbans it", async () => {
    const ip = "203.0.113.77";
    const ban = await request(base, "POST", "/api/admin/bans", {
      token: ADMIN,
      body: { ipAddress: ip, reason: "E2E" },
    });
    expect(ban.status).toBe(200);
    expect(ban.json.ban.ipAddress).toBe(ip);

    const list = await request(base, "GET", "/api/admin/bans", { token: ADMIN });
    expect(list.status).toBe(200);
    expect(list.json.bans.some((b: any) => b.ipAddress === ip)).toBe(true);

    const unban = await request(base, "DELETE", `/api/admin/bans/${ip}`, { token: ADMIN });
    expect(unban.status).toBe(200);

    const after = await request(base, "GET", "/api/admin/bans", { token: ADMIN });
    expect(after.json.bans.some((b: any) => b.ipAddress === ip)).toBe(false);
  });

  it("rejects a ban body without an ipAddress", async () => {
    const res = await request(base, "POST", "/api/admin/bans", {
      token: ADMIN,
      body: { reason: "no ip" },
    });
    expect(res.status).toBe(400);
  });

  it("returns recent admin logs", async () => {
    const res = await request(base, "GET", "/api/admin/logs", { token: ADMIN });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.logs)).toBe(true);
    expect(res.json.logs.some((l: any) => l.message.includes("banned"))).toBe(true);
  });
});
