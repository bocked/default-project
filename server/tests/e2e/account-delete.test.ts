import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, cleanDatabase, unique, type TestServer } from "./helpers.js";

function cookieValue(res: Response, name: string): string | null {
  const setCookies: string[] =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie")!]
        : [];
  for (const header of setCookies) {
    const [pair] = header.split(";");
    const idx = pair.indexOf("=");
    if (idx > -1 && pair.slice(0, idx).trim() === name) return pair.slice(idx + 1).trim();
  }
  return null;
}

describe("E2E: GDPR account self-delete (soft delete + anonymize)", () => {
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

  it("deletes the profile and anonymizes the account row", async () => {
    const email = `${unique("del")}@example.com`;
    const password = "s3cret-password";
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: "Delete Me", nickname: "deluser" }),
    });
    expect(reg.status).toBe(201);
    const { token } = (await reg.json()) as { token: string };
    const cookie = cookieValue(reg, "refresh_token");
    expect(cookie).toBeTruthy();

    const del = await fetch(`${base}/api/auth/me/delete`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(del.status).toBe(200);
    expect((await del.json()).ok).toBe(true);

    // The old access token is now rejected because the account is blocked.
    const meOld = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meOld.status).toBe(403);

    // The refresh cookie was revoked and the email is no longer the original.
    const refresh = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${cookie}` },
    });
    expect(refresh.status).toBe(401);

    // The original address can be re-registered: it was fully anonymized.
    const rereg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "brand-new-456!" }),
    });
    expect(rereg.status).toBe(201);
  });
});