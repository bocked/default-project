import http from "node:http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { Server } from "socket.io";
import { config } from "./config.js";
import { apiRouter } from "./routes/api.js";
import { adminRouter } from "./routes/admin.js";
import { initSocket } from "./socket/index.js";
import { redis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";
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
    console.info("[db] postgres connected");
  } catch (err) {
    console.warn("[db] postgres unreachable, starting anyway:", err);
  }
  await redis.connect();

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

  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: "1mb" }));
  if (config.logToConsole) app.use(morgan(config.isDev ? "dev" : "combined"));

  // Local upload fallback (R2 is used when configured)
  app.use("/uploads", express.static(LOCAL_UPLOADS_DIR));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api", apiRouter);
  app.use("/api/admin", adminRouter);

  initSocket(io);

  server.listen(config.port, () => {
    console.info(`[server] listening on http://localhost:${config.port}`);
  });

  const shutdown = async (): Promise<void> => {
    console.info("[server] shutting down");
    io.close();
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[server] fatal startup error", err);
  process.exit(1);
});
