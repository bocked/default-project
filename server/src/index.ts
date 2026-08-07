import { startServer } from "./app.js";
import { logger } from "./lib/logger.js";
import { captureException } from "./lib/sentry.js";

startServer().catch((err) => {
  logger.error({ err }, "fatal startup error");
  captureException(err, { stage: "startup" });
  process.exit(1);
});
