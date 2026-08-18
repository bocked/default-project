import { startServer } from "./app.js";
import { logger } from "./lib/logger.js";
import { captureException } from "./lib/sentry.js";

// Catch unhandled rejections and exceptions so the process exits cleanly and
// the process manager / Render can restart it. Without these handlers a stray
// rejection keeps the process alive in a potentially broken state.
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  captureException(err, { stage: "uncaughtException" });
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  logger.fatal({ err }, "unhandled rejection");
  captureException(err, { stage: "unhandledRejection" });
  process.exit(1);
});

startServer().catch((err) => {
  logger.error({ err }, "fatal startup error");
  captureException(err, { stage: "startup" });
  process.exit(1);
});
