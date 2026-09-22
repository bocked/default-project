import rateLimit from "express-rate-limit";

const standard = { standardHeaders: "draft-7", legacyHeaders: false } as const;

// Disable the in-memory limiters while running the E2E suite (NODE_ENV=test)
// so fast, repeated requests from the same CI/local IP are not throttled.
const skip = (): boolean => process.env.NODE_ENV === "test";

/** General guard on every /api request. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});

/** Guard on /api/admin (brute-force protection for the shared password). */
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});

/** Guard on /api/auth (brute-force protection for login/register). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});

/** Skip when a trusted role (admin/super admin) is posting, so quote
 *  creation is never throttled for them. Runs after requireAuth. */
const quoteSkip = (req: import("express").Request): boolean =>
  process.env.NODE_ENV === "test" || req.user?.role === "ADMIN" || req.user?.role === "SUPER_ADMIN";

/** Guard on quote creation (per hour, per IP). Trusted roles are exempt. */
export const quoteCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  skip: quoteSkip,
  ...standard,
  message: { error: "Too many requests" },
});

/** Guard on quote like/unlike (per hour, per IP) so botnets or aggressive
 *  automation cannot mass-like quotes. Likes themselves stay unique per user. */
export const likeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 120,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});

/** Guard on the quote feed / search endpoints (per IP per 15 min) so scrapers
 *  and aggressive polling cannot hammer the database with list queries. */
export const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});
