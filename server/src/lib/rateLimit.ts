import rateLimit from "express-rate-limit";

const standard = { standardHeaders: "draft-7", legacyHeaders: false } as const;

/** General guard on every /api request. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  ...standard,
  message: { error: "Too many requests" },
});

/** Stricter guard on mutating endpoints (create/upload). */
export const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  ...standard,
  message: { error: "Too many requests" },
});

/** Guard on /api/admin (brute-force protection for the shared password). */
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  ...standard,
  message: { error: "Too many requests" },
});
