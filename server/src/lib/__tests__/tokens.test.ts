import { describe, expect, it } from "vitest";
import {
  signAuthToken,
  verifyAuthToken,
  generateEmailVerificationToken,
  hashEmailVerificationToken,
  generateTelegramVerifyToken,
  hashTelegramVerifyToken,
  generateTelegramVerifyCode,
  hashTelegramVerifyCode,
} from "../tokens.js";

describe("auth tokens (JWT)", () => {
  it("signs and verifies a token for a user", () => {
    const token = signAuthToken("user-123");
    expect(token).toBeTruthy();
    expect(verifyAuthToken(token)).toEqual({ sub: "user-123" });
  });

  it("rejects tampered or garbage tokens", () => {
    expect(verifyAuthToken("not-a-jwt")).toBeNull();
    expect(verifyAuthToken(`${signAuthToken("a")}x`)).toBeNull();
  });
});

describe("email verification tokens", () => {
  it("generates a long random hex token", () => {
    const a = generateEmailVerificationToken();
    const b = generateEmailVerificationToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("stores only the sha256 digest", () => {
    const token = generateEmailVerificationToken();
    const digest = hashEmailVerificationToken(token);
    expect(digest).not.toBe(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashEmailVerificationToken(token)).toBe(digest);
  });
});

describe("telegram verification tokens", () => {
  it("keeps the t.me deep-link payload under Telegram's 64-char limit", () => {
    const token = generateTelegramVerifyToken();
    // `verify_` prefix + token must fit the `?start=` parameter (max 64 chars).
    expect(`verify_${token}`.length).toBeLessThanOrEqual(64);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("stores only the sha256 digest", () => {
    const token = generateTelegramVerifyToken();
    const digest = hashTelegramVerifyToken(token);
    expect(digest).not.toBe(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(hashTelegramVerifyToken(token)).toBe(digest);
  });

  it("generates a 6-digit code and stores only its digest", () => {
    const code = generateTelegramVerifyCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashTelegramVerifyCode(code)).not.toBe(code);
  });
});
