import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer, cleanDatabase, unique, type TestServer } from "./helpers.js";

/** Pulls the value of a Set-Cookie header (raw fetch keeps them accessible,
 *  unlike the `request` helper which discards headers). */
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

describe("E2E: refresh token (rotating HttpOnly cookie)", () => {
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

  it("register + refresh rotate the cookie and mint a new access token", async () => {
    const email = `${unique("refresh")}@example.com`;
    const password = "s3cret-password";
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(reg.status).toBe(201);
    const regBody = (await reg.json()) as { token: string };
    const cookie = cookieValue(reg, "refresh_token");
    expect(cookie).toBeTruthy();

    const refresh = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${cookie}` },
    });
    expect(refresh.status).toBe(200);
    const refreshBody = (await refresh.json()) as { token: string };
    expect(refreshBody.token).toBeTruthy();
    expect(refreshBody.token).not.toBe(regBody.token);

    const me = await fetch(`${base}/api/auth/me`, {
      headers: { Authorization: `Bearer ${refreshBody.token}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { user: { email: string } };
    expect(meBody.user.email).toBe(email);
  });

  it("login also issues a refresh cookie and it works", async () => {
    const email = `${unique("loginref")}@example.com`;
    const password = "s3cret-password";
    await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = cookieValue(login, "refresh_token");
    expect(cookie).toBeTruthy();

    const refresh = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${cookie}` },
    });
    expect(refresh.status).toBe(200);
  });

  it("logout revokes the refresh token so it cannot be reused", async () => {
    const email = `${unique("logoutref")}@example.com`;
    const password = "s3cret-password";
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(reg.status).toBe(201);
    const cookie = cookieValue(reg, "refresh_token");
    expect(cookie).toBeTruthy();

    const logout = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${cookie}` },
    });
    expect(logout.status).toBe(200);

    const reuse = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${cookie}` },
    });
    expect(reuse.status).toBe(401);
  });

  it("refresh without a cookie returns 401", async () => {
    const res = await fetch(`${base}/api/auth/refresh`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rotation invalidates the previous refresh cookie", async () => {
    const email = `${unique("rotate")}@example.com`;
    const password = "s3cret-password";
    const reg = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const firstCookie = cookieValue(reg, "refresh_token");
    expect(firstCookie).toBeTruthy();

    const refresh = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${firstCookie}` },
    });
    expect(refresh.status).toBe(200);
    const secondCookie = cookieValue(refresh, "refresh_token");
    expect(secondCookie).toBeTruthy();
    expect(secondCookie).not.toBe(firstCookie);

    // The old cookie was rotated, so it must be rejected now.
    const reuseOld = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      headers: { Cookie: `refresh_token=${firstCookie}` },
    });
    expect(reuseOld.status).toBe(401);
  });
});