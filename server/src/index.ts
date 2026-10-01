import { startServer } from "./app.js";
import { logger } from "./lib/logger.js";
import { captureException } from "./lib/sentry.js";

// A truly unrecoverable state (corrupt heap, broken invariant) is fatal: log,
// report, and let PM2 restart the process.
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  captureException(err, { stage: "uncaughtException" });
  process.exit(1);
});
// A rejected promise is usually a *transient* failure — a Prisma timeout, a
// dropped Postgres connection, a rate-limited third-party API. Killing the whole
// API for one of those turns a brief blip into a full outage, so the rejection
// is reported (log + Sentry + admin alert) and the process keeps serving.
// Route handlers funnel their rejections into the Express error middleware via
// `asyncHandler`, so this is now only the last-resort net for detached promises.
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "unhandled rejection (not fatal)");
  captureException(err, { stage: "unhandledRejection" });
});

startServer().catch((err) => {
  logger.error({ err }, "fatal startup error");
  captureException(err, { stage: "startup" });
  process.exit(1);
});
