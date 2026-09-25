import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

const ADMIN = ADMIN_PASSWORD;
const PERMISSION_DENIED = "Ushbu bo'limga kirish uchun sizda yetarli huquq yo'q";
const BUILTIN_KEYS = [
  "canViewUsers",
  "canManageUsers",
  "canManageQuotes",
  "canManageCategories",
  "canManageQuizzes",
  "canManageAnnouncements",
  "canManageFeedback",
  "canManageSettings",
  "canViewAudit",
];

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

async function setPerm(base: string, token: string, targetId: string, permissions: Record<string, boolean>): Promise<{ status: number; json: any }> {
  return request(base, "PATCH", `/api/admin/sub-admins/${targetId}/permissions`, {
    token,
    body: { permissions },
  });
}

describe("E2E: admin RBAC (dynamic feature registry)", () => {
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

  it("seeds the feature registry with the built-in features; /features exposes them", async () => {
    const res = await request(base, "GET", "/api/admin/features", { token: ADMIN });
    expect(res.status).toBe(200);
    const keys = res.json.features.map((f: any) => f.key);
    expect(keys).toEqual(expect.arrayContaining(BUILTIN_KEYS));
    const quotes = res.json.features.find((f: any) => f.key === "canManageQuotes");
    expect(quotes.defaultEnabled).toBe(true);
    expect(quotes.source).toBe("builtin");
  });

  it("lists all admins with their effective permissions; isSuperAdmin derived from role only", async () => {
    const res = await request(base, "GET", "/api/admin/sub-admins", { token: ADMIN });
    expect(res.status).toBe(200);
    const admins = res.json.admins;
    expect(admins).toHaveLength(2);

    const superAdm = admins.find((a: any) => a.id === superAdmin.id);
    const subAdm = admins.find((a: any) => a.id === subAdmin.id);
    expect(superAdm.isSuperAdmin).toBe(true);
    expect(superAdm.permissions.canManageQuotes).toBe(true);
    expect(subAdm.isSuperAdmin).toBe(false);
    for (const key of BUILTIN_KEYS) {
      expect(subAdm.permissions[key]).toBe(true);
    }
  });

  it("exposes the acting admin via /me with effective permissions", async () => {
    const asMaster = await request(base, "GET", "/api/admin/me", { token: ADMIN });
    expect(asMaster.status).toBe(200);
    expect(asMaster.json.admin.isSuperAdmin).toBe(true);
    for (const key of BUILTIN_KEYS) {
      expect(asMaster.json.admin.permissions[key]).toBe(true);
    }
    const asSub = await request(base, "GET", "/api/admin/me", { token: subAdmin.token });
    expect(asSub.status).toBe(200);
    expect(asSub.json.admin.isSuperAdmin).toBe(false);
    expect(asSub.json.admin.permissions.canManageQuotes).toBe(true);
  });

  it("blocks a plain ADMIN (and a USER) from the super-admin-only sub-admin APIs", async () => {
    const plain = await request(base, "GET", "/api/admin/sub-admins", { token: subAdmin.token });
    expect(plain.status).toBe(403);
    const patch = await setPerm(base, subAdmin.token, subAdmin.id, { canManageQuotes: false });
    expect(patch.status).toBe(403);

    const email = `${unique("rbacuser")}@example.com`;
    const u = await request(base, "POST", "/api/auth/register", { body: { email, password: "s3cret-password" } });
    const asUser = await request(base, "GET", "/api/admin/sub-admins", { token: u.json.token });
    expect(asUser.status).toBe(403);
  });

  it("turns OFF canManageQuotes -> quotes API returns 403 with the exact message; grants stored", async () => {
    const off = await setPerm(base, superAdmin.token, subAdmin.id, { canManageQuotes: false });
    expect(off.status).toBe(200);
    expect(off.json.admin.permissions.canManageQuotes).toBe(false);
    expect(off.json.admin.permissions.canViewUsers).toBe(true);
    expect(off.json.admin.isSuperAdmin).toBe(false);

    const grant = await prisma.adminGrant.findUnique({
      where: { adminId_featureKey: { adminId: subAdmin.id, featureKey: "canManageQuotes" } },
    });
    expect(grant?.enabled).toBe(false);

    const quotes = await request(base, "GET", "/api/admin/quotes", { token: subAdmin.token });
    expect(quotes.status).toBe(403);
    expect(quotes.json.error).toBe(PERMISSION_DENIED);

    const users = await request(base, "GET", "/api/admin/users", { token: subAdmin.token });
    expect(users.status).toBe(200);
    const master = await request(base, "GET", "/api/admin/quotes", { token: ADMIN });
    expect(master.status).toBe(200);
  });

  it("turns OFF canViewUsers -> user-facing views are blocked; stats stay open", async () => {
    const off = await setPerm(base, superAdmin.token, subAdmin.id, { canViewUsers: false });
    expect(off.status).toBe(200);

    const users = await request(base, "GET", "/api/admin/users", { token: subAdmin.token });
    expect(users.status).toBe(403);
    expect(users.json.error).toBe(PERMISSION_DENIED);

    const tgBans = await request(base, "GET", "/api/admin/bans/telegram", { token: subAdmin.token });
    expect(tgBans.status).toBe(403);

    const stats = await request(base, "GET", "/api/admin/stats", { token: subAdmin.token });
    expect(stats.status).toBe(200);
  });

  it("turns OFF canManageCategories -> categories/tags APIs are blocked", async () => {
    const off = await setPerm(base, superAdmin.token, subAdmin.id, { canManageCategories: false });
    expect(off.status).toBe(200);

    const categories = await request(base, "GET", "/api/admin/categories", { token: subAdmin.token });
    expect(categories.status).toBe(403);
    const tags = await request(base, "GET", "/api/admin/tags", { token: subAdmin.token });
    expect(tags.status).toBe(403);
  });

  it("turns OFF the five new module gates -> those admin APIs are blocked", async () => {
    const off = await setPerm(base, superAdmin.token, subAdmin.id, {
      canManageQuizzes: false,
      canManageAnnouncements: false,
      canManageFeedback: false,
      canManageSettings: false,
      canViewAudit: false,
    });
    expect(off.status).toBe(200);

    const quizzes = await request(base, "GET", "/api/admin/quizzes", { token: subAdmin.token });
    expect(quizzes.status).toBe(403);
    const announcements = await request(base, "GET", "/api/admin/announcements", { token: subAdmin.token });
    expect(announcements.status).toBe(403);
    const feedback = await request(base, "GET", "/api/admin/feedback", { token: subAdmin.token });
    expect(feedback.status).toBe(403);
    const settings = await request(base, "PUT", "/api/admin/settings", {
      token: subAdmin.token,
      body: { settings: [{ key: "site.name", value: "Hacker", label: "Sayt nomi", group: "general" }] },
    });
    expect(settings.status).toBe(403);
    const audit = await request(base, "GET", "/api/admin/audit-logs", { token: subAdmin.token });
    expect(audit.status).toBe(403);
  });

  it("re-enables all permissions -> grant rows revert to defaults and routes work again", async () => {
    const on = await setPerm(base, superAdmin.token, subAdmin.id, {
      canViewUsers: true,
      canManageUsers: true,
      canManageQuotes: true,
      canManageCategories: true,
      canManageQuizzes: true,
      canManageAnnouncements: true,
      canManageFeedback: true,
      canManageSettings: true,
      canViewAudit: true,
    });
    expect(on.status).toBe(200);
    for (const key of BUILTIN_KEYS) {
      expect(on.json.admin.permissions[key]).toBe(true);
    }
    // A value equal to the feature default removes the grant row.
    const grantRows = await prisma.adminGrant.count({ where: { adminId: subAdmin.id } });
    expect(grantRows).toBe(0);

    const quotes = await request(base, "GET", "/api/admin/quotes", { token: subAdmin.token });
    expect(quotes.status).toBe(200);
    const users = await request(base, "GET", "/api/admin/users", { token: subAdmin.token });
    expect(users.status).toBe(200);
    const quizzes = await request(base, "GET", "/api/admin/quizzes", { token: subAdmin.token });
    expect(quizzes.status).toBe(200);
  });

  it("rejects malformed bodies and illegal targets", async () => {
    const empty = await setPerm(base, superAdmin.token, subAdmin.id, {});
    expect(empty.status).toBe(400);

    const unknown = await setPerm(base, superAdmin.token, subAdmin.id, { canDeleteEverything: true });
    expect(unknown.status).toBe(400);

    const nonBoolean = await setPerm(base, superAdmin.token, subAdmin.id, { canManageUsers: "yes" as unknown as boolean });
    expect(nonBoolean.status).toBe(400);

    const superTarget = await setPerm(base, superAdmin.token, superAdmin.id, { canManageQuotes: false });
    expect(superTarget.status).toBe(400);

    const userAcct = await request(base, "POST", "/api/auth/register", {
      body: { email: `${unique("rbactarget")}@example.com`, password: "s3cret-password" },
    });
    const userTarget = await setPerm(base, superAdmin.token, userAcct.json.user.id, { canManageQuotes: true });
    expect(userTarget.status).toBe(400);

    const missing = await setPerm(base, superAdmin.token, "00000000-0000-0000-0000-000000000000", { canManageQuotes: true });
    expect(missing.status).toBe(404);
  });

  it("audits every permission change and exposes permissions in the users list", async () => {
    const logs = await prisma.adminLog.findMany({
      where: { action: "admin.permissions" },
      orderBy: { createdAt: "desc" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(5);
    expect(logs.every((l) => l.adminEmail === "mirabbostolqinjonov@gmail.com")).toBe(true);
    expect(logs.every((l) => l.targetId === subAdmin.id)).toBe(true);
    expect(logs.some((l) => l.detail.includes("canManageQuotes=false"))).toBe(true);
    expect(logs[0].detail).toContain("canManageQuotes=true");

    const list = await request(base, "GET", "/api/admin/users", { token: ADMIN });
    expect(list.status).toBe(200);
    const meAdmin = list.json.users.find((u: any) => u.id === subAdmin.id);
    expect(meAdmin.permissions.canViewUsers).toBe(true);
    expect(meAdmin.permissions.canManageQuotes).toBe(true);
  });
});

describe("E2E: policy impact review (PUSH + draft)", () => {
  let ts: TestServer;
  let base: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
  });

  afterAll(async () => {
    await ts.close();
  });

  it("POST /api/admin/policies/review prepares a TERMS draft and PUSHes (audit row)", async () => {
    const first = await request(base, "POST", "/api/admin/policies/review", {
      token: ADMIN,
      body: { reason: "Yangilik: saytga yangi modul qo'shildi" },
    });
    expect(first.status).toBe(201);
    expect(first.json.ok).toBe(true);
    expect(first.json.created).toBe(true);
    expect(first.json.draft.type).toBe("TERMS");
    expect(first.json.draft.changeSummary).toContain("yangi modul");

    const list = await request(base, "GET", "/api/admin/policies", { token: ADMIN });
    const drafts = list.json.policies.filter((p: any) => !p.isApproved);
    expect(drafts.some((p: any) => p.id === first.json.draft.id)).toBe(true);

    // Re-running merges into the same draft instead of creating a second one.
    const second = await request(base, "POST", "/api/admin/policies/review", {
      token: ADMIN,
      body: { reason: "Sozlamalar yangilandi: site.name" },
    });
    expect(second.status).toBe(201);
    expect(second.json.created).toBe(false);
    expect(second.json.draft.id).toBe(first.json.draft.id);

    const audit = await prisma.adminLog.findMany({ where: { action: "policy.review" }, orderBy: { createdAt: "desc" } });
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a too-short review reason", async () => {
    const res = await request(base, "POST", "/api/admin/policies/review", {
      token: ADMIN,
      body: { reason: "ab" },
    });
    expect(res.status).toBe(400);
  });

  it("an important settings change triggers a policy review automatically", async () => {
    await request(base, "PUT", "/api/admin/settings", {
      token: ADMIN,
      body: {
        settings: [
          { key: "site.name", value: "Iqtibosim v2", label: "Sayt nomi", group: "general" },
          { key: "contact.email", value: "support@example.com", label: "Aloqa email", group: "general" },
        ],
      },
    });
    const audit = await prisma.adminLog.findMany({ where: { action: "policy.review" }, orderBy: { createdAt: "desc" } });
    expect(audit.length).toBe(3); // the two manual + this automatic one
    expect(audit[0].detail).toContain("site.name");
    expect(audit[0].detail).toContain("contact.email");
  });
});