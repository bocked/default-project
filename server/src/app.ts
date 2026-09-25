import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { pinoHttp } from "pino-http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { config } from "./config.js";
import { apiRouter } from "./routes/api.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { quotesRouter } from "./routes/quotes.js";
import { quizzesRouter } from "./routes/quizzes.js";
import { policiesRouter } from "./routes/policies.js";
import { usersRouter } from "./routes/users.js";
import { categoriesRouter, tagsRouter } from "./routes/catalog.js";
import { contentRouter } from "./routes/content.js";
import { siteRouter } from "./routes/site.js";
import { telegramRouter } from "./routes/telegram.js";
import { resendWebhookRouter } from "./routes/resendWebhook.js";
import { initSocket } from "./socket/index.js";
import { redis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import { flushAnalyticsToDb } from "./lib/analytics.js";
import { verifySmtpAtStartup, verifyResendAtStartup, emailMode } from "./lib/email.js";
import { logger } from "./lib/logger.js";
import { apiLimiter, authLimiter } from "./lib/rateLimit.js";
import { tryEnsureDefaultCategories } from "./lib/categories.js";
import { tryEnsureDefaultContent } from "./lib/content.js";
import { tryEnsurePolicyBaseline, tryEnsurePolicyDrafts } from "./lib/policies.js";
import { syncBuiltInFeatures } from "./lib/permissionRegistry.js";
import { ensureTelegramSettings, reinitBot } from "./lib/telegramSettings.js";
import { notifyServerError, startHealthMonitor } from "./lib/healthMonitor.js";
import { initSentry, setupSentryErrorHandler, captureException } from "./lib/sentry.js";

/** Masks secrets for the startup log while still confirming they were set. */
function maskSecret(value: string, visible = 2): string {
  if (value.length <= visible * 2) return "*".repeat(value.length);
  return `${value.slice(0, visible)}${"*".repeat(value.length - visible * 2)}${value.slice(-visible)}`;
}

export function originAllowed(origin: string): boolean {
  const origins = config.corsOrigins;
  if (origins.includes("*")) return true;
  return origins.some((o) => {
    if (o.startsWith("https://*.")) {
      const suffix = o.slice("https://*.".length);
      return origin === `https://${suffix}` || origin.endsWith(`.${suffix}`);
    }
    return o === origin;
  });
}

function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void): void {
  if (!origin || originAllowed(origin)) callback(null, true);
  else callback(new Error("CORS policy violation: Access Denied"));
}

export interface CreateAppOptions {
  /** pino-http request logging. Tests usually turn it off. */
  autoLogging?: boolean;
  /** Skip the in-memory HTTP rate limiters (used by the E2E test suite). */
  noRateLimits?: boolean;
}

/**
 * Builds the Express app + HTTP server + Socket.IO server without binding a
 * port or starting background loops, so tests can mount it on an ephemeral
 * port. Production wiring (DB connect, Redis, shutdown) lives in startServer().
 */
export function createApp(options: CreateAppOptions = {}): { app: express.Express; server: http.Server; io: Server } {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
      credentials: false,
    },
    maxHttpBufferSize: 1_000_000,
  });

  // Redis adapter enables cross-instance broadcasts. When Redis is unavailable
  // we fall back to a single-instance in-memory adapter so the server still
  // works locally.
  if (redis.available) {
    try {
      const pub = redis.client!.duplicate();
      const sub = redis.client!.duplicate();
      io.adapter(createAdapter(pub, sub));
      logger.info("socket.io using redis adapter");
    } catch (err) {
      logger.warn({ err }, "redis adapter init failed, using in-memory adapter");
    }
  }

  // Behind a single reverse proxy (Cloudflare proxy / Nginx). Enables correct req.ip
  // for rate limiting and logging.
  app.set("trust proxy", config.trustProxy);

  // OWASP hardning: never leak the Express engine marker.
  app.disable("x-powered-by");

  // Strict CSP without 'unsafe-eval' (ImmuniWeb rejects it). The explicit
  // directive list replaces Helmet's defaults entirely. telegram.org is kept
  // because the Telegram post widget loads its script and iframe from there —
  // every other source must already be covered by 'self' / the allow-list.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Strict: no 'unsafe-inline' / 'unsafe-eval' — only first-party
          // scripts plus the Cloudflare NEL/analytics endpoints (Mozilla
          // Observatory / ImmuniWeb deduct points for unsafe script sources).
          scriptSrc: ["'self'", "https://a.nel.cloudflare.com", "https://static.cloudflareinsights.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
          connectSrc: ["'self'", "https://a.nel.cloudflare.com", "wss:"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          // This API is not meant to be embedded anywhere. 0-blocks framing to
          // prevent clickjacking against the authenticated admin endpoints.
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      crossOriginResourcePolicy: { policy: "same-origin" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      xContentTypeOptions: true,
      xDnsPrefetchControl: { allow: false },
      xFrameOptions: { action: "deny" },
    })
  );

  // Strict CORS allow-list (info-reading requests from unknown origins are
  // denied). Credentials are required for the HttpOnly refresh cookie, so CORS
  // must echo the exact origin instead of "*".
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
    })
  );

  // Cookie hardening: every Set-Cookie inherits HttpOnly + root path (and, by
  // default, Secure + SameSite=Strict) unless a route explicitly opts out.
  // auth.ts overrides sameSite/secure for the cross-site refresh cookie, which
  // must stay SameSite=None in production because the API host differs from the
  // frontend host.
  app.use((_req, res, next) => {
    const original = res.cookie.bind(res) as (
      name: string,
      value: unknown,
      options?: unknown,
    ) => typeof res;
    res.cookie = ((name: string, value: unknown, options: Record<string, unknown> = {}) =>
      original(name, value, {
        httpOnly: true,
        path: "/",
        secure: true,
        sameSite: "strict",
        ...options,
      })) as unknown as typeof res.cookie;
    next();
  });

  // Never let scanner probes or curious visitors read dotfiles or Prisma
  // artifacts off the public API (ImmuniWeb / OWASP: files like .env, .git and
  // prisma/schema.prisma must resolve to 404/403).
  app.use((req, res, next) => {
    const blocked = /(^|\/)\.(env|git)([/?#]|$)|(^|\/)\.npmrc([/?#]|$)|(^|\/)prisma\//;
    if (blocked.test(req.path)) {
      return res.status(404).json({ error: "Not found" });
    }
    next();
  });

  app.use(compression());
  // Resend delivery webhook must consume the raw body BEFORE express.json()
  // parses it, because the Svix HMAC covers the exact bytes as received.
  app.use("/api/webhooks", resendWebhookRouter);
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger, autoLogging: options.autoLogging ?? config.logToConsole }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  const useApiLimiter = options.noRateLimits ? [] : [apiLimiter];
  app.use("/api", ...useApiLimiter, apiRouter);
  if (useApiLimiter.length) {
    app.use("/api/auth", authLimiter, authRouter);
  } else {
    app.use("/api/auth", authRouter);
  }
  app.use("/api/quotes", quotesRouter);
  app.use("/api/quizzes", quizzesRouter);
  app.use("/api/policies", policiesRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/tags", tagsRouter);
  app.use("/api/content", contentRouter);
  app.use("/api", siteRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/telegram", telegramRouter);

  // Sentry error handler first (captures), then the JSON responder below.
  setupSentryErrorHandler(app);

  // JSON error responses (JSON parse errors, rate-limit rejections, ...)
  app.use(
    (err: Error & { statusCode?: number; status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.statusCode ?? err.status ?? 500;
      const message = status >= 500 ? "Internal server error" : err.message;
      if (status >= 500) {
        logger.error({ err }, "request failed");
        captureException(err, { status });
        // Push a Server-500 alert to the Super Admin's Telegram chat (rate
        // limited) whenever the notifyHealth toggle is enabled.
        notifyServerError(err, _req);
      }
      res.status(status).json({ error: message });
    }
  );

  initSocket(io);

  return { app, server, io };
}

/** Grants the ADMIN role to every configured admin email, then the SUPER_ADMIN
 *  role to configured super-admin emails (run last so SUPER_ADMIN wins when an
 *  email is listed in both). Both promotions only touch accounts without a
 *  manual roleOverride, so a revoked admin status stays revoked. Super-admins
 *  are additionally force-verified (emailVerified + emailVerifiedAt) and given
 *  lifetime VIP (isPremium) — owner perks are kept even for a demoted owner.
 *  Best-effort + idempotent. */
async function promoteAdminEmails(): Promise<void> {
  if (config.adminEmails.length === 0 && config.superAdminEmails.length === 0) return;
  if (config.adminEmails.length > 0) {
    const admins = await prisma.user.updateMany({
      where: { email: { in: config.adminEmails }, roleOverride: null },
      data: { role: "ADMIN" },
    });
    if (admins.count > 0) {
      logger.info(`granted ADMIN role to ${admins.count} user(s)`);
    }
  }
  if (config.superAdminEmails.length > 0) {
    const supers = await prisma.user.updateMany({
      where: { email: { in: config.superAdminEmails }, roleOverride: null },
      data: { role: "SUPER_ADMIN" },
    });
    if (supers.count > 0) {
      logger.info(`granted SUPER_ADMIN role to ${supers.count} user(s)`);
    }
    const perks = await prisma.user.updateMany({
      where: { email: { in: config.superAdminEmails } },
      data: { emailVerified: true, emailVerifiedAt: new Date(), isPremium: true },
    });
    if (perks.count > 0) {
      logger.info(`auto-verified SUPER_ADMIN account(s): ${perks.count} (emailVerified + VIP granted)`);
    }
  }
}

/** Production entry point: connects infra, listens, wires graceful shutdown. */
export async function startServer(): Promise<void> {
  // Sentry must be initialised before anything else so errors are captured
  // from the very first request. It is a no-op without SENTRY_DSN.
  initSentry();

  // DB connect is best-effort: the HTTP + socket layers stay up even when
  // Postgres is unreachable, e.g. during local development.
  try {
    await prisma.$connect();
    logger.info("postgres connected");
    await tryEnsureDefaultCategories();
    await tryEnsureDefaultContent();
    await tryEnsurePolicyBaseline();
    await tryEnsurePolicyDrafts();
    await syncBuiltInFeatures();
    await promoteAdminEmails();
    // Seed the Telegram settings row from .env once; after an admin edits the
    // panel the DB is the source of truth. Refresh the bot status in the
    // background so the dashboard shows it without waiting for a manual check.
    await ensureTelegramSettings();
    void reinitBot().catch(() => {
      /* best-effort status refresh */
    });
  } catch (err) {
    logger.warn({ err }, "postgres unreachable, starting anyway");
  }
  await redis.connect();

  if (process.env.NODE_ENV === "production" && config.adminPassword === "change-me") {
    logger.warn("ADMIN_PASSWORD is still the default value. Change it in production!");
  }

  // Startup sanity check: confirm the email provider was loaded from .env.
  // Secrets are masked so they never reach the logs — only that they were set.
  logger.info(
    {
      emailMode: emailMode(),
      smtpConfigured: config.smtpConfigured,
      smtpHost: config.smtpHost || "(not set)",
      resendApiKey: config.resendApiKey ? maskSecret(config.resendApiKey) : "(not set)",
      sendFrom: config.sendFrom,
    },
    "email env loaded",
  );

  // Live provider probe: a wrong key, revoked App Password or unreachable relay
  // must surface at boot ("✅ SMTP tayyor!" / "❌ SMTP Ulanishda XATOLIK: ...")
  // rather than on the first user's send-otp click. Fire-and-forget, never
  // blocks boot.
  if (emailMode() === "smtp") {
    void verifySmtpAtStartup();
  } else {
    void verifyResendAtStartup();
  }

  const { server, io } = createApp();

  // Fold Redis/memory visitor counters into the DailyStat table every 5 minutes.
  // Page views themselves stay Redis-only, so the DB is never hit per request.
  const analyticsFlushTimer = setInterval(() => {
    void flushAnalyticsToDb();
  }, 5 * 60 * 1000);

  // Periodic disk-usage check with Telegram alert (notifyHealth-gated).
  startHealthMonitor();

  server.listen(config.port, () => {
    logger.info(`listening on http://localhost:${config.port}`);
  });

  const shutdown = async (): Promise<void> => {
    logger.info("shutting down");
    clearInterval(analyticsFlushTimer);
    await flushAnalyticsToDb();
    io.close();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
