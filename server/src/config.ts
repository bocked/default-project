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
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-jwt-secret-change-me",
  jwtExpiresInSeconds: num(process.env.JWT_EXPIRES_IN_SECONDS, 30 * 24 * 60 * 60),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${num(process.env.PORT, 4000)}`,
  maxUploadBytes: num(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
  logToConsole: bool(process.env.LOG_TO_CONSOLE, true),
  logLevel: process.env.LOG_LEVEL ?? "info",
  sentryDsn: process.env.SENTRY_DSN ?? "",
  sentryTracesSampleRate: num(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.1),
  // Number of trusted reverse-proxy hops (Render LB / Nginx).
  trustProxy: num(process.env.TRUST_PROXY, 1),
  r2: {
    accountId: process.env.R2_ACCOUNT_ID ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.R2_BUCKET ?? "uploads",
    publicUrl: process.env.R2_PUBLIC_URL ?? "",
  },
};
