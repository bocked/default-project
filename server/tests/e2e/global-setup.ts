import { execSync } from "node:child_process";

/**
 * Vitest global setup for the E2E suite. Runs once in the main process:
 *  1. forces NODE_ENV=test (skips the in-memory HTTP rate limiters),
 *  2. requires TEST_DATABASE_URL and applies all Prisma migrations to it.
 */
export default function setup(): void {
  process.env.NODE_ENV = "test";
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error("TEST_DATABASE_URL is required to run E2E tests");
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
    cwd: process.cwd(),
  });
}
