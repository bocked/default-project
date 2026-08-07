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

/** Stricter guard on mutating endpoints (create/upload). */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
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

/**
 * Guard on /api/auth/register + /api/auth/login. Credential endpoints are
 * cheap to hammer, so keep a tight per-IP window. The route mounts the
 * general apiLimiter too; this one is intentionally stricter.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip,
  ...standard,
  message: { error: "Too many requests" },
});
