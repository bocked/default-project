import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";
import { emailTranscript } from "../../src/lib/email.js";
import { config } from "../../src/config.js";
import { prisma } from "../../src/lib/prisma.js";

function resetLinkFor(email: string): string {
  const record = [...emailTranscript].reverse().find(
    (r) => r.to === email && r.subject.toLowerCase().includes("parolni tiklash")
  );
  if (!record) throw new Error(`no reset email found for ${email}`);
  return record.text.match(/https?:\/\/\S+/)?.[0] ?? "";
}

describe("E2E: password reset flow", () => {
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

  it("resets a password and invalidates the old one and the token", async () => {
    const email = `${unique("pwd")}@example.com`;
    const oldPass = "OldPass123!";
    const newPass = "NewPass456!";

    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email, password: oldPass, name: "Reset Tester" },
    });
    expect(reg.status).toBe(201);
    expect(reg.json.user.role).toBe("USER");

    const reset = await request(base, "POST", "/api/auth/forgot-password", { body: { email } });
    expect(reset.status).toBe(200);
    expect(reset.json.ok).toBe(true);

    const token = new URL(resetLinkFor(email)).searchParams.get("token");
    expect(token).toBeTruthy();

    const change = await request(base, "POST", "/api/auth/reset-password", {
      body: { token, password: newPass },
    });
    expect(change.status).toBe(200);
    expect(change.json.ok).toBe(true);

    const oldLogin = await request(base, "POST", "/api/auth/login", {
      body: { email, password: oldPass },
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(base, "POST", "/api/auth/login", {
      body: { email, password: newPass },
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.json.user.email).toBe(email);

    const reuse = await request(base, "POST", "/api/auth/reset-password", {
      body: { token, password: "Another456!" },
    });
    expect(reuse.status).toBe(400);
  });

  it("answers 200 uniformly for an unregistered email without sending anything", async () => {
    const before = emailTranscript.length;
    const res = await request(base, "POST", "/api/auth/forgot-password", {
      body: { email: `${unique("ghost")}@example.com` },
    });
    // Account enumeration is closed: unknown addresses get the exact same
    // success shape as registered ones, and no email is dispatched.
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(res.json.message).toBe("Parolni tiklash kodi pochtangizga yuborildi!");
    expect(emailTranscript.length).toBe(before);
  });

  it("redeems the emailed 6-digit OTP code with email + code", async () => {
    const email = `${unique("otp")}@example.com`;
    const oldPass = "OldPass123!";
    const newPass = "NewPass456!";

    await request(base, "POST", "/api/auth/register", {
      body: { email, password: oldPass, name: "Otp Tester" },
    });

    const forgot = await request(base, "POST", "/api/auth/forgot-password", { body: { email } });
    expect(forgot.status).toBe(200);
    expect(forgot.json.ok).toBe(true);

    const record = [...emailTranscript].reverse().find(
      (r) => r.to === email && r.subject.toLowerCase().includes("parolni tiklash")
    );
    expect(record).toBeDefined();
    const code = record!.text.match(/(\d{6})/)?.[1];
    expect(code).toBeTruthy();

    const change = await request(base, "POST", "/api/auth/reset-password", {
      body: { email, code, password: newPass },
    });
    expect(change.status).toBe(200);

    const newLogin = await request(base, "POST", "/api/auth/login", {
      body: { email, password: newPass },
    });
    expect(newLogin.status).toBe(200);

    const wrongCode = await request(base, "POST", "/api/auth/reset-password", {
      body: { email, code: "000000", password: "Another456!" },
    });
    expect(wrongCode.status).toBe(400);
  });

  it("rejects an invalid reset token", async () => {
    const res = await request(base, "POST", "/api/auth/reset-password", {
      body: { token: "deadbeef", password: "Whatever123!" },
    });
    expect(res.status).toBe(400);
  });

  it("grants ADMIN to configured admin emails on register and promotes on login", async () => {
    const adminEmail = `admin-${unique("adm")}@example.com`;
    config.adminEmails.push(adminEmail);

    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email: adminEmail, password: "AdminPass123!", name: "Admin" },
    });
    expect(reg.status).toBe(201);
    expect(reg.json.user.role).toBe("ADMIN");

    // A USER created before its email was added to adminEmails is promoted on login.
    const email = `${unique("late")}@example.com`;
    await request(base, "POST", "/api/auth/register", {
      body: { email, password: "LatePass123!", name: "Late" },
    });
    config.adminEmails.push(email);
    const login = await request(base, "POST", "/api/auth/login", {
      body: { email, password: "LatePass123!" },
    });
    expect(login.status).toBe(200);
    expect(login.json.user.role).toBe("ADMIN");

    const row = await prisma.user.findUnique({ where: { email } });
    expect(row?.role).toBe("ADMIN");
  });

  it("requires re-accepting the terms when the accepted version is outdated", async () => {
    const email = `${unique("terms")}@example.com`;
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email, password: "TermPass123!" },
    });
    expect(reg.status).toBe(201);
    expect(reg.json.user.acceptedTermsVersion).toBe(config.currentTermsVersion);
    expect(reg.json.user.termsRequired).toBe(false);

    // Simulate an account that accepted an older version before the update.
    await prisma.user.update({ where: { email }, data: { acceptedTermsVersion: "0.1" } });

    const login = await request(base, "POST", "/api/auth/login", {
      body: { email, password: "TermPass123!" },
    });
    expect(login.status).toBe(200);
    expect(login.json.user.termsRequired).toBe(true);
    expect(login.json.user.currentTermsVersion).toBe(config.currentTermsVersion);

    // Accepting a version other than the current one is rejected.
    const wrong = await request(base, "POST", "/api/auth/accept-terms", {
      token: login.json.token,
      body: { version: "nope" },
    });
    expect(wrong.status).toBe(400);

    // The guard is lifted as soon as the current version is accepted.
    const accept = await request(base, "POST", "/api/auth/accept-terms", {
      token: login.json.token,
      body: { version: config.currentTermsVersion },
    });
    expect(accept.status).toBe(200);
    expect(accept.json.user.termsRequired).toBe(false);

    const login2 = await request(base, "POST", "/api/auth/login", {
      body: { email, password: "TermPass123!" },
    });
    expect(login2.json.user.termsRequired).toBe(false);
  });

  it("requires auth for accept-terms", async () => {
    const res = await request(base, "POST", "/api/auth/accept-terms", {
      body: { version: config.currentTermsVersion },
    });
    expect(res.status).toBe(401);
  });
});
