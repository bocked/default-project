import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";
import { emailTranscript } from "../../src/lib/email.js";

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer();
  await cleanDatabase();
});

afterAll(async () => {
  await server.close();
});

/** Pulls the last verification email out of the (SMTP-less) transcript and
 *  extracts the 6-digit OTP code embedded in its plain-text body. */
function otpFor(email: string): string {
  const record = [...emailTranscript].reverse().find((e) => e.to === email);
  expect(record).toBeDefined();
  const match = /email kodini quyida kiriting \(muddat: 15 daqiqa\):\n(\d{6})/.exec(record!.text);
  expect(match).not.toBeNull();
  return match![1];
}

describe("E2E: email verification by 6-digit OTP code", () => {
  it("register emails an OTP and verify-email redeems it", async () => {
    const email = `${unique("otp")}@example.com`;
    const reg = await request(server.base, "POST", "/api/auth/register", {
      body: { email, password: "s3cret-password" },
    });
    expect(reg.status).toBe(201);
    expect(reg.json.user.emailVerified).toBe(false);

    const code = otpFor(email);
    expect(code).toMatch(/^\d{6}$/);

    const verify = await request(server.base, "POST", "/api/auth/verify-email", {
      body: { email, code },
    });
    expect(verify.status).toBe(200);
    expect(verify.json.ok).toBe(true);

    const login = await request(server.base, "POST", "/api/auth/login", {
      body: { email, password: "s3cret-password" },
    });
    expect(login.status).toBe(200);
    expect(login.json.user.emailVerified).toBe(true);
  });

  it("rejects a wrong OTP and a stale/reused one", async () => {
    const email = `${unique("otp2")}@example.com`;
    await request(server.base, "POST", "/api/auth/register", {
      body: { email, password: "s3cret-password" },
    });

    const wrong = await request(server.base, "POST", "/api/auth/verify-email", {
      body: { email, code: "000000" },
    });
    expect(wrong.status).toBe(400);

    const code = otpFor(email);
    const bad = await request(server.base, "POST", "/api/auth/verify-email", {
      body: { email, code: code === "000000" ? "111111" : "000000" },
    });
    expect(bad.status).toBe(400);

    const ok = await request(server.base, "POST", "/api/auth/verify-email", { body: { email, code } });
    expect(ok.status).toBe(200);

    // The code is cleared after redemption, so reusing it fails.
    const reuse = await request(server.base, "POST", "/api/auth/verify-email", { body: { email, code } });
    expect(reuse.status).toBe(400);
  });

  it("requires exactly one method: token, or email+code together", async () => {
    const both = await request(server.base, "POST", "/api/auth/verify-email", {
      body: { token: "a".repeat(32), email: "x@y.uz", code: "123456" },
    });
    expect(both.status).toBe(400);

    const neither = await request(server.base, "POST", "/api/auth/verify-email", { body: {} });
    expect(neither.status).toBe(400);

    const shortCode = await request(server.base, "POST", "/api/auth/verify-email", {
      body: { email: "x@y.uz", code: "123" },
    });
    expect(shortCode.status).toBe(400);
  });
});