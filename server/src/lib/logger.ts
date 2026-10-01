import pino from "pino";
import { config } from "../config.js";

/**
 * Structured JSON logger. Log level is controlled via LOG_LEVEL
 * (defaults to "info"). Secrets must never be logged through this.
 *
 * `redact` is a first line of defence for the common shape of leak - a secret
 * sitting on a known field path. It cannot help when the secret is embedded in
 * a message or URL (which is how Telegram tokens and Prisma error messages
 * actually appear), so those call sites must additionally run the error through
 * `scrubError()` from `./redact.js`.
 */
export const logger = pino({
  level: config.logLevel,
  base: { service: "api-server" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "botToken",
      "approvalBotToken",
      "*.botToken",
      "*.approvalBotToken",
      "token",
      "*.token",
      "adminPassword",
      "password",
      "*.password",
      'req.headers.authorization',
      'req.headers["x-telegram-bot-api-secret-token"]',
      'headers.authorization',
      'headers["x-telegram-bot-api-secret-token"]',
    ],
    censor: "[redacted]",
  },
});
