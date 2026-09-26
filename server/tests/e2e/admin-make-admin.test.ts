import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

const ADMIN = ADMIN_PASSWORD;

const ALL_GRANTS: Record<string, boolean> = {
  canViewUsers: true,
  canManageUsers: true,
  canManageQuotes: true,
  canManageCategories: true,
  canManageQuizzes: true,
  canManageAnnouncements: true,
  canManageFeedback: true,
  canManageSettings: true,
  canViewAudit: true,
};

async function registerUser(base: string): Promise<{ id: string; email: string }> {
  const email = `${unique("makeadmin")}@example.com`;
  const reg = await request(base, "POST", "/api/auth/register", { body: { email, password: "s3cret-password" } });
  expect(reg.status).toBe(201);
  return { id: reg.json.user.id, email };
}

async function makeAdmin(
  base: string,
  id: string,
  grants: Record<string, boolean>,
  token: string = ADMIN
): Promise<{ status: number; json: any }> {
  return request(base, "PATCH", `/api/admin/users/${id}/make-admin`, { token, body: { grants } });
}

describe("E2E: make-admin (granular promotion from the Users table)", () => {
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

  it("promotes a USER to ADMIN, pins the roleOverride and stores only grant overrides", async () => {
    const { id } = await registerUser(base);
    const res = await makeAdmin(base, id, { ...ALL_GRANTS, canManageSettings: false });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.user.role).toBe("ADMIN");
    expect(res.json.user.permissions.canManageSettings).toBe(false);
    expect(res.json.user.permissions.canManageQuotes).toBe(true);

    const db = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(db.role).toBe("ADMIN");
    expect(db.roleOverride).toBe("ADMIN");

    // Only the value differing from the feature default is stored as a row.
    const rows = await prisma.adminGrant.findMany({ where: { adminId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ adminId: id, featureKey: "canManageSettings", enabled: false });
  });

  it("a brand-new admin with all grants can log into the admin panel", async () => {
    const { id } = await registerUser(base);
    const res = await makeAdmin(base, id, ALL_GRANTS);
    expect(res.status).toBe(200);

    const login = await request(base, "POST", "/api/auth/login", {
      body: { email: (await prisma.user.findUniqueOrThrow({ where: { id } })).email, password: "s3cret-password" },
    });
    expect(login.status).toBe(200);
    expect(login.json.user.role).toBe("ADMIN");

    const users = await request(base, "GET", "/api/admin/users", { token: login.json.token });
    expect(users.status).toBe(200);
  });

  it("rejects already-ADMIN targets, unknown keys, missing users and empty grants", async () => {
    const { id } = await registerUser(base);
    await makeAdmin(base, id, ALL_GRANTS);

    const already = await makeAdmin(base, id, ALL_GRANTS);
    expect(already.status).toBe(400);
    expect(already.json.error).toBe("Faqat USER rolidagi foydalanuvchi admin qilinadi");

    const { id: other } = await registerUser(base);
    const unknown = await makeAdmin(base, other, { canDeleteEverything: true });
    expect(unknown.status).toBe(400);

    const missing = await makeAdmin(base, "00000000-0000-0000-0000-000000000000", ALL_GRANTS);
    expect(missing.status).toBe(404);

    const empty = await makeAdmin(base, (await registerUser(base)).id, {});
    expect(empty.status).toBe(400);
  });

  it("blocks self-promotion", async () => {
    const email = `${unique("selfadmin")}@example.com`;
    const reg = await request(base, "POST", "/api/auth/register", { body: { email, password: "s3cret-password" } });
    const id = reg.json.user.id;
    await makeAdmin(base, id, ALL_GRANTS);

    const login = await request(base, "POST", "/api/auth/login", { body: { email, password: "s3cret-password" } });
    expect(login.json.user.role).toBe("ADMIN");

    const self = await makeAdmin(base, id, ALL_GRANTS, login.json.token);
    expect(self.status).toBe(400);
    expect(self.json.error).toBe("O'zingizni admin qila olmaysiz");
  });

  it("a plain ADMIN with canManageUsers can also promote (parity with PATCH /role)", async () => {
    const subEmail = `${unique("subpromote")}@example.com`;
    const subReg = await request(base, "POST", "/api/auth/register", {
      body: { email: subEmail, password: "s3cret-password" },
    });
    const subId = subReg.json.user.id;
    await makeAdmin(base, subId, ALL_GRANTS);
    const subLogin = await request(base, "POST", "/api/auth/login", { body: { email: subEmail, password: "s3cret-password" } });
    expect(subLogin.json.user.role).toBe("ADMIN");

    const { id } = await registerUser(base);
    const promoted = await makeAdmin(base, id, ALL_GRANTS, subLogin.json.token);
    expect(promoted.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id } })).role).toBe("ADMIN");
  });

  it("audits every promotion", async () => {
    const { id, email } = await registerUser(base);
    await makeAdmin(base, id, { ...ALL_GRANTS, canViewAudit: false });

    const logs = await prisma.adminLog.findMany({ where: { action: "user.make-admin" }, orderBy: { createdAt: "desc" } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].targetId).toBe(id);
    expect(logs[0].detail).toContain(email);
    expect(logs[0].detail).toContain("canViewAudit=false");
  });
});