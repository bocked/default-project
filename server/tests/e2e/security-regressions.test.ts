import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { tryEnsureDefaultContent } from "../../src/lib/content.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

/**
 * Regression cover for the hardening pass. Each case pins a specific failure
 * mode that was exploitable (or fatal) before, so it cannot quietly come back.
 */
const ADMIN = ADMIN_PASSWORD;

describe("E2E: security regressions", () => {
  let ts: TestServer;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
    await prisma.category.create({ data: { name: "Motivatsiya", slug: "motivatsiya" } });
    // `cleanDatabase` also removes the ContentBlock rows that boot-time seeding
    // (`tryEnsureDefaultContent`) creates; PUT /content/:key requires the row to
    // exist, so re-seed exactly like a fresh boot does.
    await tryEnsureDefaultContent();
  });

  afterAll(async () => {
    await ts.close();
  });

  /** Registers a user, promotes them to a plain ADMIN with every grant, returns their JWT. */
  async function makeSubAdmin(grants?: Record<string, boolean>): Promise<{ token: string; id: string }> {
    const email = `${unique("sub")}@example.com`;
    const password = "s3cret-password";
    const reg = await request(base, "POST", "/api/auth/register", { body: { email, password } });
    expect(reg.status).toBe(201);
    const id = reg.json.user.id;
    const body: Record<string, unknown> = { role: "ADMIN" };
    if (grants) body.grants = grants;
    const promote = await request(base, "PATCH", `/api/admin/users/${id}/role`, {
      token: ADMIN,
      body,
    });
    expect(promote.status).toBe(200);
    const login = await request(base, "POST", "/api/auth/login", { body: { email, password } });
    expect(login.status).toBe(200);
    expect(login.json.user.role).toBe("ADMIN");
    return { token: login.json.token, id };
  }

  async function makeUser(): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${unique("plain")}@example.com`,
        passwordHash: "x",
        emailVerified: true,
        phoneVerified: false,
      },
    });
    return user.id;
  }

  describe("privilege escalation", () => {
    it("a sub-admin cannot grant the ADMIN role via PATCH /users/:id/role", async () => {
      const sub = await makeSubAdmin();
      const target = await makeUser();
      const res = await request(base, "PATCH", `/api/admin/users/${target}/role`, {
        token: sub.token,
        body: { role: "ADMIN" },
      });
      expect(res.status).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target } })).role).toBe("USER");
    });

    it("a sub-admin still cannot mint an admin through make-admin", async () => {
      const sub = await makeSubAdmin();
      const target = await makeUser();
      const res = await request(base, "PATCH", `/api/admin/users/${target}/make-admin`, {
        token: sub.token,
        body: { grants: { canManageUsers: true } },
      });
      expect(res.status).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target } })).role).toBe("USER");
    });

    it("a SUPER_ADMIN can still grant the ADMIN role (no functional regression)", async () => {
      const target = await makeUser();
      const res = await request(base, "PATCH", `/api/admin/users/${target}/role`, {
        token: ADMIN,
        body: { role: "ADMIN" },
      });
      expect(res.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: target } })).role).toBe("ADMIN");
    });

    it("a sub-admin cannot restore a deleted admin account", async () => {
      // The actor must be a *different*, still-active admin: `requireAdmin`
      // rejects the blocked/deleted victim before the route is ever reached.
      const actor = await makeSubAdmin();
      const victim = await makeSubAdmin();
      await prisma.user.update({
        where: { id: victim.id },
        data: { deletedAt: new Date(), blocked: true, blockedAt: new Date() },
      });
      const res = await request(base, "POST", `/api/admin/users/${victim.id}/restore`, {
        token: actor.token,
      });
      // Restoring also clears `blocked`, so admin accounts are excluded from the
      // single-item restore exactly as they already were from the bulk one.
      expect(res.status).toBe(404);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: victim.id } });
      expect(after.deletedAt).not.toBeNull();
      expect(after.blocked).toBe(true);
    });
  });

  describe("banner stored XSS", () => {
    it("strips scripts and event handlers when banner HTML is saved", async () => {
      const res = await request(base, "PUT", "/api/admin/content/banner.left.html", {
        token: ADMIN,
        body: {
          value:
            '<p onclick="steal()">Salom</p><script>alert(1)</script><img src="/a.png" onerror="steal()">',
        },
      });
      expect(res.status).toBe(200);
      const stored = await prisma.contentBlock.findUniqueOrThrow({ where: { key: "banner.left.html" } });
      expect(stored.value).not.toContain("script");
      expect(stored.value).not.toContain("onclick");
      expect(stored.value).not.toContain("onerror");
      expect(stored.value).toContain("Salom");
    });

    it("rejects javascript: banner links on save and on read", async () => {
      const res = await request(base, "PUT", "/api/admin/content/banner.right.href", {
        token: ADMIN,
        body: { value: "javascript:alert(1)" },
      });
      expect(res.status).toBe(200);
      const stored = await prisma.contentBlock.findUniqueOrThrow({ where: { key: "banner.right.href" } });
      expect(stored.value).toBe("");

      // A payload written straight into the DB (older build, or a restored
      // snapshot) must not survive the public read path either.
      await prisma.contentBlock.update({
        where: { key: "banner.right.href" },
        data: { value: "javascript:alert(1)" },
      });
      const pub = await request(base, "GET", "/api/content");
      expect(pub.status).toBe(200);
      expect(pub.json.content["banner.right.href"]).toBe("");
    });

    it("neutralises a poisoned banner HTML row on the public read path", async () => {
      await prisma.contentBlock.upsert({
        where: { key: "banner.top.html" },
        update: {},
        create: { key: "banner.top.html", title: "Top", value: "" },
      });
      await prisma.contentBlock.update({
        where: { key: "banner.top.html" },
        data: { value: '<script>fetch("/api/admin/users")</script><b>reklama</b>' },
      });
      const pub = await request(base, "GET", "/api/content");
      const served = pub.json.content["banner.top.html"] as string;
      expect(served).not.toContain("script");
      expect(served).not.toContain("fetch(");
      expect(served).toContain("reklama");
    });

    it("keeps legitimate banner markup working", async () => {
      const res = await request(base, "PUT", "/api/admin/content/banner.feed.html", {
        token: ADMIN,
        body: { value: '<div class="ad"><a href="https://ok.uz">Reklama</a></div>' },
      });
      expect(res.status).toBe(200);
      const stored = await prisma.contentBlock.findUniqueOrThrow({ where: { key: "banner.feed.html" } });
      expect(stored.value).toContain("Reklama");
      expect(stored.value).toContain("https://ok.uz");
      expect(stored.value).toContain('rel="noopener noreferrer"');
    });
  });

  describe("robustness", () => {
    it("answers unmatched /api routes with JSON, not HTML", async () => {
      const res = await fetch(`${base}/api/definitely-not-a-route`);
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      await expect(res.json()).resolves.toMatchObject({ error: "Not found" });
    });

    it("returns 404 instead of 500 when unblocking a user that does not exist", async () => {
      const res = await request(base, "POST", "/api/admin/users/00000000-0000-0000-0000-000000000000/unblock", {
        token: ADMIN,
      });
      expect(res.status).toBe(404);
    });

    it("does not leak the telegram bot token when saving settings fails", async () => {
      const token = "123456:SECRET-token-value-do-not-leak";
      await prisma.telegramSettings.upsert({
        where: { id: "main" },
        update: { botToken: token },
        create: { id: "main", botToken: token },
      });
      const res = await request(base, "PUT", "/api/admin/telegram/settings", {
        token: ADMIN,
        // `superAdminChatId` is a BigInt column; a value that cannot be coerced
        // makes the Prisma call throw, which used to be echoed to the client.
        body: { superAdminChatId: "not-a-number" } as unknown as Record<string, unknown>,
      });
      const body = JSON.stringify(res.json ?? {});
      expect(body).not.toContain("SECRET-token-value");
      expect(body).not.toContain(token);
    });
  });
});