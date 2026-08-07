import * as Sentry from "@sentry/node";
import type { ErrorRequestHandler } from "express";
import { config } from "../config.js";

// Sentry is active only when SENTRY_DSN is configured (production). Locally it
// is a no-op so development does not depend on a Sentry account.
export const sentryEnabled = Boolean(config.sentryDsn);

export function initSentry(): void {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.nodeEnv,
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: config.sentryTracesSampleRate,
    // expressIntegration() instruments Express requests + attaches request
    // context to transactions (replaces the old Handlers.requestHandler()).
    integrations: [Sentry.expressIntegration()],
  });
}

// Registers Sentry's Express error handler. Must be mounted BEFORE the final
// JSON error handler so every 5xx is captured before the client gets a reply.
export function setupSentryErrorHandler(app: {
  use: (middleware: ErrorRequestHandler) => unknown;
}): void {
  if (!sentryEnabled) return;
  Sentry.setupExpressErrorHandler(app);
}

export function captureException(err: unknown, extra?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  Sentry.captureException(err, extra ? { extra } : undefined);
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info"): void {
  if (!sentryEnabled) return;
  Sentry.captureMessage(message, level);
}
