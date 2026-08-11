import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { emailTranscript } from "../../src/lib/email.js";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";

const WEBHOOK_SECRET = "test-webhook-secret";
const ADMIN_CHAT = "899933314";

function verificationTokenFor(email: string): string {
  const record = [...emailTranscript].reverse().find((e) => e.to === email);
  expect(record).toBeTruthy();
  const match = record!.html.match(/token=([0-9a-f]{64})/);
  expect(match).toBeTruthy();
  return match![1];
}

async function registerUser(base: string): Promise<{ email: string; password: string; token: string }> {
  const email = `${unique("user")}@example.com`;
  const password = "s3cret-password";
  const res = await request(base, "POST", "/api/auth/register", {
    body: { email, password, name: "Jon Doe", nickname: "johndoe" },
  });
  expect(res.status).toBe(201);
  return { email, password, token: res.json.token };
}

async function verifyEmail(base: string, email: string): Promise<void> {
  const res = await request(base, "POST", "/api/auth/verify-email", {
    body: { token: verificationTokenFor(email) },
  });
  expect(res.status).toBe(200);
  expect(res.json.ok).toBe(true);
}

describe("E2E: auth, quotes, search and Telegram moderation", () => {
  let ts: TestServer;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
    for (const c of ["Motivatsiya", "Hayot"]) {
      await prisma.category.create({ data: { name: c, slug: unique(`${c}-`).toLowerCase() } });
    }
  });

  afterAll(async () => {
    await ts.close();
  });

  it("registers a user (unverified) and rejects posting until email is verified", async () => {
    const { email, token } = await registerUser(base);

    const me = await request(base, "GET", "/api/auth/me", { token });
    expect(me.status).toBe(200);
    expect(me.json.user.emailVerified).toBe(false);

    const category = await prisma.category.findFirst();
    const post = await request(base, "POST", "/api/quotes", {
      token,
      body: { text: "Birinchi iqtibos.", categorySlug: category!.slug, tags: ["Bilim"], anonymous: true },
    });
    expect(post.status).toBe(403);
    expect(post.json.code).toBe("EMAIL_NOT_VERIFIED");

    await verifyEmail(base, email);
  });

  it("verifies the email and lets the user submit a quote as PENDING", async () => {
    const { token } = await registerUser(base);
    const email = (await request(base, "GET", "/api/auth/me", { token })).json.user.email;
    await verifyEmail(base, email);

    const category = await prisma.category.findFirstOrThrow();
    const res = await request(base, "POST", "/api/quotes", {
      token,
      body: { text: "Bilim — kuchdir.", categorySlug: category.slug, tags: ["Motivatsiya", "#Bilim"], anonymous: false },
    });
    expect(res.status).toBe(201);
    expect(res.json.quote.status).toBe("PENDING");
    expect(res.json.quote.displayAuthor).toBe("johndoe");

    const mine = await request(base, "GET", "/api/quotes/mine", { token });
    expect(mine.json.quotes.some((q: any) => q.id === res.json.quote.id)).toBe(true);
  });

  it("does not expose PENDING quotes on the public feed", async () => {
    const { token } = await registerUser(base);
    const email = (await request(base, "GET", "/api/auth/me", { token })).json.user.email;
    await verifyEmail(base, email);

    const category = await prisma.category.findFirstOrThrow();
    await request(base, "POST", "/api/quotes", {
      token,
      body: { text: "Yashirin iqtibos.", categorySlug: category.slug, tags: [], anonymous: true },
    });

    const feed = await request(base, "GET", "/api/quotes");
    expect(feed.json.quotes.some((q: any) => q.text === "Yashirin iqtibos.")).toBe(false);
  });

  it("approves a quote through the Telegram callback and it appears publicly as Anonim", async () => {
    const { token } = await registerUser(base);
    const email = (await request(base, "GET", "/api/auth/me", { token })).json.user.email;
    await verifyEmail(base, email);

    const category = await prisma.category.findFirstOrThrow();
    const created = await request(base, "POST", "/api/quotes", {
      token,
      body: { text: "Donolik — tajriba bilan keladi.", categorySlug: category.slug, tags: ["Falsafa"], anonymous: true },
    });
    const quoteId = created.json.quote.id;

    const cb = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: {
        callback_query: {
          id: "cb-1",
          data: `approve:${quoteId}`,
          message: { message_id: 111, chat: { id: ADMIN_CHAT } },
        },
      },
    });
    expect(cb.status).toBe(200);

    const stored = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(stored.status).toBe("APPROVED");

    const feed = await request(base, "GET", "/api/quotes");
    const found = feed.json.quotes.find((q: any) => q.id === quoteId);
    expect(found).toBeTruthy();
    expect(found.displayAuthor).toBe("Anonim");
    expect(found.text).toContain("tajriba");
  });

  it("search is case-insensitive across text, author and tags", async () => {
    const cat = await prisma.category.findFirstOrThrow();
    const user = await prisma.user.create({
      data: { email: `${unique("search")}@example.com`, passwordHash: "x", emailVerified: true },
    });
    await prisma.quote.create({
      data: {
        text: "IT sohasida o'zgarish shiddatli.",
        displayAuthor: "Aziz",
        categoryId: cat.id,
        userId: user.id,
        status: "APPROVED",
      },
    });
    await prisma.quote.create({
      data: {
        text: "Boshqa matn.",
        displayAuthor: "Aziz",
        categoryId: cat.id,
        userId: user.id,
        status: "APPROVED",
        tags: { connectOrCreate: { where: { slug: "it" }, create: { name: "IT", slug: "it" } } },
      },
    });

    const byText = await request(base, "GET", "/api/quotes/search?q=SHIDDATLI");
    expect(byText.json.quotes.some((q: any) => q.text.includes("shiddatli"))).toBe(true);

    const byAuthor = await request(base, "GET", "/api/quotes/search?q=aziz");
    expect(byAuthor.json.quotes.length).toBeGreaterThanOrEqual(2);

    const byTag = await request(base, "GET", "/api/quotes/search?q=IT");
    expect(byTag.json.quotes.some((q: any) => q.tags.some((t: any) => t.slug === "it"))).toBe(true);

    const empty = await request(base, "GET", "/api/quotes/search");
    expect(empty.status).toBe(400);
  });

  it("rejects a quote through the Telegram reply flow with a stored reason", async () => {
    const { token } = await registerUser(base);
    const email = (await request(base, "GET", "/api/auth/me", { token })).json.user.email;
    await verifyEmail(base, email);

    const category = await prisma.category.findFirstOrThrow();
    const created = await request(base, "POST", "/api/quotes", {
      token,
      body: { text: "Shubhali iqtibos.", categorySlug: category.slug, tags: [], anonymous: false },
    });
    const quoteId = created.json.quote.id;

    // Simulate a real bot message id so the reply can be matched.
    await prisma.quote.update({ where: { id: quoteId }, data: { telegramMessageId: 222 } });

    const cb = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: {
        callback_query: {
          id: "cb-2",
          data: `reject:${quoteId}`,
          message: { message_id: 222, chat: { id: ADMIN_CHAT } },
        },
      },
    });
    expect(cb.status).toBe(200);

    const reply = await request(base, "POST", "/api/telegram/webhook", {
      headers: { "X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET },
      body: {
        message: {
          message_id: 333,
          text: "Nomaqbul mazmun",
          chat: { id: ADMIN_CHAT },
          reply_to_message: { message_id: 222, chat: { id: ADMIN_CHAT } },
        },
      },
    });
    expect(reply.status).toBe(200);

    const stored = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } });
    expect(stored.status).toBe("REJECTED");
    expect(stored.rejectionReason).toBe("Nomaqbul mazmun");

    const mine = await request(base, "GET", "/api/quotes/mine", { token });
    const mineQuote = mine.json.quotes.find((q: any) => q.id === quoteId);
    expect(mineQuote.status).toBe("REJECTED");
    expect(mineQuote.rejectionReason).toBe("Nomaqbul mazmun");
  });

  it("rejects webhook calls without the secret token", async () => {
    const res = await request(base, "POST", "/api/telegram/webhook", { body: { update_id: 1 } });
    expect(res.status).toBe(401);
  });

  it("admin quote list reveals the real owner even for anonymous quotes", async () => {
    const { token } = await registerUser(base);
    const email = (await request(base, "GET", "/api/auth/me", { token })).json.user.email;
    await verifyEmail(base, email);

    const category = await prisma.category.findFirstOrThrow();
    const created = await request(base, "POST", "/api/quotes", {
      token,
      body: { text: "Maxfiy muallif.", categorySlug: category.slug, tags: [], anonymous: true },
    });
    const quoteId = created.json.quote.id;

    const res = await request(base, "GET", "/api/admin/quotes?status=PENDING", {
      token: "change-me",
    });
    expect(res.status).toBe(200);
    const entry = res.json.quotes.find((q: any) => q.id === quoteId);
    expect(entry).toBeTruthy();
    expect(entry.anonymous).toBe(true);
    expect(entry.displayAuthor).toBe("Anonim");
    expect(entry.user.email).toBe(email);
    expect(entry.user.name).toBe("Jon Doe");

    const stats = await request(base, "GET", "/api/admin/stats", { token: "change-me" });
    expect(stats.json.quotes.pending).toBeGreaterThanOrEqual(1);
  });
});
