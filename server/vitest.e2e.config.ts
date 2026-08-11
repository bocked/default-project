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
    // is pinned so tests are deterministic regardless of what the developer's
    // local .env or shell exports.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      ADMIN_PASSWORD: "change-me",
      JWT_SECRET: "test-jwt-secret",
      APP_URL: "http://localhost:3000",
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_ADMIN_CHAT_ID: "899933314",
      TELEGRAM_WEBHOOK_SECRET: "test-webhook-secret",
      REDIS_URL: "",
      SENTRY_DSN: "",
    },
    fileParallelism: false,
    isolate: false,
  },
});
