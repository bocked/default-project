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
