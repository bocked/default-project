import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { apiRouter } from "./routes/api.js";
import { adminRouter } from "./routes/admin.js";
import { authRouter } from "./routes/auth.js";
import { roomsRouter } from "./routes/rooms.js";
import { initSocket } from "./socket/index.js";
import { redis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { apiLimiter } from "./lib/rateLimit.js";
import { LOCAL_UPLOADS_DIR } from "./lib/storage.js";

function originAllowed(origin: string): boolean {
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

async function main(): Promise<void> {
  // DB connect is best-effort: the HTTP + socket layers stay up (read-only)
  // even when Postgres is unreachable, e.g. during local development.
  try {
    await prisma.$connect();
    logger.info("postgres connected");
  } catch (err) {
    logger.warn({ err }, "postgres unreachable, starting anyway");
  }
  await redis.connect();

  if (!process.env.JWT_SECRET) {
    logger.warn("JWT_SECRET is not set - using insecure development secret. Set it in production!");
  }
  if (process.env.NODE_ENV === "production" && config.adminPassword === "change-me") {
    logger.warn("ADMIN_PASSWORD is still the default value. Change it in production!");
  }

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

  // Behind a single reverse proxy (Render LB / Nginx). Enables correct req.ip
  // for rate limiting and logging.
  app.set("trust proxy", config.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger, autoLogging: config.logToConsole }));

  // Local upload fallback (R2 is used when configured)
  app.use("/uploads", express.static(LOCAL_UPLOADS_DIR));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", apiLimiter, apiRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/rooms", roomsRouter);
  app.use("/api/admin", adminRouter);

  // JSON error responses (multer file-size limits, JSON parse errors, ...)
  app.use(
    (err: Error & { statusCode?: number; status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err.statusCode ?? err.status ?? 500;
      const message = status >= 500 ? "Internal server error" : err.message;
      if (status >= 500) logger.error({ err }, "request failed");
      res.status(status).json({ error: message });
    }
  );

  initSocket(io);

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

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
