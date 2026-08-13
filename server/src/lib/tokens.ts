import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface AuthTokenPayload {
  sub: string;
  /** Issued at (seconds) — used to detect post-issue password changes if ever needed. */
  iat?: number;
}

export function signAuthToken(userId: string): string {
  return jwt.sign({}, config.jwtSecret, { subject: userId, expiresIn: "7d" });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (typeof payload === "string" || typeof payload.sub !== "string") return null;
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Email verification tokens
// ---------------------------------------------------------------------------

export function generateEmailVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Only the SHA-256 digest is stored, so a leaked database is not enough to
 *  redeem a token. */
export function hashEmailVerificationToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function emailVerificationExpiry(): Date {
  return new Date(Date.now() + config.verificationTokenHours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Password reset tokens
// ---------------------------------------------------------------------------

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Digest a token before storing it (same sha-256 approach as email tokens). */
export function hashPasswordResetToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function passwordResetExpiry(): Date {
  return new Date(Date.now() + config.verificationTokenHours * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Telegram verification tokens / codes
// ---------------------------------------------------------------------------

/** Opaque token embedded in `t.me/<bot>?start=verify_<token>`.
 *  Telegram silently drops deep-link payloads longer than 64 characters, so the
 *  `verify_` prefix plus this token must stay well under that limit
 *  (32 hex chars + 7 prefix = 39). A 128-bit value is ample for a 15-minute
 *  session token. */
export function generateTelegramVerifyToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashTelegramVerifyToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** 6-digit code shown to the user in Telegram. */
export function generateTelegramVerifyCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashTelegramVerifyCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/** Verification session (the /start link) lifetime. */
export function telegramVerifyExpiry(): Date {
  return new Date(Date.now() + 15 * 60 * 1000);
}

/** 6-digit code lifetime. */
export function telegramCodeExpiry(): Date {
  return new Date(Date.now() + 5 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// Telegram quick-login sessions
// ---------------------------------------------------------------------------

/** Opaque one-tap login payload embedded in `t.me/<bot>?start=quick_<id>`.
 *  Stays well under Telegram's 64-character deep-link limit. */
export function generateQuickLoginSessionId(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashQuickLoginSessionId(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}

/** Quick-login session lifetime. */
export function quickLoginSessionExpiry(): Date {
  return new Date(Date.now() + 10 * 60 * 1000);
}
