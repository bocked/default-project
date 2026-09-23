import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/lib/prisma.js";
import { startTestServer, cleanDatabase, request, unique, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

const SUPER = ADMIN_PASSWORD;

/** Registers a login-able user and promotes it to a plain ADMIN so we can
 *  assert the email-management endpoints are SUPER_ADMIN-only. */
async function makePlainAdmin(base: string): Promise<string> {
  const email = `${unique("emadmin")}@example.com`;
  const password = "s3cret-password";
  const reg = await request(base, "POST", "/api/auth/register", { body: { email, password } });
  expect(reg.status).toBe(201);
  const grant = await request(base, "PATCH", `/api/admin/users/${reg.json.user.id}/role`, {
    token: SUPER,
    body: { role: "ADMIN" },
  });
  expect(grant.status).toBe(200);
  const login = await request(base, "POST", "/api/auth/login", { body: { email, password } });
  expect(login.status).toBe(200);
  expect(login.json.user.role).toBe("ADMIN");
  return login.json.token;
}

describe("E2E: super admin email management dashboard", () => {
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

  it("requires authentication and returns 403 for a plain ADMIN", async () => {
    const anon = await request(base, "GET", "/api/admin/emails/health", {});
    expect(anon.status).toBe(401);

    const adminToken = await makePlainAdmin(base);
    const admin = await request(base, "GET", "/api/admin/emails/health", { token: adminToken });
    expect(admin.status).toBe(403);

    const superOk = await request(base, "GET", "/api/admin/emails/health", { token: SUPER });
    expect(superOk.status).toBe(200);
  });

  it("health reports the transport configuration without secrets", async () => {
    const res = await request(base, "GET", "/api/admin/emails/health", { token: SUPER });
    expect(res.status).toBe(200);
    expect(["resend", "offline"]).toContain(res.json.mode);
    expect(typeof res.json.configured).toBe("boolean");
    expect(res.json.from).toBeTruthy();
    expect(res.json).not.toHaveProperty("pass");
  });

  it("logs every verification email with its type and status", async () => {
    const email = `${unique("emlog")}@example.com`;
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email, password: "s3cret-password" },
    });
    expect(reg.status).toBe(201);

    const logs = await request(base, "GET", "/api/admin/emails/logs", { token: SUPER });
    expect(logs.status).toBe(200);
    const row = logs.json.logs.find((l: { type: string; to: string }) => l.type === "VERIFICATION" && l.to === email);
    expect(row).toBeDefined();
    expect(row.status).toBe("SUCCESS");
    expect(row.subject).toContain("emailni tasdiqlang");
  });

  it("tracks password-reset emails as a separate type", async () => {
    const email = `${unique("emreset")}@example.com`;
    await request(base, "POST", "/api/auth/register", { body: { email, password: "s3cret-password" } });

    const forgot = await request(base, "POST", "/api/auth/forgot-password", { body: { email } });
    expect(forgot.status).toBe(200);

    const logs = await request(base, "GET", "/api/admin/emails/logs", {
      token: SUPER,
      headers: {},
    });
    const row = logs.json.logs.find((l: { type: string; to: string }) => l.type === "PASSWORD_RESET" && l.to === email);
    expect(row).toBeDefined();
    expect(row.status).toBe("SUCCESS");
  });

  it("filters the log by type and paginates", async () => {
    const all = await request(base, "GET", "/api/admin/emails/logs?limit=1", { token: SUPER });
    expect(all.status).toBe(200);
    expect(Array.isArray(all.json.logs)).toBe(true);
    expect(all.json.logs.length).toBeLessThanOrEqual(1);
    expect(all.json.total).toBeGreaterThan(0);

    const onlyReset = await request(base, "GET", "/api/admin/emails/logs?type=PASSWORD_RESET", { token: SUPER });
    expect(onlyReset.status).toBe(200);
    expect(onlyReset.json.logs.every((l: { type: string }) => l.type === "PASSWORD_RESET")).toBe(true);
  });

  it("serves rendered template previews with sample data", async () => {
    const res = await request(base, "GET", "/api/admin/emails/templates", { token: SUPER });
    expect(res.status).toBe(200);
    expect(res.json.templates.length).toBe(2);
    const verification = res.json.templates.find((t: { id: string }) => t.id === "verification");
    expect(verification.html).toContain("482719");
    expect(verification.html).toMatch(/muddat: \d+ daqiqa/);
    const reset = res.json.templates.find((t: { id: string }) => t.id === "password-reset");
    expect(reset.html).toContain("/reset-password");
  });

  it("sends a live Resend test email and records it (transcript mode here)", async () => {
    const email = `${unique("emtest")}@example.com`;
    const res = await request(base, "POST", "/api/admin/emails/test", {
      token: SUPER,
      body: { to: email },
    });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.to).toBe(email);

    const logs = await request(base, "GET", "/api/admin/emails/logs?type=TEST", { token: SUPER });
    const row = logs.json.logs.find((l: { to: string }) => l.to === email);
    expect(row).toBeDefined();
    expect(row.status).toBe("SUCCESS");
  });

  it("lists active OTPs masked, then resend/revoke toggles the row", async () => {
    const email = `${unique("emotp")}@example.com`;
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email, password: "s3cret-password" },
    });
    expect(reg.status).toBe(201);
    const userId = reg.json.user.id;

    const list = await request(base, "GET", "/api/admin/emails/otp", { token: SUPER });
    expect(list.status).toBe(200);
    const entry = list.json.otps.find((o: { email: string }) => o.email === email);
    expect(entry).toBeDefined();
    expect(entry.masked).toBe("••••••");
    expect(new Date(entry.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const resend = await request(base, "POST", `/api/admin/emails/otp/${userId}/resend`, { token: SUPER });
    expect(resend.status).toBe(200);
    expect(resend.json.email).toBe(email);

    const afterResend = await request(base, "GET", "/api/admin/emails/otp", { token: SUPER });
    expect(afterResend.json.otps.some((o: { email: string }) => o.email === email)).toBe(true);

    const revoke = await request(base, "POST", `/api/admin/emails/otp/${userId}/revoke`, { token: SUPER });
    expect(revoke.status).toBe(200);

    const afterRevoke = await request(base, "GET", "/api/admin/emails/otp", { token: SUPER });
    expect(afterRevoke.json.otps.some((o: { email: string }) => o.email === email)).toBe(false);
  });

  it("rejects revoke/resend on a missing user", async () => {
    const resend = await request(base, "POST", "/api/admin/emails/otp/nope/resend", { token: SUPER });
    expect(resend.status).toBe(404);
    const revoke = await request(base, "POST", "/api/admin/emails/otp/nope/revoke", { token: SUPER });
    expect(revoke.status).toBe(404);
  });

  it("cannot resend for a verified user", async () => {
    const email = `${unique("emverified")}@example.com`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, passwordHash: "x", emailVerified: true, phoneVerified: false },
    });
    const resend = await request(base, "POST", `/api/admin/emails/otp/${user.id}/resend`, { token: SUPER });
    expect(resend.status).toBe(400);
  });
});