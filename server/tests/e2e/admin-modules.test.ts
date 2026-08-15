import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

const ADMIN = ADMIN_PASSWORD;

async function makeUser(email: string, verified = true): Promise<string> {
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", emailVerified: verified, phoneVerified: false },
  });
  return user.id;
}

async function makeApprovedQuote(userId: string, text: string): Promise<string> {
  const category = await prisma.category.findFirstOrThrow();
  const quote = await prisma.quote.create({
    data: { text, displayAuthor: "Anonim", anonymous: true, status: "APPROVED", userId, categoryId: category.id },
  });
  return quote.id;
}

describe("E2E: admin modules (announcements, feedback, settings, seo, activity, backup, likes)", () => {
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

  it("creates and lists announcements; archives and deletes them", async () => {
    const create = await request(base, "POST", "/api/admin/announcements", {
      token: ADMIN,
      body: { title: "Yangilik", message: "Sayt yangilandi!", channel: "SITE", status: "ACTIVE" },
    });
    expect(create.status).toBe(201);
    expect(create.json.announcement.title).toBe("Yangilik");
    const id = create.json.announcement.id;

    const list = await request(base, "GET", "/api/admin/announcements", { token: ADMIN });
    expect(list.json.announcements.some((a: any) => a.id === id)).toBe(true);

    // Public endpoint exposes ACTIVE announcements only.
    const pub = await request(base, "GET", "/api/announcements");
    expect(pub.json.announcements.some((a: any) => a.id === id)).toBe(true);

    const archive = await request(base, "PATCH", `/api/admin/announcements/${id}`, {
      token: ADMIN,
      body: { status: "ARCHIVED" },
    });
    expect(archive.status).toBe(200);
    expect(archive.json.announcement.status).toBe("ARCHIVED");

    const pubAfter = await request(base, "GET", "/api/announcements");
    expect(pubAfter.json.announcements.some((a: any) => a.id === id)).toBe(false);

    const del = await request(base, "DELETE", `/api/admin/announcements/${id}`, { token: ADMIN });
    expect(del.status).toBe(200);
  });

  it("accepts public feedback and lets admins reply/resolve/delete it", async () => {
    const email = `${unique("fb")}@example.com`;
    await prisma.user.create({ data: { email, passwordHash: "x", emailVerified: true, phoneVerified: false } });
    const login = await request(base, "POST", "/api/auth/login", {
      body: { email, password: "wrong-password" },
    });
    // Login fails (hash "x"), so grab a real token via register instead.
    expect(login.status).toBe(401);
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email: `${unique("fb2")}@example.com`, password: "s3cret-password" },
    });
    expect(reg.status).toBe(201);
    const token = reg.json.token;

    const quoteId = await makeApprovedQuote(
      (await prisma.user.findUniqueOrThrow({ where: { email: reg.json.user.email } })).id,
      "Shikoyat qilinadigan iqtibos."
    );

    const submit = await request(base, "POST", "/api/feedback", {
      token,
      body: { category: "COMPLAINT", text: "Bu iqtibos haqida shikoyat.", quoteId },
    });
    expect(submit.status).toBe(201);
    const feedbackId = submit.json.id;

    const list = await request(base, "GET", "/api/admin/feedback", { token: ADMIN });
    expect(list.json.feedback.some((f: any) => f.id === feedbackId)).toBe(true);
    expect(list.json.feedback.find((f: any) => f.id === feedbackId).user.email).toBe(reg.json.user.email);

    const reply = await request(base, "PATCH", `/api/admin/feedback/${feedbackId}`, {
      token: ADMIN,
      body: { status: "RESOLVED", adminReply: "Ko'rib chiqildi, rahmat." },
    });
    expect(reply.status).toBe(200);
    expect(reply.json.feedback.status).toBe("RESOLVED");
    expect(reply.json.feedback.adminReply).toBe("Ko'rib chiqildi, rahmat.");

    const del = await request(base, "DELETE", `/api/admin/feedback/${feedbackId}`, { token: ADMIN });
    expect(del.status).toBe(200);
  });

  it("updates site settings and exposes public settings", async () => {
    const put = await request(base, "PUT", "/api/admin/settings", {
      token: ADMIN,
      body: {
        settings: [
          { key: "site.name", value: "Iqtibosim", label: "Sayt nomi", group: "general" },
          { key: "social.telegram", value: "https://t.me/yerlikoglon", label: "Telegram", group: "general" },
        ],
      },
    });
    expect(put.status).toBe(200);

    const list = await request(base, "GET", "/api/admin/settings", { token: ADMIN });
    expect(list.json.settings.some((s: any) => s.key === "site.name")).toBe(true);

    const pub = await request(base, "GET", "/api/settings");
    expect(pub.json.settings["site.name"]).toBe("Iqtibosim");
    expect(pub.json.settings["social.telegram"]).toBe("https://t.me/yerlikoglon");
  });

  it("manages SEO rules for pages", async () => {
    const put = await request(base, "PUT", "/api/admin/seo", {
      token: ADMIN,
      body: { page: "home", title: "Iqtibosim — dono fikrlar", description: "Dono fikrlar to'plami", keywords: "iqtibos, fikr" },
    });
    expect(put.status).toBe(200);

    const list = await request(base, "GET", "/api/admin/seo", { token: ADMIN });
    expect(list.json.rules.some((r: any) => r.page === "home")).toBe(true);

    const pub = await request(base, "GET", "/api/seo?page=home");
    expect(pub.json.rules[0].title).toBe("Iqtibosim — dono fikrlar");

    const rule = list.json.rules.find((r: any) => r.page === "home");
    const del = await request(base, "DELETE", `/api/admin/seo/${rule.id}`, { token: ADMIN });
    expect(del.status).toBe(200);
  });

  it("records user activity and serves the activity feed", async () => {
    const email = `${unique("act")}@example.com`;
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email, password: "s3cret-password" },
    });
    expect(reg.status).toBe(201);
    const userId = reg.json.user.id;

    let registered = false;
    for (let i = 0; i < 40 && !registered; i++) {
      const feed = await request(base, "GET", `/api/admin/activity?userId=${userId}`, { token: ADMIN });
      expect(feed.status).toBe(200);
      registered = feed.json.activities.some((a: any) => a.action === "REGISTER");
      if (!registered) await new Promise((r) => setTimeout(r, 50));
    }
    expect(registered).toBe(true);

    // Login records a LOGIN activity. Activity writes are fire-and-forget, so
    // poll briefly until the feed catches up instead of racing the insert.
    const login = await request(base, "POST", "/api/auth/login", {
      body: { email, password: "s3cret-password" },
    });
    expect(login.status).toBe(200);

    let loggedIn = false;
    for (let i = 0; i < 40 && !loggedIn; i++) {
      const feed2 = await request(base, "GET", `/api/admin/activity?userId=${userId}`, { token: ADMIN });
      loggedIn = feed2.json.activities.some((a: any) => a.action === "LOGIN");
      if (!loggedIn) await new Promise((r) => setTimeout(r, 50));
    }
    expect(loggedIn).toBe(true);
  });

  it("creates, downloads and restores backups", async () => {
    const create = await request(base, "POST", "/api/admin/backups", {
      token: ADMIN,
      body: { label: "Sinov zaxirasi" },
    });
    expect(create.status).toBe(201);
    const id = create.json.backup.id;

    const list = await request(base, "GET", "/api/admin/backups", { token: ADMIN });
    expect(list.json.backups.some((b: any) => b.id === id)).toBe(true);

    const download = await request(base, "GET", `/api/admin/backups/${id}`, { token: ADMIN });
    expect(download.status).toBe(200);
    const snapshot = download.json as { categories: unknown[] };
    expect(snapshot.categories.length).toBeGreaterThanOrEqual(1);

    const restore = await request(base, "POST", `/api/admin/backups/${id}/restore`, { token: ADMIN });
    expect(restore.status).toBe(200);
    expect(typeof restore.json.restored.categories).toBe("number");

    const del = await request(base, "DELETE", `/api/admin/backups/${id}`, { token: ADMIN });
    expect(del.status).toBe(200);
  });

  it("tracks unique human views and ignores bots/repeats; supports like/unlike", async () => {
    const userA = await makeUser(`${unique("likea")}@example.com`);
    const userB = await makeUser(`${unique("likeb")}@example.com`);
    const q1 = await makeApprovedQuote(userA, "Ko'p o'qiladigan iqtibos.");

    const browser = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // A real human visitor (distinct IP) is counted once.
    const first = await request(base, "GET", "/api/quotes", {
      headers: { "User-Agent": browser, "X-Forwarded-For": "1.2.3.4" },
    });
    expect(first.status).toBe(200);
    for (let i = 0; i < 20; i++) {
      if ((await prisma.quote.findUniqueOrThrow({ where: { id: q1 } })).views >= 1) break;
      await sleep(100);
    }
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q1 } })).views).toBe(1);

    // Refreshing / re-fetching from the same visitor must NOT inflate views.
    await request(base, "GET", "/api/quotes", {
      headers: { "User-Agent": browser, "X-Forwarded-For": "1.2.3.4" },
    });
    await request(base, "GET", "/api/quotes", {
      headers: { "User-Agent": browser, "X-Forwarded-For": "1.2.3.4" },
    });
    await sleep(300);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q1 } })).views).toBe(1);

    // A second real visitor (different IP) is counted.
    await request(base, "GET", "/api/quotes", {
      headers: { "User-Agent": browser, "X-Forwarded-For": "5.6.7.8" },
    });
    for (let i = 0; i < 20; i++) {
      if ((await prisma.quote.findUniqueOrThrow({ where: { id: q1 } })).views >= 2) break;
      await sleep(100);
    }
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q1 } })).views).toBe(2);

    // Crawler hits never count, even from a fresh IP.
    await request(base, "GET", "/api/quotes", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "X-Forwarded-For": "9.9.9.9",
      },
    });
    await sleep(300);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q1 } })).views).toBe(2);

    // Like from a logged-in user.
    const regB = await request(base, "POST", "/api/auth/login", {
      body: { email: (await prisma.user.findUniqueOrThrow({ where: { id: userB } })).email, password: "nope" },
    });
    expect(regB.status).toBe(401);
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email: `${unique("likec")}@example.com`, password: "s3cret-password" },
    });
    expect(reg.status).toBe(201);

    const like = await request(base, "POST", `/api/quotes/${q1}/like`, { token: reg.json.token });
    expect(like.status).toBe(200);
    expect(like.json.liked).toBe(true);

    const likedQuote = await request(base, "GET", "/api/quotes");
    const found = likedQuote.json.quotes.find((x: any) => x.id === q1);
    expect(found.likeCount).toBe(1);

    // Idempotent re-like keeps a single row.
    await request(base, "POST", `/api/quotes/${q1}/like`, { token: reg.json.token });
    expect((await prisma.quoteLike.count({ where: { quoteId: q1 } }))).toBe(1);

    const unlike = await request(base, "DELETE", `/api/quotes/${q1}/like`, { token: reg.json.token });
    expect(unlike.status).toBe(200);
    expect(unlike.json.liked).toBe(false);

    // Top-quotes analytics lists the quote in mostLiked/mostRead.
    const top = await request(base, "GET", "/api/admin/stats/top-quotes?days=30&limit=10", { token: ADMIN });
    expect(top.status).toBe(200);
    expect(top.json.mostRead.some((q: any) => q.id === q1)).toBe(true);
  });

  it("blocks and unblocks users by Telegram ID", async () => {
    const email = `${unique("tgban")}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: "x", emailVerified: true, phoneVerified: true, telegramId: "123456789" },
    });

    const ban = await request(base, "POST", "/api/admin/bans/telegram", {
      token: ADMIN,
      body: { telegramId: "123456789", reason: "Spam" },
    });
    expect(ban.status).toBe(200);
    expect(ban.json.count).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).blocked).toBe(true);

    const list = await request(base, "GET", "/api/admin/bans/telegram", { token: ADMIN });
    expect(list.json.users.some((u: any) => u.id === user.id)).toBe(true);

    const unban = await request(base, "DELETE", `/api/admin/bans/telegram/${user.id}`, { token: ADMIN });
    expect(unban.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).blocked).toBe(false);
  });
});
