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
import { categoriesRouter, tagsRouter } from "./routes/catalog.js";
import { telegramRouter } from "./routes/telegram.js";
import { initSocket } from "./socket/index.js";
import { redis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { apiLimiter, authLimiter } from "./lib/rateLimit.js";
import { tryEnsureDefaultCategories } from "./lib/categories.js";
import { initSentry, setupSentryErrorHandler, captureException } from "./lib/sentry.js";

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
  else callback(new Error("Origin not allowed by CORS"));
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

  // Behind a single reverse proxy (Render LB / Nginx). Enables correct req.ip
  // for rate limiting and logging.
  app.set("trust proxy", config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Telegram post widget: the script itself and its iframe both load
          // from telegram.org.
          "script-src": ["'self'", "https://telegram.org"],
          "frame-src": ["https://telegram.org"],
        },
      },
    })
  );
  app.use(cors({ origin: corsOrigin }));
  app.use(compression());
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
  app.use("/api/categories", categoriesRouter);
  app.use("/api/tags", tagsRouter);
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
      }
      res.status(status).json({ error: message });
    }
  );

  initSocket(io);

  return { app, server, io };
}

/** Grants the ADMIN role to every configured admin email. Best-effort. */
async function promoteAdminEmails(): Promise<void> {
  if (config.adminEmails.length === 0) return;
  const result = await prisma.user.updateMany({
    where: { email: { in: config.adminEmails } },
    data: { role: "ADMIN" },
  });
  if (result.count > 0) {
    logger.info(`granted ADMIN role to ${result.count} user(s)`);
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
    await promoteAdminEmails();
  } catch (err) {
    logger.warn({ err }, "postgres unreachable, starting anyway");
  }
  await redis.connect();

  if (process.env.NODE_ENV === "production" && config.adminPassword === "change-me") {
    logger.warn("ADMIN_PASSWORD is still the default value. Change it in production!");
  }

  const { server, io } = createApp();

  server.listen(config.port, () => {
    logger.info(`listening on http://localhost:${config.port}`);
  });

  const shutdown = async (): Promise<void> => {
    logger.info("shutting down");
    io.close();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
