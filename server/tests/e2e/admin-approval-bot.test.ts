import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";

const WEBHOOK_SECRET = "test-webhook-secret";
const ADMIN_CHAT_ID = 899933314; // pinned by vitest.e2e.config.ts
const APPROVAL_TOKEN = "123456:invalid-token-for-e2e";

describe("E2E: Approval bot (@nimadur7_bot) — user verification only", () => {
  let ts: TestServer;
  let base: string;
  let adminToken: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();

    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email: "mirabbostolqinjonov@gmail.com", password: "super-password" },
    });
    expect(reg.status).toBe(201);
    const login = await request(base, "POST", "/api/auth/login", {
      body: { email: "mirabbostolqinjonov@gmail.com", password: "super-password" },
    });
    expect(login.status).toBe(200);
    adminToken = login.json.token;
  });

  afterAll(async () => {
    await ts.close();
  });

  async function postApproval(body: Record<string, unknown>): Promise<{ status: number }> {
    return request(base, "POST", "/api/telegram/webhook/approval", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body,
    });
  }

  async function postApprovalCommand(text: string, chatId = ADMIN_CHAT_ID): Promise<{ status: number }> {
    return postApproval({ message: { message_id: 100, text, chat: { id: chatId } } });
  }

  function makeUser(prefix: string, extra: Record<string, unknown> = {}) {
    return prisma.user.create({
      data: { email: `${unique(prefix)}@example.com`, passwordHash: "x", ...extra },
    });
  }

  async function makeQuote(userId: string) {
    const category = await prisma.category.create({ data: { name: `Bo'lim ${unique("cat")}`, slug: unique("cat") } });
    return prisma.quote.create({
      data: { text: `Test iqtibos ${unique("q")}`, displayAuthor: "Anonim", anonymous: true, categoryId: category.id, userId },
    });
  }

  it("rejects approval webhook calls without the secret token", async () => {
    const res = await fetch(`${base}/api/telegram/webhook/approval`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: { message_id: 1, text: "verify", chat: { id: ADMIN_CHAT_ID } } }),
    });
    expect(res.status).toBe(401);
  });

  it("exposes empty approval-bot settings by default", async () => {
    const settings = await request(base, "GET", "/api/admin/telegram/settings", { token: adminToken });
    expect(settings.status).toBe(200);
    expect(settings.json.settings.approvalBotTokenSet).toBe(false);
    expect(settings.json.settings.approvalBotTokenMasked).toBe("");

    const status = await request(base, "GET", "/api/admin/telegram/status", { token: adminToken });
    expect(status.status).toBe(200);
    expect(status.json.approvalConfigured).toBe(false);
    expect(status.json.approvalBotStatus).toBe("disabled");
  });

  it("registers a new USER without errors while the approval bot is unset", async () => {
    const res = await request(base, "POST", "/api/auth/register", {
      body: { email: `${unique("abar")}@example.com`, password: "s3cret-password" },
    });
    expect(res.status).toBe(201);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: res.json.user.id } });
    expect(row.isSuperApproved).toBe(false);
  });

  it("stores the approval bot token, re-initialises only it, and marks error on 401", async () => {
    const res = await request(base, "PUT", "/api/admin/telegram/settings", {
      token: adminToken,
      body: { approvalBotToken: APPROVAL_TOKEN },
    });
    expect(res.status).toBe(200);
    expect(res.json.reinitialized).toBe(false);
    expect(res.json.approvalReinitialized).toBe(true);
    expect(res.json.settings.approvalBotTokenSet).toBe(true);
    expect(res.json.settings.approvalBotTokenMasked.startsWith("123456")).toBe(true);
    expect(res.json.settings.approvalBotTokenMasked).not.toContain("invalid-token-for-e2e");

    const row = await prisma.telegramSettings.findUniqueOrThrow({ where: { id: "main" } });
    expect(row.botToken).toBe("");
    expect(row.approvalBotToken).toBe(APPROVAL_TOKEN);
    expect(row.botStatus).toBe("disabled");

    const status = await request(base, "GET", "/api/admin/telegram/status", { token: adminToken });
    expect(status.status).toBe(200);
    expect(status.json.approvalConfigured).toBe(true);
    expect(status.json.approvalBotStatus).toBe("error");
    expect(status.json.approvalBotLastError).toBeTruthy();
  });

  it("a repeated identical token is a no-op (no reconnect)", async () => {
    const res = await request(base, "PUT", "/api/admin/telegram/settings", {
      token: adminToken,
      body: { approvalBotToken: APPROVAL_TOKEN },
    });
    expect(res.status).toBe(200);
    expect(res.json.approvalReinitialized).toBe(false);
  });

  it("approval webhook verifies and un-verifies users via prompt commands", async () => {
    const user = await makeUser("abv");

    expect((await postApprovalCommand(`verify ${user.email}`)).status).toBe(200);
    const verified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verified.isSuperApproved).toBe(true);
    expect(verified.superApprovedAt).toBeTruthy();

    expect((await postApprovalCommand(`unverify ${user.email}`)).status).toBe(200);
    const revoked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(revoked.isSuperApproved).toBe(false);
    expect(revoked.superApprovedAt).toBeNull();

    expect((await postApprovalCommand(`tasdiqla ${user.email}`)).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperApproved).toBe(true);
  });

  it("approval webhook refuses quote moderation (`approve <id>`) and leaves quotes pending", async () => {
    const user = await makeUser("abq");
    const quote = await makeQuote(user.id);

    expect((await postApprovalCommand(`approve ${quote.id}`)).status).toBe(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("PENDING");

    expect((await postApprovalCommand("stats")).status).toBe(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status).toBe("PENDING");
  });

  it("ignores plain text from non-admin chats", async () => {
    const user = await makeUser("abna");
    const res = await postApprovalCommand(`verify ${user.email}`, 555999111);
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperApproved).toBe(false);
  });

  it("approval inbox callback [Tasdiqlash] approves the user (isSuperApproved)", async () => {
    const user = await makeUser("abcb");

    const res = await postApproval({
      callback_query: {
        id: "cq-approve-1",
        data: `approve-user:${user.id}`,
        message: { message_id: 42, chat: { id: ADMIN_CHAT_ID } },
      },
    });
    expect(res.status).toBe(200);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.isSuperApproved).toBe(true);
    expect(updated.superApprovedAt).toBeTruthy();

    const audits = await prisma.adminLog.findMany({
      where: { action: "user.super-approve", targetId: user.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits[0].adminEmail).toBe("SUPER_ADMIN (Telegram)");
  });

  it("inbox [Rad etish] leaves the user unapproved and audits the rejection", async () => {
    const user = await makeUser("abcr");

    const res = await postApproval({
      callback_query: {
        id: "cq-reject-1",
        data: `reject-user:${user.id}`,
        message: { message_id: 43, chat: { id: ADMIN_CHAT_ID } },
      },
    });
    expect(res.status).toBe(200);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperApproved).toBe(false);

    const audits = await prisma.adminLog.findMany({
      where: { action: "user.super-reject", targetId: user.id },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it("callback from a non-admin chat has no effect", async () => {
    const user = await makeUser("abcf");

    const res = await postApproval({
      callback_query: {
        id: "cq-foreign",
        data: `approve-user:${user.id}`,
        message: { message_id: 44, chat: { id: 555999111 } },
      },
    });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperApproved).toBe(false);
  });

  it("approving an already-approved user reports a failure without double-auditing", async () => {
    const user = await makeUser("abdup");
    await prisma.user.update({
      where: { id: user.id },
      data: { isSuperApproved: true, superApprovedAt: new Date() },
    });

    await postApproval({
      callback_query: {
        id: "cq-dup",
        data: `approve-user:${user.id}`,
        message: { message_id: 45, chat: { id: ADMIN_CHAT_ID } },
      },
    });

    const audits = await prisma.adminLog.findMany({ where: { action: "user.super-approve", targetId: user.id } });
    expect(audits.length).toBe(0);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isSuperApproved).toBe(true);
  });
});