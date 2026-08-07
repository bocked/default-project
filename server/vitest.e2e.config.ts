import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    globalSetup: ["tests/e2e/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // NODE_ENV=test disables the in-memory HTTP rate limiters; ADMIN_PASSWORD
    // and JWT_SECRET are pinned so tests are deterministic regardless of what
    // the developer's local .env or shell exports.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      ADMIN_PASSWORD: "change-me",
      JWT_SECRET: "e2e-test-secret",
      REDIS_URL: "",
      R2_ACCOUNT_ID: "",
      R2_ACCESS_KEY_ID: "",
      R2_SECRET_ACCESS_KEY: "",
      R2_BUCKET: "",
      R2_PUBLIC_URL: "",
      SENTRY_DSN: "",
    },
    fileParallelism: false,
    isolate: false,
  },
});
