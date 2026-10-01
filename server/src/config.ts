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

/**
 * Loads a secret-like env var and refuses to boot with an insecure default in
 * production. A missing or still-default ADMIN_PASSWORD / JWT_SECRET is a
 * critical vulnerability: the process dies FATAL so it can never run with a
 * guessable key. Dev/test keeps the fallback so local runs stay frictionless.
 *
 * `minLength` additionally rejects a secret that is set but too short to be
 * unguessable. Rejecting only the literal placeholder is not enough — a real
 * deployment left with `JWT_SECRET=a` passes that check yet lets anyone forge an
 * admin token, because the signing key is the whole security boundary.
 */
function required(
  value: string | undefined,
  name: string,
  insecureDefaults: string[],
  minLength = 0,
): string {
  if (value && !insecureDefaults.includes(value)) {
    if (minLength > 0 && value.length < minLength) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          `[FATAL] ${name} is only ${value.length} characters long (minimum ${minLength}). ` +
            `A short ${name} is guessable, so the server refuses to start. ` +
            `Generate one with: openssl rand -base64 ${Math.ceil((minLength * 3) / 4)}`,
        );
      }
    } else {
      return value;
    }
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[FATAL] ${name} is missing or still the insecure default "${insecureDefaults[0]}" in production. ` +
        `Set a strong ${name} in the environment and restart the server.`,
    );
  }
  return value ?? insecureDefaults[0];
}

/**
 * Comma-separated identity list (ADMIN_EMAILS / SUPER_ADMIN_EMAILS).
 *
 * These decide WHO gets admin rights at signup/login, so an unset value in
 * production must never quietly fall back to a developer's personal address
 * committed in source. Production therefore fails FATAL unless the list is
 * explicitly provided — set ADMIN_EMAILS/SUPER_ADMIN_EMAILS in server/.env.
 */
function requiredList(value: string | undefined, name: string, devFallback: string): string[] {
  const parsed = (value ?? devFallback)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (process.env.NODE_ENV === "production" && !value?.trim()) {
    throw new Error(
      `[FATAL] ${name} is not set in production. This list decides which accounts ` +
        `are granted admin rights at login, so it must be configured explicitly ` +
        `(comma-separated emails) rather than defaulting. Restart after setting it.`,
    );
  }
  return parsed;
}

/**
 * Resolved once, before the `config` object literal, because two fields derive
 * from it (the SUPER_ADMIN_EMAILS list itself and the Resend sandbox
 * recipient). Hoisting avoids reading `config.superAdminEmails` from inside the
 * object literal that defines `config`, which would hit the temporal dead zone.
 */
const superAdminEmails = requiredList(process.env.SUPER_ADMIN_EMAILS, "SUPER_ADMIN_EMAILS", "");

export const config = {
  port: num(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") !== "production",
  databaseUrl: required(
    process.env.DATABASE_URL,
    "DATABASE_URL",
    ["postgresql://canvas:canvas@localhost:5432/canvas?schema=public"],
  ),
  redisUrl: process.env.REDIS_URL ?? "",
  // Strict CORS allow-list (defaults to the production origins; the wildcard
  // "*" must never be used). Comma-separated env value overrides this.
  corsOrigins: (
    process.env.CORS_ORIGINS ??
    "https://yerlikoglon.uz,https://www.yerlikoglon.uz,http://localhost:3000"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  adminPassword: required(process.env.ADMIN_PASSWORD, "ADMIN_PASSWORD", ["change-me"], 12),
  // Emails whose accounts are granted the ADMIN role (on startup, register or login).
  // Must be set explicitly in production — see requiredList() for why.
  adminEmails: requiredList(process.env.ADMIN_EMAILS, "ADMIN_EMAILS", ""),
  // Emails whose accounts get the SUPER_ADMIN role — the only role allowed to
  // manually verify users (bypass email/phone verification for posting) and to
  // permanently delete quotes. Can be extended/overridden via the
  // SUPER_ADMIN_EMAILS env var (comma-separated, later logins never demote).
  superAdminEmails,
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
  // Number of trusted reverse-proxy hops (Cloudflare proxy / Nginx).
  trustProxy: num(process.env.TRUST_PROXY, 1),

  // ------------------------------------------------------------------
  // Iqtibosim (auth, email verification, Telegram moderation)
  // ------------------------------------------------------------------
  // 32 chars is the practical floor for an HMAC-SHA256 signing key: anything
  // shorter is brute-forceable, and JWT_SECRET is what makes an admin token
  // unforgeable.
  jwtSecret: required(process.env.JWT_SECRET, "JWT_SECRET", ["dev-secret-change-me"], 32),
  // Public frontend origin, used to build email verification links.
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  // Terms of Use version users must accept. Bump whenever the /terms text is
  // updated: accounts with an older acceptedTermsVersion must re-consent on
  // their next login before they can use their profile.
  currentTermsVersion: (process.env.CURRENT_TERMS_VERSION ?? "1.1").trim(),
  // Email verification token lifetime in minutes (max 15 recommended).
  verificationTokenMinutes: num(process.env.VERIFICATION_TOKEN_MINUTES, 15),
  // 6-digit email OTP lifetime in minutes (kept short so a leaked code cannot
  // be redeemed much later, and so admin-revealed codes stay relevant).
  emailOtpMinutes: num(process.env.EMAIL_OTP_MINUTES, 10),
  // Long-lived refresh token lifetime in days (rotating HttpOnly cookie).
  refreshTokenDays: num(process.env.REFRESH_TOKEN_DAYS, 30),

  // Resend transactional email API (replaces the legacy SMTP/Brevo paths).
  // Leave RESEND_API_KEY empty to fall back to a console logger + in-memory
  // transcript (dev/test mode — no real mail is delivered).
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  // Verified sender. no-reply@yerlikoglon.uz is the project's own domain,
  // verified in Resend — production deliveries use it (override via EMAIL_FROM).
  sendFrom: process.env.EMAIL_FROM ?? "yerlikoglon.uz <no-reply@yerlikoglon.uz>",
  // Resend sandbox mode: until a custom domain is verified, Resend only accepts
  // mail to the account owner. Restricted because an "unverified domain" is far
  // too easy to hit at runtime; the app answers with a clear "Test rejimida
  // faqat administrator emailiga xat yuboriladi" instead of a confusing 5xx.
  // Auto-detected from a @resend.dev sender, or forced via RESEND_SANDBOX=1.
  resendSandbox:
    process.env.RESEND_SANDBOX !== undefined
      ? bool(process.env.RESEND_SANDBOX, false)
      : (process.env.EMAIL_FROM ?? "").includes("@resend.dev"),
  // The only recipient allowed while sandboxed. Defaults to the first
  // SUPER_ADMIN_EMAILS entry (already validated as set in production) so the
  // project owner can always receive a test send; override with RESEND_SANDBOX_TO.
  resendSandboxTo:
    (process.env.RESEND_SANDBOX_TO ?? "").trim().toLowerCase() || superAdminEmails[0] || "",
  // Resend webhook signing secret (issued by Resend when a webhook endpoint is
  // created). Required by /api/webhooks/resend so delivery events can only be
  // written by Resend itself.
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",

  // SMTP (nodemailer) transactional email — preferred over Resend when set.
  // Works with any SMTP relay, e.g. Gmail using an App Password:
  //   SMTP_HOST="smtp.gmail.com" SMTP_PORT=587 SMTP_SECURE=false
  // Leave SMTP_HOST empty to keep Resend / the offline transcript fallback.
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: num(process.env.SMTP_PORT, 587),
  smtpSecure: bool(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  // True when a real SMTP transport should back sendEmail().
  smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_PASS),

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

  // Image uploads (profile avatars, etc.): converted to WebP on the server.
  // Directory is created on boot; it stays out of git (see .gitignore).
  uploadDir: process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads"),
  // Absolute public base URL prepended to the returned file paths so clients
  // can always embed /uploads/... URLs. Defaults to the production API origin.
  uploadsPublicBase: process.env.UPLOADS_PUBLIC_BASE?.replace(/\/+$/, "") ?? "https://api.yerlikoglon.uz",
  // Hard cap on every uploaded file body (bytes). Multer rejects bigger files
  // with LIMIT_FILE_SIZE before they are decoded.
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024),
  // Largest edge (px) the decoded image may keep; larger images are scaled
  // down with `withoutEnlargement` so small files are never upscaled.
  maxUploadDimension: Number(process.env.MAX_UPLOAD_DIMENSION ?? 1280),

  // Optional AI assist for the quote analyzer (auto-tagging + language hints).
  // When empty, /api/quotes/analyze runs in its deterministic offline mode
  // only. When set, the rule-based result is enhanced by an OpenAI-compatible
  // /chat/completions endpoint; any AI failure falls back to the offline mode.
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiBaseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  aiModel: process.env.AI_MODEL ?? "gpt-4o-mini",
};
