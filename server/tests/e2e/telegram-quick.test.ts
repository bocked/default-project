import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { hashQuickLoginSessionId } from "../../src/lib/tokens.js";
import { emailTranscript } from "../../src/lib/email.js";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";

const WEBHOOK_SECRET = "test-webhook-secret";
const USER_CHAT = "777000555";

function verificationTokenFor(email: string): string {
  const record = [...emailTranscript].reverse().find((e) => e.to === email);
  expect(record).toBeTruthy();
  const match = record!.html.match(/token=([0-9a-f]{64})/);
  expect(match).toBeTruthy();
  return match![1];
}

describe("E2E: Telegram quick login (like-only until full registration)", () => {
  let ts: TestServer;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
    await prisma.category.create({ data: { name: "Motivatsiya", slug: "motivatsiya" } });
  });

  afterAll(async () => {
    await ts.close();
  });

  it("reports a 500 when the Telegram bot is not configured", async () => {
    const res = await request(base, "POST", "/api/auth/telegram/quick/session");
    expect(res.status).toBe(500);
  });

  it("completes a quick session via the /start quick_ webhook and logs the user in", async () => {
    const sessionId = "a".repeat(32);
    await prisma.telegramQuickSession.create({
      data: { tokenHash: hashQuickLoginSessionId(sessionId), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });

    const pending = await request(base, "POST", "/api/auth/telegram/quick/status", {
      body: { sessionId },
    });
    expect(pending.status).toBe(200);
    expect(pending.json.status).toBe("PENDING");

    const webhook = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: {
        message: {
          message_id: 1,
          text: `/start quick_${sessionId}`,
          chat: { id: USER_CHAT },
          from: { id: USER_CHAT, username: "tezkor_user", first_name: "Tezkor", last_name: "Foydalanuvchi" },
        },
      },
    });
    expect(webhook.status).toBe(200);

    const stored = await prisma.telegramQuickSession.findUnique({
      where: { tokenHash: hashQuickLoginSessionId(sessionId) },
    });
    expect(stored?.status).toBe("COMPLETE");
    expect(stored?.userId).toBeTruthy();

    const complete = await request(base, "POST", "/api/auth/telegram/quick/status", {
      body: { sessionId },
    });
    expect(complete.status).toBe(200);
    expect(complete.json.status).toBe("COMPLETE");
    expect(complete.json.token).toBeTruthy();
    expect(complete.json.user.quickLogin).toBe(true);
    expect(complete.json.user.email).toBeNull();
    expect(complete.json.user.telegramUsername).toBe("tezkor_user");

    const token = complete.json.token as string;

    // A consumed session cannot be reused.
    const replay = await request(base, "POST", "/api/auth/telegram/quick/status", {
      body: { sessionId },
    });
    expect(replay.json.status).toBe("EXPIRED");

    // /api/auth/me exposes the quick account.
    const me = await request(base, "GET", "/api/auth/me", { token });
    expect(me.status).toBe(200);
    expect(me.json.user.quickLogin).toBe(true);
  });

  it("lets a quick user like quotes but blocks posting until upgrade", async () => {
    const token = await (async () => {
      const sessionId = "b".repeat(32);
      await prisma.telegramQuickSession.create({
        data: { tokenHash: hashQuickLoginSessionId(sessionId), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });
      await request(base, "POST", "/api/telegram/webhook", {
        headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
        body: {
          message: {
            message_id: 2,
            text: `/start quick_${sessionId}`,
            chat: { id: "777000556" },
            from: { id: "777000556", username: "like_only" },
          },
        },
      });
      const complete = await request(base, "POST", "/api/auth/telegram/quick/status", { body: { sessionId } });
      return complete.json.token as string;
    })();

    // An approved quote to like.
    const owner = await prisma.user.create({
      data: { email: `${unique("qowner")}@example.com`, passwordHash: "x", emailVerified: true },
    });
    const category = await prisma.category.findFirstOrThrow();
    const quote = await prisma.quote.create({
      data: { text: "Yoqtiradigan iqtibos.", displayAuthor: "Anonim", anonymous: true, status: "APPROVED", userId: owner.id, categoryId: category.id },
    });

    const like = await request(base, "POST", `/api/quotes/${quote.id}/like`, { token });
    expect(like.status).toBe(200);
    expect(like.json.liked).toBe(true);

    // Posting is blocked with UPGRADE_REQUIRED.
    const post = await request(base, "POST", "/api/quotes", {
      token,
      body: { text: "Tezkor foydalanuvchi iqtibosi.", categorySlug: category.slug, tags: [], anonymous: true },
    });
    expect(post.status).toBe(403);
    expect(post.json.code).toBe("UPGRADE_REQUIRED");
  });

  it("completes a full registration via /api/auth/upgrade and can then post", async () => {
    const sessionId = "c".repeat(32);
    await prisma.telegramQuickSession.create({
      data: { tokenHash: hashQuickLoginSessionId(sessionId), expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: {
        message: {
          message_id: 3,
          text: `/start quick_${sessionId}`,
          chat: { id: "777000557" },
          from: { id: "777000557", username: "upgrader" },
        },
      },
    });
    const complete = await request(base, "POST", "/api/auth/telegram/quick/status", { body: { sessionId } });
    const token = complete.json.token as string;

    // Duplicate email is rejected.
    const taken = `${unique("taken")}@example.com`;
    await prisma.user.create({ data: { email: taken, passwordHash: "x", emailVerified: true } });
    const dup = await request(base, "POST", "/api/auth/upgrade", {
      token,
      body: { email: taken, password: "s3cret-password" },
    });
    expect(dup.status).toBe(409);

    const email = `${unique("full")}@example.com`;
    const upgrade = await request(base, "POST", "/api/auth/upgrade", {
      token,
      body: { email, password: "s3cret-password", nickname: "To'liq Foydalanuvchi" },
    });
    expect(upgrade.status).toBe(200);
    expect(upgrade.json.user.quickLogin).toBe(false);
    expect(upgrade.json.user.email).toBe(email);
    expect(upgrade.json.user.emailVerified).toBe(false);

    // Still unverified: email must be confirmed before posting.
    const category = await prisma.category.findFirstOrThrow();
    const before = await request(base, "POST", "/api/quotes", {
      token: upgrade.json.token,
      body: { text: "Hali tasdiqlanmagan.", categorySlug: category.slug, tags: [], anonymous: true },
    });
    expect(before.status).toBe(403);
    expect(before.json.code).toBe("NOT_VERIFIED");

    // Verify the email, then posting works like a normal account.
    const verify = await request(base, "POST", "/api/auth/verify-email", {
      body: { token: verificationTokenFor(email) },
    });
    expect(verify.status).toBe(200);

    const post = await request(base, "POST", "/api/quotes", {
      token: upgrade.json.token,
      body: { text: "Endi joylash mumkin.", categorySlug: category.slug, tags: ["Bilim"], anonymous: false },
    });
    expect(post.status).toBe(201);
    expect(post.json.quote.status).toBe("PENDING");
  });
});
