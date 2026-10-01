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
    //
    // ADMIN_EMAILS / SUPER_ADMIN_EMAILS must be pinned too, and for a stronger
    // reason than determinism: config.ts deliberately has NO hardcoded admin
    // email fallback any more (a personal gmail address in source is both a
    // secret-ish leak and a production footgun). With the fallback gone these
    // lists are empty unless the environment supplies them, so every test that
    // registers or logs in as the root admin would silently come back as USER
    // and fail with 403. This address is the root admin identity the suite uses;
    // it is test data, not a real credential.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      ADMIN_PASSWORD: "change-me",
      ADMIN_EMAILS: "mirabbostolqinjonov@gmail.com",
      SUPER_ADMIN_EMAILS: "mirabbostolqinjonov@gmail.com",
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
