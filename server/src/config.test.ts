import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

/**
 * Boot guards for secret-bearing configuration.
 *
 * `config.ts` throws FATAL at import time when a secret is missing/default/too
 * short in production. That is a deliberate fail-closed design — but it is also
 * the single most dangerous line in the codebase: a wrong guard bricks the API
 * on deploy, and a too-permissive guard ships a forgeable admin token. Both
 * directions are pinned here.
 *
 * dotenv is mocked to a no-op so the assertions depend only on the env this
 * test sets. The real server/.env on the developer's machine must not be able
 * to make a "must throw" case pass.
 */
vi.mock("dotenv", () => ({ default: { config: () => ({}) } }));

const ORIGINAL_ENV = { ...process.env };

/** A key long enough to satisfy the 32-char JWT / 12-char admin-password floors. */
const STRONG = "k7Qm2XvN8pL4wR6zT1yB3dF9hJ5sA0cE";

/** Re-imports config.ts from scratch under the supplied environment. */
async function loadConfig(env: Record<string, string | undefined>): Promise<void> {
  for (const key of ["NODE_ENV", "JWT_SECRET", "ADMIN_PASSWORD", "ADMIN_EMAILS", "SUPER_ADMIN_EMAILS", "DATABASE_URL"]) {
    delete process.env[key];
  }
  // Default to production: these are the guards under test, and forgetting to
  // pass NODE_ENV must not silently downgrade them to the dev branch.
  process.env.NODE_ENV = env.NODE_ENV ?? "production";
  for (const [key, value] of Object.entries(env)) {
    if (key === "NODE_ENV" || value === undefined) continue;
    process.env[key] = value;
  }
  vi.resetModules();
  await import("./config.js");
}

const VALID_BASE = {
  JWT_SECRET: STRONG,
  ADMIN_PASSWORD: STRONG,
  ADMIN_EMAILS: "ops@example.com",
  SUPER_ADMIN_EMAILS: "ops@example.com",
  DATABASE_URL: "postgresql://u:p@db:5432/app?schema=public",
};

describe("config: production secret guards", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("boots with strong, explicit secrets", async () => {
    await expect(loadConfig({ ...VALID_BASE, NODE_ENV: "production" })).resolves.toBeUndefined();
  });

  describe("JWT_SECRET", () => {
    it("refuses a secret shorter than 32 characters", async () => {
      // The literal-placeholder check alone would pass this value, yet a 6-char
      // signing key is brute-forceable — anyone could forge an admin token.
      await expect(loadConfig({ ...VALID_BASE, JWT_SECRET: "aB3x9z" })).rejects.toThrow(
        /JWT_SECRET is only 6 characters long/,
      );
    });

    it("refuses the documented insecure default", async () => {
      await expect(loadConfig({ ...VALID_BASE, JWT_SECRET: "dev-secret-change-me" })).rejects.toThrow(
        /JWT_SECRET is missing or still the insecure default/,
      );
    });

    it("refuses an unset secret", async () => {
      await expect(loadConfig({ ...VALID_BASE, JWT_SECRET: undefined })).rejects.toThrow(/JWT_SECRET/);
    });

    it("accepts a short secret outside production so local dev stays frictionless", async () => {
      await expect(
        loadConfig({ ...VALID_BASE, NODE_ENV: "development", JWT_SECRET: "short" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("ADMIN_PASSWORD", () => {
    it("refuses a password shorter than 12 characters", async () => {
      await expect(loadConfig({ ...VALID_BASE, ADMIN_PASSWORD: "admin" })).rejects.toThrow(
        /ADMIN_PASSWORD is only 5 characters long/,
      );
    });

    it("refuses the 'change-me' default", async () => {
      await expect(loadConfig({ ...VALID_BASE, ADMIN_PASSWORD: "change-me" })).rejects.toThrow(
        /ADMIN_PASSWORD is missing or still the insecure default/,
      );
    });
  });

  describe("admin identity lists", () => {
    // These pick WHO is an admin at login. Previously an unset value silently
    // fell back to a personal email address hardcoded in source.
    it("refuses an unset ADMIN_EMAILS in production", async () => {
      await expect(loadConfig({ ...VALID_BASE, ADMIN_EMAILS: undefined })).rejects.toThrow(
        /ADMIN_EMAILS is not set in production/,
      );
    });

    it("refuses an unset SUPER_ADMIN_EMAILS in production", async () => {
      await expect(loadConfig({ ...VALID_BASE, SUPER_ADMIN_EMAILS: undefined })).rejects.toThrow(
        /SUPER_ADMIN_EMAILS is not set in production/,
      );
    });

    it("treats a whitespace-only value as unset", async () => {
      await expect(loadConfig({ ...VALID_BASE, ADMIN_EMAILS: "   " })).rejects.toThrow(
        /ADMIN_EMAILS is not set in production/,
      );
    });

    it("tolerates unset lists outside production", async () => {
      await expect(
        loadConfig({
          ...VALID_BASE,
          NODE_ENV: "development",
          ADMIN_EMAILS: undefined,
          SUPER_ADMIN_EMAILS: undefined,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("DATABASE_URL", () => {
    it("refuses to fall back to the localhost dev DSN in production", async () => {
      // Falling back silently would point production at a local database and
      // look healthy while serving nothing real.
      await expect(loadConfig({ ...VALID_BASE, DATABASE_URL: undefined })).rejects.toThrow(/DATABASE_URL/);
    });
  });

  it("never leaks the secret value into the thrown message", async () => {
    const weak = "sup3rs3cr3t-but-long-enough-to-not-trip-length";
    await loadConfig({ ...VALID_BASE, ADMIN_EMAILS: undefined }).catch(() => undefined);
    try {
      await loadConfig({ ...VALID_BASE, JWT_SECRET: weak.slice(0, 8) });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).not.toContain(weak.slice(0, 8));
    }
  });
});