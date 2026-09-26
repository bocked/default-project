import rateLimit from "express-rate-limit";

const standard = { standardHeaders: "draft-7", legacyHeaders: false } as const;

// Disable the in-memory limiters while running the E2E suite (NODE_ENV=test)
// so fast, repeated requests from the same CI/local IP are not throttled.
// Set FORCE_RATE_LIMITS=1 (e.g. in a specific rate-limit e2e file) to opt
// back in and actually exercise the 429 behaviour. Never expose the escape
// hatch in production.
const skip = (): boolean => process.env.NODE_ENV === "test" && process.env.FORCE_RATE_LIMITS !== "1";

/** General guard on every /api request. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
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

/**
 * Guard on public auth / register endpoints — max 10 requests per 15 minutes
 * per IP, so a throttling attacker cannot enumerate accounts or spam OTP /
 * password-reset emails. The tighter authBruteLimiter below still applies on
 * the credential endpoints (login/register & co.) as a second layer.
 */
export const authPublicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});

/** Tight per-IP guard on credential endpoints (register / login /
 *  resend-verification / forgot-password / reset-password) — max 5 attempts
 *  per 15 minutes so a throttling attacker cannot enumerate accounts or brute
 *  force a password/OTP. */
export const authBruteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
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

/** Guard on POST /api/uploads (per IP per hour) so an authenticated client
 *  cannot flood the disk with image uploads. */
export const uploadsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});

/** Guard on POST /api/quotes/analyze (per IP per hour) so the optional AI
 *  assist and the dictionary scans cannot be hammered by scrapers. */
export const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});

/** Guard on collection mutations (create/update/delete/add-quote) — per IP
 *  per 15 min, so a bot cannot flood collections with bookmarks. */
export const collectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});
