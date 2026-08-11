import pino from "pino";
import { config } from "../config.js";

/**
 * Structured JSON logger. Log level is controlled via LOG_LEVEL
 * (defaults to "info"). Secrets must never be logged through this.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: "api-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
