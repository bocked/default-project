/**
 * Best-effort client IP extraction. Works when the server is behind
 * Cloudflare (CF-Connecting-IP) or any reverse proxy (X-Forwarded-For).
 */
export function clientIp(headers: Record<string, string | string[] | undefined>): string {
  const cf = single(headers["cf-connecting-ip"]);
  if (cf) return cf;

  const forwarded = single(headers["x-forwarded-for"]);
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const real = single(headers["x-real-ip"]);
  if (real) return real;

  return "unknown";
}

function single(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  if (typeof value === "string") return value;
  return undefined;
}
