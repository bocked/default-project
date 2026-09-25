import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { invalidateTelegramSettingsCache } from "../../src/lib/telegramSettings.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

const ADMIN = ADMIN_PASSWORD;

async function makeLoginableAdmin(base: string): Promise<{ token: string }> {
  const email = `${unique("tgadmin")}@example.com`;
  const password = "s3cret-password";
  const reg = await request(base, "POST", "/api/auth/register", { body: { email, password } });
  expect(reg.status).toBe(201);
  const grant = await request(base, "PATCH", `/api/admin/users/${reg.json.user.id}/role`, {
    token: ADMIN,
    body: { role: "ADMIN" },
  });
  expect(grant.status).toBe(200);
  const login = await request(base, "POST", "/api/auth/login", { body: { email, password } });
  expect(login.status).toBe(200);
  return { token: login.json.token };
}

async function makeSuperAdmin(base: string): Promise<{ token: string }> {
  const reg = await request(base, "POST", "/api/auth/register", {
    body: { email: "mirabbostolqinjonov@gmail.com", password: "super-password" },
  });
  expect(reg.status).toBe(201);
  const login = await request(base, "POST", "/api/auth/login", {
    body: { email: "mirabbostolqinjonov@gmail.com", password: "super-password" },
  });
  expect(login.status).toBe(200);
  return { token: login.json.token };
}

describe("E2E: Telegram settings (admin-managed bot)", () => {
  let ts: TestServer;
  let base: string;
  let superAdmin: { token: string };
  let subAdmin: { token: string };

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
    superAdmin = await makeSuperAdmin(base);
    subAdmin = await makeLoginableAdmin(base);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("exposes default settings to the super admin without leaking a token", async () => {
    const res = await request(base, "GET", "/api/admin/telegram/settings", { token: superAdmin.token });
    expect(res.status).toBe(200);
    expect(res.json.settings.botTokenSet).toBe(false);
    expect(res.json.settings.botTokenMasked).toBe("");
    expect(res.json.settings.notifyPolicy).toBe(true);
    expect(res.json.settings.notifyNewFeature).toBe(true);
    expect(res.json.settings.notifyHealth).toBe(true);
    expect(res.json.settings.notifyBackup).toBe(true);
    expect(res.json.settings.botStatus).toBe("disabled");
  });

  it("blocks a plain ADMIN (and unauthenticated) from the telegram settings APIs", async () => {
    const get = await request(base, "GET", "/api/admin/telegram/settings", { token: subAdmin.token });
    expect(get.status).toBe(403);
    const put = await request(base, "PUT", "/api/admin/telegram/settings", {
      token: subAdmin.token,
      body: { superAdminChatId: "111" },
    });
    expect(put.status).toBe(403);
    const status = await request(base, "GET", "/api/admin/telegram/status", { token: subAdmin.token });
    expect(status.status).toBe(403);
    const test = await request(base, "POST", "/api/admin/telegram/test", { token: subAdmin.token, body: {} });
    expect(test.status).toBe(403);
    const anon = await request(base, "GET", "/api/admin/telegram/settings");
    expect(anon.status).toBe(401);
  });

  it("persists chat/channel/toggles without a token and without reconnecting", async () => {
    const res = await request(base, "PUT", "/api/admin/telegram/settings", {
      token: superAdmin.token,
      body: {
        superAdminChatId: "899933314",
        channelValue: "https://t.me/+kiAzRgAAG8dhMWZi",
        notifyHealth: false,
        notifyBackup: false,
      },
    });
    expect(res.status).toBe(200);
    expect(res.json.settings.botTokenSet).toBe(false);
    expect(res.json.reinitialized).toBe(false);

    const row = await prisma.telegramSettings.findUnique({ where: { id: "main" } });
    expect(row?.superAdminChatId).toBe("899933314");
    expect(row?.channelValue).toBe("https://t.me/+kiAzRgAAG8dhMWZi");
    expect(row?.notifyHealth).toBe(false);
    expect(row?.notifyBackup).toBe(false);
    expect(row?.notifyPolicy).toBe(true);
    expect(row?.botStatus).toBe("disabled");
  });

  it("a changed bot token re-initialises and marks the status as error on 401", async () => {
    const res = await request(base, "PUT", "/api/admin/telegram/settings", {
      token: superAdmin.token,
      body: { botToken: "123456:invalid-token-for-e2e" },
    });
    expect(res.status).toBe(200);
    expect(res.json.reinitialized).toBe(true);
    expect(res.json.settings.botTokenSet).toBe(true);
    expect(res.json.settings.botTokenMasked.startsWith("123456")).toBe(true);
    expect(res.json.settings.botTokenMasked).not.toContain("invalid-token-for-e2e");
    expect(res.json.settings.botStatus).toBe("error");
    expect(res.json.settings.lastError).toBeTruthy();

    const status = await request(base, "GET", "/api/admin/telegram/status", { token: superAdmin.token });
    expect(status.status).toBe(200);
    expect(status.json.botStatus).toBe("error");
    expect(status.json.configured).toBe(true);
    expect(status.json.channelResolved).toBeNull();
  });

  it("an empty token clears the token and returns to disabled without a network call", async () => {
    const res = await request(base, "PUT", "/api/admin/telegram/settings", {
      token: superAdmin.token,
      body: { botToken: "" },
    });
    expect(res.status).toBe(200);
    expect(res.json.reinitialized).toBe(true);
    expect(res.json.settings.botTokenSet).toBe(false);
    expect(res.json.settings.botStatus).toBe("disabled");
  });

  it("a stored channelChatId is preferred by status.channelResolved", async () => {
    await prisma.telegramSettings.update({
      where: { id: "main" },
      data: { botToken: "", channelChatId: "-1001234567890", channelValue: "https://t.me/+kiAzRgAAG8dhMWZi" },
    });
    invalidateTelegramSettingsCache();
    const res = await request(base, "GET", "/api/admin/telegram/status", { token: superAdmin.token });
    expect(res.status).toBe(200);
    expect(res.json.channelChatId).toBe("-1001234567890");
    expect(res.json.channelResolved).toBe("-1001234567890");
    expect(res.json.notifications.health).toBe(false);
  });

  it("rejects malformed bodies and reports missing config on /test", async () => {
    const bad = await request(base, "PUT", "/api/admin/telegram/settings", {
      token: superAdmin.token,
      body: { notifyPolicy: "yes" },
    });
    expect(bad.status).toBe(400);

    await prisma.telegramSettings.update({
      where: { id: "main" },
      data: { botToken: "", superAdminChatId: "", channelChatId: "", channelValue: "" },
    });
    invalidateTelegramSettingsCache();
    const test = await request(base, "POST", "/api/admin/telegram/test", { token: superAdmin.token, body: {} });
    expect(test.status).toBe(400);
    expect(test.json.error).toContain("token");
  });

  it("audits settings changes in the AdminLog", async () => {
    await request(base, "PUT", "/api/admin/telegram/settings", {
      token: superAdmin.token,
      body: { notifyPolicy: false },
    });
    const logs = await prisma.adminLog.findMany({
      where: { action: "telegram.settings" },
      orderBy: { createdAt: "desc" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs[0].adminEmail).toBe("mirabbostolqinjonov@gmail.com");
  });
});