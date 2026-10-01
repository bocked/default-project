/**
 * URL allowlist for admin-authored banner links and image sources.
 *
 * The server already validates these on write and on read
 * (`server/src/lib/sanitizeHtml.ts`). This client-side check is defence in depth:
 * it protects against a stale cached value, an older API build, or a banner
 * payload that was persisted before the server-side policy existed.
 */

// Stripping these is the point: `java\tscript:` must be seen as `javascript:`.
const IGNORED = /[\u0000-\u0020\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]/g;

/** True when the URL cannot execute script when placed in `href`/`src`. */
export function isSafeBannerUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  const cleaned = value.replace(IGNORED, "").toLowerCase();
  if (!cleaned) return false;
  // Relative paths and fragments cannot execute.
  if (cleaned.startsWith("#") || cleaned.startsWith("./") || cleaned.startsWith("../")) return true;
  if (cleaned.startsWith("/")) return !cleaned.startsWith("//");
  return (
    cleaned.startsWith("http://") ||
    cleaned.startsWith("https://") ||
    cleaned.startsWith("mailto:") ||
    cleaned.startsWith("tel:")
  );
}

/** Returns the URL when it is safe to use, otherwise an empty string. */
export function safeBannerUrl(value: string | undefined | null): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return isSafeBannerUrl(trimmed) ? trimmed : "";
}