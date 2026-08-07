// Next.js 16 client instrumentation: runs before the app becomes interactive,
// so Sentry is registered before the first React render can throw. It is a
// no-op unless NEXT_PUBLIC_SENTRY_DSN is set at build time.
import { initSentry } from "./lib/sentry";

try {
  initSentry();
} catch {
  // Monitoring must never break the app.
}
