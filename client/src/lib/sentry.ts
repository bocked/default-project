import * as Sentry from "@sentry/browser";

// Client-side Sentry is active only when NEXT_PUBLIC_SENTRY_DSN is baked in at
// build time (Cloudflare Pages / CI). Without it this is a no-op.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN as string | undefined;

export const sentryEnabled = Boolean(dsn);

export function initSentry(): void {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV === "production" ? "production" : "development",
    tracesSampleRate: 0.1,
    // The app is a single long-lived SPA; only report the very first
    // page-load transaction to keep trace volume low.
    integrations: [Sentry.browserTracingIntegration()],
    tracePropagationTargets: [/^https:\/\//],
  });
}

export function captureException(err: unknown, extra?: Record<string, unknown>): void {
  if (!sentryEnabled) return;
  Sentry.captureException(err, extra ? { extra } : undefined);
}
