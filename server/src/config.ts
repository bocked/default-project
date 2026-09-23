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
  corsOrigins: (process.env.CORS_ORIGINS ?? "https://yerlikoglon.uz,https://*.yerlikoglon.uz")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  adminPassword: process.env.ADMIN_PASSWORD ?? "change-me",
  // Emails whose accounts are granted the ADMIN role (on startup, register or login).
  adminEmails: (process.env.ADMIN_EMAILS ?? "mirabbostolqinjonov@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  // Emails whose accounts get the SUPER_ADMIN role — the only role allowed to
  // manually verify users (bypass email/phone verification for posting) and to
  // permanently delete quotes. Can be extended/overridden via the
  // SUPER_ADMIN_EMAILS env var (comma-separated, later logins never demote).
  superAdminEmails: (process.env.SUPER_ADMIN_EMAILS ?? "mirabbostolqinjonov@gmail.com")
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
  // Terms of Use version users must accept. Bump whenever the /terms text is
  // updated: accounts with an older acceptedTermsVersion must re-consent on
  // their next login before they can use their profile.
  currentTermsVersion: (process.env.CURRENT_TERMS_VERSION ?? "1.1").trim(),
  // Email verification token lifetime in minutes (max 15 recommended).
  verificationTokenMinutes: num(process.env.VERIFICATION_TOKEN_MINUTES, 15),
  // 6-digit email OTP lifetime in minutes.
  emailOtpMinutes: num(process.env.EMAIL_OTP_MINUTES, 15),
  // Long-lived refresh token lifetime in days (rotating HttpOnly cookie).
  refreshTokenDays: num(process.env.REFRESH_TOKEN_DAYS, 30),

  // SMTP (nodemailer). Leave SMTP_HOST empty to fall back to a console
  // logger + in-memory transcript (dev/test mode). Gmail's email verification
  // OTPs use the credentials in .env (`SMTP_HOST=smtp.gmail.com`, port 465).
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: num(process.env.SMTP_PORT, 587),
  // Port 465 defaults to TLS (secure). SMTP_SECURE explicitly overrides it.
  smtpSecure: process.env.SMTP_SECURE !== undefined ? bool(process.env.SMTP_SECURE, false) : num(process.env.SMTP_PORT, 587) === 465,
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.EMAIL_FROM ?? process.env.SMTP_FROM ?? "yerlikoglon.uz <noreply@yerlikoglon.uz>",
  // Brevo transactional HTTP API (preferred over SMTP: works from hosts whose
  // egress to Brevo SMTP is blocked, e.g. Render free tier). Leave empty to
  // fall back to nodemailer SMTP.
  brevoApiKey: process.env.BREVO_API_KEY ?? "",

  // Telegram moderation bot. Empty token disables outbound bot calls
  // (the webhook still processes incoming updates).
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAdminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID ?? "",
  // Channel the bot posts approved quotes to (auto / manual "post to Telegram").
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID ?? "",
  // Public site URL used for the "read on site" button on channel posts.
  publicSiteUrl: process.env.SITE_URL?.replace(/\/+$/, "") ?? "https://yerlikoglon.uz",
  // Secret shared with Telegram when registering the webhook
  // (`X-Telegram-Bot-Api-Secret-Token` header).
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  // Public HTTPS URL used by scripts/set-telegram-webhook.ts.
  telegramWebhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? "",
};
