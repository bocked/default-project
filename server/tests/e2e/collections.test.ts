import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";

async function registerUser(base: string): Promise<{ email: string; token: string }> {
  const email = `${unique("coll")}@example.com`;
  const res = await request(base, "POST", "/api/auth/register", {
    body: { email, password: "s3cret-password", nickname: "collector" },
  });
  expect(res.status).toBe(201);
  return { email, token: res.json.token };
}

describe("E2E: collections, quote analyzer and locale", () => {
  let ts: TestServer;
  let base: string;
  let tokenA: string;
  let tokenB: string;
  let categoryId: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
    const category = await prisma.category.create({
      data: { name: "Motivatsiya", slug: unique("mot-").toLowerCase() },
    });
    categoryId = category.id;
    const a = await registerUser(base);
    tokenA = a.token;
    const b = await registerUser(base);
    tokenB = b.token;
  });

  afterAll(async () => {
    await ts.close();
  });

  async function createApprovedQuote(text: string, locale: "UZ" | "RU" | "EN" = "UZ") {
    return prisma.quote.create({
      data: {
        text,
        displayAuthor: "Test",
        anonymous: false,
        status: "APPROVED",
        locale,
        userId: (await prisma.user.findFirstOrThrow({ where: { email: { endsWith: "example.com" } } })).id,
        categoryId,
      },
    });
  }

  it("rejects collection creation without auth", async () => {
    const res = await request(base, "POST", "/api/collections", {
      body: { title: "Yulduzlar" },
    });
    expect(res.status).toBe(401);
  });

  it("creates a collection and lists it under /mine", async () => {
    const res = await request(base, "POST", "/api/collections", {
      token: tokenA,
      body: { title: "Sevimli motivatsiyalar", description: "Kuch beruvchi iqtiboslar", isPrivate: false },
    });
    expect(res.status).toBe(201);
    expect(res.json.collection.title).toBe("Sevimli motivatsiyalar");
    expect(res.json.collection.quoteCount).toBe(0);

    const mine = await request(base, "GET", "/api/collections/mine", { token: tokenA });
    expect(mine.status).toBe(200);
    expect(mine.json.collections).toHaveLength(1);
  });

  it("bookmarks an approved quote into a collection (idempotent)", async () => {
    const quote = await createApprovedQuote("Harakat — muvaffaqiyat kaliti.");
    const collection = (await request(base, "GET", "/api/collections/mine", { token: tokenA })).json.collections[0];

    const add1 = await request(base, "POST", `/api/collections/${collection.id}/quotes`, {
      token: tokenA,
      body: { quoteId: quote.id },
    });
    expect(add1.status).toBe(200);
    const add2 = await request(base, "POST", `/api/collections/${collection.id}/quotes`, {
      token: tokenA,
      body: { quoteId: quote.id },
    });
    expect(add2.status).toBe(200);

    const mine = await request(base, "GET", "/api/collections/mine", { token: tokenA });
    const col = mine.json.collections[0];
    expect(col.quoteCount).toBe(1);
    expect(col.previewQuotes[0].text).toBe("Harakat — muvaffaqiyat kaliti.");
    expect(col.previewQuotes[0].locale).toBe("UZ");
  });

  it("blocks non-owners from mutating a collection", async () => {
    const collection = (await request(base, "GET", "/api/collections/mine", { token: tokenA })).json.collections[0];
    const res = await request(base, "POST", `/api/collections/${collection.id}/quotes`, {
      token: tokenB,
      body: { quoteId: (await prisma.quote.findFirstOrThrow()).id },
    });
    expect(res.status).toBe(404);
  });

  it("exposes public collections and hides private ones from other users", async () => {
    const collection = (await request(base, "GET", "/api/collections/mine", { token: tokenA })).json.collections[0];

    const pubList = await request(base, "GET", "/api/collections/public");
    expect(pubList.status).toBe(200);
    expect(pubList.json.collections.some((c: any) => c.id === collection.id)).toBe(true);

    const open = await request(base, "GET", `/api/collections/${collection.id}`);
    expect(open.status).toBe(200);
    expect(open.json.collection.previewQuotes).toHaveLength(1);

    const patch = await request(base, "PATCH", `/api/collections/${collection.id}`, {
      token: tokenA,
      body: { isPrivate: true },
    });
    expect(patch.status).toBe(200);
    expect(patch.json.collection.isPrivate).toBe(true);

    const denied = await request(base, "GET", `/api/collections/${collection.id}`, { token: tokenB });
    expect(denied.status).toBe(404);
    const list = await request(base, "GET", "/api/collections/public");
    expect(list.json.collections.some((c: any) => c.id === collection.id)).toBe(false);
  });

  it("removes a quote from a collection and deletes the collection", async () => {
    const collection = (await request(base, "GET", "/api/collections/mine", { token: tokenA })).json.collections[0];
    const quote = await prisma.quote.findFirstOrThrow();

    const remove = await request(base, "DELETE", `/api/collections/${collection.id}/quotes/${quote.id}`, {
      token: tokenA,
    });
    expect(remove.status).toBe(200);
    expect(remove.json.removed).toBe(true);

    const mine = await request(base, "GET", "/api/collections/mine", { token: tokenA });
    expect(mine.json.collections[0].quoteCount).toBe(0);

    const del = await request(base, "DELETE", `/api/collections/${collection.id}`, { token: tokenA });
    expect(del.status).toBe(200);
    expect(del.json.ok).toBe(true);
  });

  it("analyzes a quote text with the offline rule-based parser", async () => {
    const unauth = await request(base, "POST", "/api/quotes/analyze", {
      body: { text: "Har bir narsa haqida fikr" },
    });
    expect(unauth.status).toBe(401);

    const res = await request(base, "POST", "/api/quotes/analyze", {
      token: tokenA,
      body: { text: "Muvaffaqiyat yo'lida harakat qilish kerak" },
    });
    expect(res.status).toBe(200);
    expect(res.json.available).toBe(true);
    expect(res.json.language).toBe("uz");
    expect(res.json.tags.length).toBeGreaterThan(0);
    expect(Array.isArray(res.json.suggestions)).toBe(true);

    const ru = await request(base, "POST", "/api/quotes/analyze", {
      token: tokenA,
      body: { text: "Успех — это результат труда" },
    });
    expect(ru.json.language).toBe("ru");
  });

  it("filters the feed by quote language (?lang=)", async () => {
    const { id: uzId } = await createApprovedQuote("Sabr — donolik belgisi.", "UZ");
    const { id: ruId } = await createApprovedQuote("Знание — сила.", "RU");

    const uzFeed = await request(base, "GET", "/api/quotes?lang=uz");
    expect(uzFeed.json.quotes.some((q: any) => q.id === uzId)).toBe(true);
    expect(uzFeed.json.quotes.some((q: any) => q.id === ruId)).toBe(false);

    const ruFeed = await request(base, "GET", "/api/quotes?lang=ru");
    expect(ruFeed.json.quotes.some((q: any) => q.id === ruId)).toBe(true);
    expect(ruFeed.json.quotes.some((q: any) => q.id === uzId)).toBe(false);
  });

  it("persists the UI locale on the user profile", async () => {
    const patch = await request(base, "PATCH", "/api/auth/me", {
      token: tokenB,
      body: { locale: "ru" },
    });
    expect(patch.status).toBe(200);
    expect(patch.json.user.locale).toBe("RU");

    const me = await request(base, "GET", "/api/auth/me", { token: tokenB });
    expect(me.json.user.locale).toBe("RU");
  });
});