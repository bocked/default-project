import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const config = {
  port: num(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://canvas:canvas@localhost:5432/canvas?schema=public",
  redisUrl: process.env.REDIS_URL ?? "",
  corsOrigins: (process.env.CORS_ORIGINS ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  adminPassword: process.env.ADMIN_PASSWORD ?? "change-me",
  // Emails whose accounts are granted the ADMIN role (on startup, register or login).
  adminEmails: (process.env.ADMIN_EMAILS ?? "mirabbostolqinjonov@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  // Optional comma-separated list of IPs allowed to reach /api/admin/*. When
  // empty, the admin API stays open to any authenticated admin.
  adminIpWhitelist: (process.env.ADMIN_IP_WHITELIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  logToConsole: bool(process.env.LOG_TO_CONSOLE, true),
  logLevel: process.env.LOG_LEVEL ?? "info",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  sentryTracesSampleRate: num(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
  // Number of trusted reverse-proxy hops (Render LB / Nginx).
  trustProxy: num(process.env.TRUST_PROXY, 1),

  // ------------------------------------------------------------------
  // Iqtibosim (auth, email verification, Telegram moderation)
  // ------------------------------------------------------------------
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  // Public frontend origin, used to build email verification links.
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  // Email verification token lifetime in hours.
  verificationTokenHours: num(process.env.VERIFICATION_TOKEN_HOURS, 24),

  // SMTP (nodemailer). Leave SMTP_HOST empty to fall back to a console
  // logger + in-memory transcript (dev/test mode).
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: num(process.env.SMTP_PORT, 587),
  smtpSecure: bool(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "Iqtibosim <noreply@yerlikoglon.uz>",
  // Brevo transactional HTTP API (preferred over SMTP: works from hosts whose
  // egress to Brevo SMTP is blocked, e.g. Render free tier). Leave empty to
  // fall back to nodemailer SMTP.
  brevoApiKey: process.env.BREVO_API_KEY ?? "",

  // Telegram moderation bot. Empty token disables outbound bot calls
  // (the webhook still processes incoming updates).
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAdminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID ?? "",
  // Secret shared with Telegram when registering the webhook
  // (`X-Telegram-Bot-Api-Secret-Token` header).
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  // Public HTTPS URL used by scripts/set-telegram-webhook.ts.
  telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? "",
};
