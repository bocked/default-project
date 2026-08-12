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

async function makeQuote(userId: string, text: string): Promise<string> {
  const category = await prisma.category.findFirstOrThrow();
  const quote = await prisma.quote.create({
    data: { text, displayAuthor: "Anonim", anonymous: true, status: "PENDING", userId, categoryId: category.id },
  });
  return quote.id;
}

describe("E2E: admin console v2 (users, quotes, tags, content, audit)", () => {
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

  it("blocked users cannot log in and their tokens are rejected", async () => {
    const email = `${unique("blocked")}@example.com`;
    const password = "s3cret-password";
    await request(base, "POST", "/api/auth/register", { body: { email, password } });
    const id = (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

    const login1 = await request(base, "POST", "/api/auth/login", { body: { email, password } });
    expect(login1.status).toBe(200);
    const token = login1.json.token;

    await prisma.user.update({ where: { id }, data: { blocked: true, blockedAt: new Date() } });

    const login2 = await request(base, "POST", "/api/auth/login", { body: { email, password } });
    expect(login2.status).toBe(403);
    expect(login2.json.code).toBe("ACCOUNT_BLOCKED");

    const me = await request(base, "GET", "/api/auth/me", { token });
    expect(me.status).toBe(403);
  });

  it("admins can moderate without email verification", async () => {
    const res = await request(base, "POST", "/api/auth/register", {
      body: { email: "mirabbostolqinjonov@gmail.com", password: "admin-password" },
    });
    expect(res.status).toBe(201);
    expect(res.json.user.role).toBe("ADMIN");

    const post = await request(base, "POST", "/api/quotes", {
      token: res.json.token,
      body: { text: "Adminning iqtibosi.", categorySlug: "motivatsiya", tags: [], anonymous: true },
    });
    expect(post.status).toBe(201);
  });

  it("lists users and supports block/unblock/delete/restore + bulk", async () => {
    const idA = await makeUser(`${unique("ua")}@example.com`);
    const idB = await makeUser(`${unique("ub")}@example.com`);

    const list = await request(base, "GET", "/api/admin/users", { token: ADMIN });
    expect(list.status).toBe(200);
    expect(list.json.total).toBeGreaterThanOrEqual(2);

    const search = await request(base, "GET", `/api/admin/users?q=`, { token: ADMIN });
    expect(search.status).toBe(200);

    // Single block
    const block = await request(base, "POST", `/api/admin/users/${idA}/block`, { token: ADMIN });
    expect(block.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: idA } })).blocked).toBe(true);

    // Bulk delete two users -> trash
    const bulkDelete = await request(base, "POST", "/api/admin/users/bulk", {
      token: ADMIN,
      body: { ids: [idA, idB], action: "delete" },
    });
    expect(bulkDelete.status).toBe(200);
    expect(bulkDelete.json.count).toBe(2);

    const trash = await request(base, "GET", "/api/admin/users?deleted=1", { token: ADMIN });
    expect(trash.json.users.some((u: any) => u.id === idA)).toBe(true);

    // Restore one
    const restore = await request(base, "POST", `/api/admin/users/${idA}/restore`, { token: ADMIN });
    expect(restore.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: idA } })).deletedAt).toBeNull();
  });

  it("admins cannot block or delete another admin account", async () => {
    const id = (await prisma.user.findUniqueOrThrow({ where: { email: "mirabbostolqinjonov@gmail.com" } })).id;
    const block = await request(base, "POST", `/api/admin/users/${id}/block`, { token: ADMIN });
    expect(block.status).toBe(400);
    const del = await request(base, "DELETE", `/api/admin/users/${id}`, { token: ADMIN });
    expect(del.status).toBe(400);
  });

  it("edits, soft-deletes and restores quotes; bulk actions work", async () => {
    const userId = await makeUser(`${unique("quoter")}@example.com`);
    const q1 = await makeQuote(userId, "Birinchi iqtibos.");
    const q2 = await makeQuote(userId, "Ikkinchi iqtibos.");

    // Edit
    const edit = await request(base, "PATCH", `/api/admin/quotes/${q1}`, {
      token: ADMIN,
      body: { text: "Tahrirlangan iqtibos.", displayAuthor: "Muallif" },
    });
    expect(edit.status).toBe(200);
    expect(edit.json.quote.text).toBe("Tahrirlangan iqtibos.");
    expect(edit.json.quote.displayAuthor).toBe("Muallif");

    // Approve q1
    const approve = await request(base, "POST", `/api/admin/quotes/${q1}/approve`, { token: ADMIN });
    expect(approve.status).toBe(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q1 } })).status).toBe("APPROVED");

    // Reject q2 with reason
    const reject = await request(base, "POST", `/api/admin/quotes/${q2}/reject`, {
      token: ADMIN,
      body: { reason: "Manba yo'q" },
    });
    expect(reject.status).toBe(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q2 } })).rejectionReason).toBe("Manba yo'q");

    // Soft delete q2
    const del = await request(base, "DELETE", `/api/admin/quotes/${q2}`, { token: ADMIN });
    expect(del.status).toBe(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q2 } })).deletedAt).not.toBeNull();

    // Trash list only shows deleted
    const trash = await request(base, "GET", "/api/admin/quotes?deleted=1", { token: ADMIN });
    expect(trash.json.quotes.some((q: any) => q.id === q2)).toBe(true);

    // Restore q2
    const restore = await request(base, "POST", `/api/admin/quotes/${q2}/restore`, { token: ADMIN });
    expect(restore.status).toBe(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q2 } })).deletedAt).toBeNull();

    // Bulk approve the pending q2
    const bulk = await request(base, "POST", "/api/admin/quotes/bulk", {
      token: ADMIN,
      body: { ids: [q1, q2], action: "approve" },
    });
    expect(bulk.status).toBe(200);
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: q2 } })).status).toBe("APPROVED");
  });

  it("manages hashtags (rename, delete)", async () => {
    const tag = await prisma.tag.create({ data: { name: "Eski", slug: "eski" } });

    const list = await request(base, "GET", "/api/admin/tags", { token: ADMIN });
    expect(list.status).toBe(200);
    expect(list.json.tags.some((t: any) => t.id === tag.id)).toBe(true);

    const rename = await request(base, "PATCH", `/api/admin/tags/${tag.id}`, {
      token: ADMIN,
      body: { name: "Yangi" },
    });
    expect(rename.status).toBe(200);
    expect(rename.json.tag.slug).toBe("yangi");

    const del = await request(base, "DELETE", `/api/admin/tags/${tag.id}`, { token: ADMIN });
    expect(del.status).toBe(200);
    expect(await prisma.tag.findUnique({ where: { id: tag.id } })).toBeNull();
  });

  it("manages content blocks and exposes them publicly", async () => {
    await prisma.contentBlock.create({
      data: { key: "hero.title", title: "Sarlavha", value: "Iqtibosim" },
    });

    const list = await request(base, "GET", "/api/admin/content", { token: ADMIN });
    expect(list.status).toBe(200);
    expect(list.json.blocks.some((b: any) => b.key === "hero.title")).toBe(true);

    const put = await request(base, "PUT", "/api/admin/content/hero.title", {
      token: ADMIN,
      body: { value: "Yangi sarlavha" },
    });
    expect(put.status).toBe(200);
    expect(put.json.block.value).toBe("Yangi sarlavha");

    const pub = await request(base, "GET", "/api/content");
    expect(pub.status).toBe(200);
    expect(pub.json.content["hero.title"]).toBe("Yangi sarlavha");
  });

  it("returns audit logs and activity stats", async () => {
    const audit = await request(base, "GET", "/api/admin/audit-logs", { token: ADMIN });
    expect(audit.status).toBe(200);
    expect(audit.json.logs.some((l: any) => l.action === "user.block")).toBe(true);

    const activity = await request(base, "GET", "/api/admin/stats/activity?days=7", { token: ADMIN });
    expect(activity.status).toBe(200);
    expect(activity.json.activity.length).toBe(7);
    expect(typeof activity.json.activity[0].registrations).toBe("number");
  });

  it("grants and revokes the ADMIN role; self-demotion is blocked", async () => {
    const id = await makeUser(`${unique("role")}@example.com`);

    // Grant admin via the shared admin secret.
    const grant = await request(base, "PATCH", `/api/admin/users/${id}/role`, {
      token: ADMIN,
      body: { role: "ADMIN" },
    });
    expect(grant.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).role).toBe("ADMIN");

    // A real admin JWT cannot demote their own account.
    const login = await request(base, "POST", "/api/auth/login", {
      body: { email: "mirabbostolqinjonov@gmail.com", password: "admin-password" },
    });
    expect(login.status).toBe(200);
    const selfId = (await prisma.user.findUniqueOrThrow({ where: { email: "mirabbostolqinjonov@gmail.com" } })).id;
    const self = await request(base, "PATCH", `/api/admin/users/${selfId}/role`, {
      token: login.json.token,
      body: { role: "USER" },
    });
    expect(self.status).toBe(400);

    // Revoke admin from the promoted user.
    const revoke = await request(base, "PATCH", `/api/admin/users/${id}/role`, {
      token: ADMIN,
      body: { role: "USER" },
    });
    expect(revoke.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).role).toBe("USER");

    // Invalid role is rejected.
    const bad = await request(base, "PATCH", `/api/admin/users/${id}/role`, {
      token: ADMIN,
      body: { role: "SUPERUSER" },
    });
    expect(bad.status).toBe(400);
  });

  it("exposes a public author profile with approved quotes only", async () => {
    const id = await makeUser(`${unique("author")}@example.com`);
    const cat = await prisma.category.findFirstOrThrow();
    const approved = await prisma.quote.create({
      data: { text: "Ommaviy iqtibos.", displayAuthor: "Anonim", anonymous: true, status: "APPROVED", userId: id, categoryId: cat.id },
    });
    await prisma.quote.create({
      data: { text: "Yashirin iqtibos.", displayAuthor: "Anonim", anonymous: true, status: "PENDING", userId: id, categoryId: cat.id },
    });

    const res = await request(base, "GET", `/api/users/${id}`);
    expect(res.status).toBe(200);
    expect(res.json.user.id).toBe(id);
    expect(res.json.quotes.map((q: any) => q.id)).toEqual([approved.id]);
    expect(res.json.quotes[0].text).toBe("Ommaviy iqtibos.");

    const missing = await request(base, "GET", "/api/users/does-not-exist");
    expect(missing.status).toBe(404);

    const delId = await makeUser(`${unique("gone")}@example.com`);
    await prisma.user.update({ where: { id: delId }, data: { deletedAt: new Date() } });
    const gone = await request(base, "GET", `/api/users/${delId}`);
    expect(gone.status).toBe(404);
  });
});
