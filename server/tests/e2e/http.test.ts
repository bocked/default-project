import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

// The public admin password is only safe to use in a throwaway test database.
const ADMIN = ADMIN_PASSWORD;

describe("E2E: HTTP flows (auth, canvas, rooms, moderation, admin)", () => {
  let ts: TestServer;
  let base: string;
  let token = "";
  let username = "";
  let createdId = "";
  let roomSlug = "";

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
  });

  it("GET /api/online returns a number", async () => {
    const res = await request(base, "GET", "/api/online");
    expect(res.status).toBe(200);
    expect(typeof res.json.online).toBe("number");
  });

  it("registers a new user and returns a token", async () => {
    username = unique("e2euser");
    const res = await request(base, "POST", "/api/auth/register", {
      body: { username, password: "E2eTestParol123!" },
    });
    expect(res.status).toBe(201);
    expect(res.json.token).toBeTruthy();
    expect(res.json.user.username).toBe(username);
    token = res.json.token;
  });

  it("rejects a duplicate username", async () => {
    const res = await request(base, "POST", "/api/auth/register", {
      body: { username, password: "BoshqaParol123!" },
    });
    expect(res.status).toBe(409);
  });

  it("rejects login with a wrong password", async () => {
    const res = await request(base, "POST", "/api/auth/login", {
      body: { username, password: "NotoGriParol!" },
    });
    expect(res.status).toBe(401);
  });

  it("logs in and GET /api/auth/me returns the current user", async () => {
    const login = await request(base, "POST", "/api/auth/login", {
      body: { username, password: "E2eTestParol123!" },
    });
    expect(login.status).toBe(200);
    token = login.json.token;
    const me = await request(base, "GET", "/api/auth/me", { token });
    expect(me.status).toBe(200);
    expect(me.json.user.username).toBe(username);
  });

  it("creates TEXT and STICKY items over HTTP", async () => {
    const text = await request(base, "POST", "/api/items", {
      token,
      body: { type: "TEXT", content: "e2e matn", x: 10, y: 20 },
    });
    expect(text.status).toBe(200);
    expect(text.json.item.type).toBe("TEXT");
    const sticky = await request(base, "POST", "/api/items", {
      token,
      body: { type: "STICKY", content: "e2e yozuv", x: 30, y: 40, color: "#fef08a" },
    });
    expect(sticky.status).toBe(200);
    createdId = sticky.json.item.id;
  });

  it("lists items and paginates without overlap", async () => {
    const page1 = await request(base, "GET", "/api/items?limit=1");
    expect(page1.status).toBe(200);
    expect(page1.json.items.length).toBe(1);
    expect(page1.json.next).toBeTruthy();
    const page2 = await request(base, "GET", `/api/items?limit=1&before=${encodeURIComponent(page1.json.next)}`);
    expect(page2.status).toBe(200);
    expect(page2.json.items.some((i: any) => i.id === page1.json.items[0].id)).toBe(false);
    const all = [...page1.json.items, ...page2.json.items];
    expect(all.some((i: any) => i.id === createdId)).toBe(true);
  });

  it("rejects an item with invalid coordinates (zod)", async () => {
    const res = await request(base, "POST", "/api/items", {
      token,
      body: { type: "TEXT", content: "x", x: "not-a-number", y: 1 },
    });
    expect(res.status).toBe(400);
  });

  it("creates a room and lists it with an item count", async () => {
    const create = await request(base, "POST", "/api/rooms", {
      token,
      body: { name: "E2E Xona", isPublic: true },
    });
    expect(create.status).toBe(201);
    roomSlug = create.json.room.slug;
    const list = await request(base, "GET", "/api/rooms");
    expect(list.status).toBe(200);
    expect(list.json.rooms.some((r: any) => r.slug === roomSlug)).toBe(true);
    const meta = await request(base, "GET", `/api/rooms/${roomSlug}`);
    expect(meta.status).toBe(200);
    expect(meta.json.room.name).toBe("E2E Xona");
  });

  it("serves room items for a public room", async () => {
    const res = await request(base, "POST", `/api/rooms/${roomSlug}/items`, { body: {} });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json.items)).toBe(true);
  });

  it("creates a private room and gates it behind a password", async () => {
    const create = await request(base, "POST", "/api/rooms", {
      token,
      body: { name: "Maxfiy", isPublic: false, password: "xona123" },
    });
    expect(create.status).toBe(201);
    const denied = await request(base, "POST", `/api/rooms/${create.json.room.slug}/items`, { body: {} });
    expect(denied.status).toBe(403);
    const allowed = await request(base, "POST", `/api/rooms/${create.json.room.slug}/items`, {
      body: { password: "xona123" },
    });
    expect(allowed.status).toBe(200);
  });

  it("reports an item and the admin resolves it with REMOVE", async () => {
    const report = await request(base, "POST", "/api/report", {
      token,
      body: { itemId: createdId, reason: "E2E test hisoboti" },
    });
    expect(report.status).toBe(201);

    const queue = await request(base, "GET", "/api/admin/reports?status=OPEN", { token: ADMIN });
    expect(queue.status).toBe(200);
    const found = queue.json.reports.find((r: any) => r.itemId === createdId);
    expect(found).toBeTruthy();
    expect(found.reporter.username).toBe(username);

    const resolve = await request(base, "POST", `/api/admin/reports/${found.id}/resolve`, {
      token: ADMIN,
      body: { action: "REMOVE" },
    });
    expect(resolve.status).toBe(200);
    expect(resolve.json.action).toBe("REMOVE");

    const list = await request(base, "GET", "/api/items?limit=500");
    expect(list.json.items.some((i: any) => i.id === createdId)).toBe(false);
  });

  it("bans an IP, blocks writes, then unbans", async () => {
    const ip = "203.0.113.77";
    const headers = { "X-Forwarded-For": ip };
    const ban = await request(base, "POST", "/api/admin/bans", {
      token: ADMIN,
      body: { ipAddress: ip, reason: "E2E" },
    });
    expect(ban.status).toBe(200);

    const blocked = await request(base, "POST", "/api/items", {
      token,
      headers,
      body: { type: "TEXT", content: "bloklangan", x: 1, y: 1 },
    });
    expect(blocked.status).toBe(403);

    const unban = await request(base, "DELETE", `/api/admin/bans/${ip}`, { token: ADMIN });
    expect(unban.status).toBe(200);

    const allowed = await request(base, "POST", "/api/items", {
      token,
      headers,
      body: { type: "TEXT", content: "qayta ruxsat", x: 1, y: 1 },
    });
    expect(allowed.status).toBe(200);
  });

  it("admin stats and logs work, and admin clears the canvas", async () => {
    const stats = await request(base, "GET", "/api/admin/stats", { token: ADMIN });
    expect(stats.status).toBe(200);
    expect(typeof stats.json.items).toBe("number");

    const logs = await request(base, "GET", "/api/admin/logs", { token: ADMIN });
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.json.logs)).toBe(true);

    const clear = await request(base, "DELETE", "/api/admin/items", { token: ADMIN });
    expect(clear.status).toBe(200);

    const list = await request(base, "GET", "/api/items?limit=500");
    expect(list.json.items.length).toBe(0);
  });

  it("rejects unauthenticated admin access", async () => {
    const stats = await request(base, "GET", "/api/admin/stats");
    expect(stats.status).toBe(401);
  });
});
