import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

const ADMIN = ADMIN_PASSWORD;
const PERMISSION_DENIED = "Ushbu bo'limga kirish uchun sizda yetarli huquq yo'q";

/** Registers a login-able user and promotes them to a plain ADMIN. */
async function makeLoginableAdmin(base: string): Promise<{ token: string; id: string }> {
  const email = `${unique("rbac")}@example.com`;
  const password = "s3cret-password";
  const reg = await request(base, "POST", "/api/auth/register", { body: { email, password } });
  expect(reg.status).toBe(201);
  const id = reg.json.user.id;
  const grant = await request(base, "PATCH", `/api/admin/users/${id}/role`, {
    token: ADMIN,
    body: { role: "ADMIN" },
  });
  expect(grant.status).toBe(200);
  const login = await request(base, "POST", "/api/auth/login", { body: { email, password } });
  expect(login.status).toBe(200);
  expect(login.json.user.role).toBe("ADMIN");
  return { token: login.json.token, id };
}

async function makeSuperAdmin(base: string): Promise<{ token: string; id: string }> {
  const email = "mirabbostolqinjonov@gmail.com";
  const password = "super-password";
  const reg = await request(base, "POST", "/api/auth/register", { body: { email, password } });
  expect(reg.status).toBe(201);
  expect(reg.json.user.role).toBe("SUPER_ADMIN");
  const login = await request(base, "POST", "/api/auth/login", { body: { email, password } });
  expect(login.status).toBe(200);
  return { token: login.json.token, id: login.json.user.id };
}

describe("E2E: admin RBAC (sub-admins & granular permissions)", () => {
  let ts: TestServer;
  let base: string;
  let superAdmin: { token: string; id: string };
  let subAdmin: { token: string; id: string };

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
    await prisma.category.create({ data: { name: "Motivatsiya", slug: "motivatsiya" } });
    superAdmin = await makeSuperAdmin(base);
    subAdmin = await makeLoginableAdmin(base);
  });

  afterAll(async () => {
    await ts.close();
  });

  it("lists all admins with their RBAC flags; isSuperAdmin derived from role only", async () => {
    const res = await request(base, "GET", "/api/admin/sub-admins", { token: ADMIN });
    expect(res.status).toBe(200);
    const admins = res.json.admins;
    expect(admins).toHaveLength(2);

    const superAdm = admins.find((a: any) => a.id === superAdmin.id);
    const subAdm = admins.find((a: any) => a.id === subAdmin.id);
    expect(superAdm.isSuperAdmin).toBe(true);
    expect(superAdm.canManageQuotes).toBe(true);
    expect(subAdm.isSuperAdmin).toBe(false);
    for (const flag of ["canViewUsers", "canManageUsers", "canManageQuotes", "canManageCategories"]) {
      expect(subAdm[flag]).toBe(true);
    }
  });

  it("blocks a plain ADMIN (and a USER) from the super-admin-only sub-admin APIs", async () => {
    const plain = await request(base, "GET", "/api/admin/sub-admins", { token: subAdmin.token });
    expect(plain.status).toBe(403);
    const patch = await request(base, "PATCH", `/api/admin/sub-admins/${subAdmin.id}/permissions`, {
      token: subAdmin.token,
      body: { canManageQuotes: false },
    });
    expect(patch.status).toBe(403);

    // A plain USER token is not an admin at all (requireAdmin 403).
    const email = `${unique("rbacuser")}@example.com`;
    const u = await request(base, "POST", "/api/auth/register", { body: { email, password: "s3cret-password" } });
    const asUser = await request(base, "GET", "/api/admin/sub-admins", { token: u.json.token });
    expect(asUser.status).toBe(403);
  });

  it("turns OFF canManageQuotes for the sub-admin -> quotes API returns 403 with the exact message", async () => {
    const off = await request(base, "PATCH", `/api/admin/sub-admins/${subAdmin.id}/permissions`, {
      token: superAdmin.token,
      body: { canManageQuotes: false },
    });
    expect(off.status).toBe(200);
    expect(off.json.admin.canManageQuotes).toBe(false);
    expect(off.json.admin.canViewUsers).toBe(true);
    expect(off.json.admin.isSuperAdmin).toBe(false);

    const db = await prisma.user.findUniqueOrThrow({ where: { id: subAdmin.id } });
    expect(db.canManageQuotes).toBe(false);
    expect(db.canViewUsers).toBe(true);

    const quotes = await request(base, "GET", "/api/admin/quotes", { token: subAdmin.token });
    expect(quotes.status).toBe(403);
    expect(quotes.json.error).toBe(PERMISSION_DENIED);

    // Unscoped abilities still work and the master key is unaffected.
    const users = await request(base, "GET", "/api/admin/users", { token: subAdmin.token });
    expect(users.status).toBe(200);
    const master = await request(base, "GET", "/api/admin/quotes", { token: ADMIN });
    expect(master.status).toBe(200);
  });

  it("turns OFF canViewUsers -> user-facing views are blocked, management actions still denied/quoted", async () => {
    const off = await request(base, "PATCH", `/api/admin/sub-admins/${subAdmin.id}/permissions`, {
      token: superAdmin.token,
      body: { canViewUsers: false },
    });
    expect(off.status).toBe(200);

    const users = await request(base, "GET", "/api/admin/users", { token: subAdmin.token });
    expect(users.status).toBe(403);
    expect(users.json.error).toBe(PERMISSION_DENIED);

    const tgBans = await request(base, "GET", "/api/admin/bans/telegram", { token: subAdmin.token });
    expect(tgBans.status).toBe(403);

    // Dashboard stats & activity stay open to every admin.
    const stats = await request(base, "GET", "/api/admin/stats", { token: subAdmin.token });
    expect(stats.status).toBe(200);
  });

  it("turns OFF canManageCategories -> categories/tags APIs are blocked", async () => {
    const off = await request(base, "PATCH", `/api/admin/sub-admins/${subAdmin.id}/permissions`, {
      token: superAdmin.token,
      body: { canManageCategories: false },
    });
    expect(off.status).toBe(200);

    const categories = await request(base, "GET", "/api/admin/categories", { token: subAdmin.token });
    expect(categories.status).toBe(403);
    const tags = await request(base, "GET", "/api/admin/tags", { token: subAdmin.token });
    expect(tags.status).toBe(403);
  });

  it("re-enables all permissions -> the same routes work again", async () => {
    const on = await request(base, "PATCH", `/api/admin/sub-admins/${subAdmin.id}/permissions`, {
      token: superAdmin.token,
      body: {
        canViewUsers: true,
        canManageUsers: true,
        canManageQuotes: true,
        canManageCategories: true,
      },
    });
    expect(on.status).toBe(200);
    expect(on.json.admin).toMatchObject({
      canViewUsers: true,
      canManageUsers: true,
      canManageQuotes: true,
      canManageCategories: true,
    });

    const quotes = await request(base, "GET", "/api/admin/quotes", { token: subAdmin.token });
    expect(quotes.status).toBe(200);
    const users = await request(base, "GET", "/api/admin/users", { token: subAdmin.token });
    expect(users.status).toBe(200);
  });

  it("rejects malformed bodies and illegal targets", async () => {
    const empty = await request(base, "PATCH", `/api/admin/sub-admins/${subAdmin.id}/permissions`, {
      token: superAdmin.token,
      body: {},
    });
    expect(empty.status).toBe(400);

    const unknown = await request(base, "PATCH", `/api/admin/sub-admins/${subAdmin.id}/permissions`, {
      token: superAdmin.token,
      body: { canDeleteEverything: true },
    });
    expect(unknown.status).toBe(400);

    const nonBoolean = await request(base, "PATCH", `/api/admin/sub-admins/${subAdmin.id}/permissions`, {
      token: superAdmin.token,
      body: { canManageUsers: "yes" },
    });
    expect(nonBoolean.status).toBe(400);

    // A SUPER_ADMIN's flags are not editable.
    const superTarget = await request(base, "PATCH", `/api/admin/sub-admins/${superAdmin.id}/permissions`, {
      token: superAdmin.token,
      body: { canManageQuotes: false },
    });
    expect(superTarget.status).toBe(400);

    // A plain USER target is not an admin.
    const userAcct = await request(base, "POST", "/api/auth/register", {
      body: { email: `${unique("rbactarget")}@example.com`, password: "s3cret-password" },
    });
    const userTarget = await request(base, "PATCH", `/api/admin/sub-admins/${userAcct.json.user.id}/permissions`, {
      token: superAdmin.token,
      body: { canManageQuotes: true },
    });
    expect(userTarget.status).toBe(400);

    const missing = await request(base, "PATCH", `/api/admin/sub-admins/00000000-0000-0000-0000-000000000000/permissions`, {
      token: superAdmin.token,
      body: { canManageQuotes: true },
    });
    expect(missing.status).toBe(404);
  });

  it("audits every permission change and exposes flags in the users list", async () => {
    const logs = await prisma.adminLog.findMany({
      where: { action: "admin.permissions" },
      orderBy: { createdAt: "desc" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(4);
    expect(logs.every((l) => l.adminEmail === "mirabbostolqinjonov@gmail.com")).toBe(true);
    expect(logs.every((l) => l.targetId === subAdmin.id)).toBe(true);
    expect(logs.some((l) => l.detail.includes("canManageQuotes=false"))).toBe(true);
    expect(logs[0].detail).toContain("canManageQuotes=true");

    const list = await request(base, "GET", "/api/admin/users", { token: ADMIN });
    expect(list.status).toBe(200);
    const meAdmin = list.json.users.find((u: any) => u.id === subAdmin.id);
    expect(meAdmin.canViewUsers).toBe(true);
    expect(meAdmin.canManageQuotes).toBe(true);
  });
});