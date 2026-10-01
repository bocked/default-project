import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server as HttpServer } from "node:http";
import type { Server as IOServer } from "socket.io";
import { createApp } from "../../src/app.js";
import {
  apiLimiter,
  authBruteLimiter,
  authLimiter,
  authPublicLimiter,
  resendWebhookLimiter,
  telegramWebhookLimiter,
} from "../../src/lib/rateLimit.js";
import { request, unique } from "./helpers.js";

/**
 * The E2E suite boots with NODE_ENV=test which disables the in-memory HTTP
 * rate limiters. This file opts back in via FORCE_RATE_LIMITS=1 to prove the
 * actual 429 behaviour. The flag is restored afterwards (isolate:false shares
 * process.env with other files in the same worker).
 */
process.env.FORCE_RATE_LIMITS = "1";

// The limiters are module singletons (shared across every server and file in
// this worker) keyed by client IP. Our test servers talk to 127.0.0.1, so a
// fresh budget per scenario means resetting those keys before each test.
const RATE_KEYS = ["127.0.0.1", "::ffff:127.0.0.1"];
function resetLimiters(): void {
  for (const key of RATE_KEYS) {
    apiLimiter.resetKey(key);
    authLimiter.resetKey(key);
    authPublicLimiter.resetKey(key);
    authBruteLimiter.resetKey(key);
    telegramWebhookLimiter.resetKey(key);
    resendWebhookLimiter.resetKey(key);
  }
}

/** Only the global 100/min API budget, so a per-route limiter can be observed. */
function resetApiLimiter(): void {
  for (const key of RATE_KEYS) apiLimiter.resetKey(key);
}

describe("E2E: HTTP rate limiting (FORCE_RATE_LIMITS=1)", () => {
  let base: string;
  let server: HttpServer;
  let io: IOServer;

  beforeAll(async () => {
    resetLimiters();
    const built = createApp({ autoLogging: false });
    server = built.server;
    io = built.io;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server did not bind a port");
    base = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(resetLimiters);

  afterAll(async () => {
    delete process.env.FORCE_RATE_LIMITS;
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("caps the general API at 100 requests per minute", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 103; i++) {
      const res = await fetch(`${base}/api/content`);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 100)).not.toContain(429);
    expect(statuses[100]).toBe(429);
    expect(statuses[statuses.length - 1]).toBe(429);
  });

  it("caps register at 5 attempts per 15 minutes (brute limiter)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(base, "POST", "/api/auth/register", {
        body: { email: `${unique("rlim")}@example.com`, password: "s3cret-password" },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });

  it("caps login at 5 attempts per 15 minutes (brute limiter)", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(base, "POST", "/api/auth/login", {
        body: { email: `${unique("llim")}@example.com`, password: "wrong-password" },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });

  it("caps public auth/verify-email at 10 requests per 15 minutes", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await request(base, "POST", "/api/auth/verify-email", {
        body: { email: `${unique("vlim")}@example.com`, code: "123456" },
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[9]).not.toBe(429);
    expect(statuses[10]).toBe(429);
  });

  /**
   * The webhook routes are authenticated by a secret/signature, but an unbounded
   * number of accepted calls still costs signature verification plus DB work.
   *
   * These assert the per-webhook cap is wired up. No valid secret is configured
   * in the test env, so the handlers answer 401/500 rather than doing real work.
   * That is fine: the limiter runs BEFORE that auth check, so exhausting the
   * budget yields 429 instead — which is precisely the property we want (the
   * expensive path is capped for an attacker who does hold a valid secret).
   *
   * Note the mount order in app.ts: `/api/webhooks` is registered BEFORE the
   * global apiLimiter, so the Resend webhook previously had no cap at all;
   * `/api/telegram` sits after it and inherited 100/min (~6000/hr) from the
   * global limiter, which the new 1000/hr rule now tightens.
   */
  it("caps the Telegram webhook at 1000 requests per hour", async () => {
    // The global apiLimiter (100/min) also applies to /api/telegram, so it is
    // periodically reset here to prove the *webhook* limiter is the binding cap
    // at exactly 1000/hour.
    for (let i = 0; i < 1002; i++) {
      if (i % 90 === 0) resetApiLimiter();
      const res = await fetch(`${base}/api/telegram/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ update_id: i }),
      });
      if (i < 1000) expect(res.status).toBe(401);
      else expect(res.status).toBe(429);
    }
  });

  it("caps the Resend webhook at 300 requests per hour", async () => {
    // No RESEND_WEBHOOK_SECRET in the test env, so the handler rejects (500)
    // after logging; anything past the budget is throttled (429).
    for (let i = 0; i < 302; i++) {
      const res = await fetch(`${base}/api/webhooks/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email.sent" }),
      });
      if (i < 300) expect(res.status).not.toBe(429);
      else expect(res.status).toBe(429);
    }
  });
});