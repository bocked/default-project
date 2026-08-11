import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";
import { emailTranscript } from "../../src/lib/email.js";

function resetLinkFor(email: string): string {
  const record = [...emailTranscript].reverse().find(
    (r) => r.to === email && r.subject.includes("parolni tiklash")
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

  it("does not reveal whether an email is registered", async () => {
    const before = emailTranscript.length;
    const res = await request(base, "POST", "/api/auth/forgot-password", {
      body: { email: `${unique("ghost")}@example.com` },
    });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect(emailTranscript.length).toBe(before);
  });

  it("rejects an invalid reset token", async () => {
    const res = await request(base, "POST", "/api/auth/reset-password", {
      body: { token: "deadbeef", password: "Whatever123!" },
    });
    expect(res.status).toBe(400);
  });
});
