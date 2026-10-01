import { config } from "../config.js";

/**
 * True when the browser Origin may be reflected in Access-Control-Allow-Origin.
 * Wildcard entries like "https://*.yerlikoglon.uz" match the bare domain and
 * every subdomain. The literal "*" (never used by default) allows everything,
 * which is only acceptable for credential-free public endpoints.
 */
export function originAllowed(origin: string): boolean {
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

/**
 * Whether the given Origin (or absence of one) should be served with the
 * Access-Control-Allow-Origin header.
 *
 * Requests without an Origin header (mobile apps, server-side rendering,
 * server-to-server calls, Telegram Bot webhooks) are never blocked. A literal
 * "null" origin (file:// pages, sandboxed iframes, some privacy tools /
 * extensions) falls into the same branch instead of failing.
 *
 * On a deny the caller omits the header entirely: the browser blocks the
 * response client-side. A CORS rejection must never become a server-side 500,
 * which is what happens when a callback error is forwarded to the Express
 * error handler.
 */
export function corsOriginDecision(origin: string | undefined): boolean {
  if (!origin || origin === "null") return true;
  return originAllowed(origin);
}