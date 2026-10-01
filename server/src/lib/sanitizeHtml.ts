/**
 * Allowlist-based HTML sanitizer for admin-authored banner markup.
 *
 * Banner HTML is rendered with `dangerouslySetInnerHTML` on the public site and
 * in the admin preview, so any markup a sub-admin can persist executes inside a
 * SUPER_ADMIN session. Sanitising on the server is the control that actually
 * holds — client-side filtering can always be bypassed by calling the API
 * directly.
 *
 * The policy is deliberately narrow: inline styles and images are kept (the
 * banner editor relies on them), while script-bearing elements, event handlers,
 * and non-http(s) URLs are dropped.
 */

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

/** Attributes allowed on every allowed tag. */
const GLOBAL_ATTRS = new Set(["class", "style", "title", "dir", "lang"]);
/** Extra attributes allowed only on specific tags. */
const TAG_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height", "loading"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
};

/** Control characters and whitespace browsers ignore while parsing a scheme. */
// eslint-disable-next-line no-control-regex -- stripping these is the point: `java\tscript:` must be seen as `javascript:`
const IGNORED_IN_URL = /[\u0000-\u0020\u00a0\u1680\u2000-\u200f\u2028-\u202f\u205f\u3000\ufeff]/g;

function isSafeUrl(value: string): boolean {
  const cleaned = value.replace(IGNORED_IN_URL, "").toLowerCase();
  // Relative, fragment and protocol-relative URLs are safe by construction.
  if (
    cleaned === "" ||
    cleaned.startsWith("#") ||
    cleaned.startsWith("./") ||
    cleaned.startsWith("../")
  ) {
    return true;
  }
  if (cleaned.startsWith("//")) return false;
  if (cleaned.startsWith("/")) return true;
  return (
    cleaned.startsWith("http://") ||
    cleaned.startsWith("https://") ||
    cleaned.startsWith("mailto:") ||
    cleaned.startsWith("tel:")
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function codePoint(hexOrDec: string, radix: number): string {
  const n = parseInt(hexOrDec, radix);
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

/**
 * Decodes the numeric and named entities an attacker uses to hide a scheme
 * (`java&#115;cript:`, `javascript&colon;`). Invalid code points decode to an
 * empty string rather than throwing.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex: string) => codePoint(hex, 16))
    .replace(/&#(\d+);?/g, (_m, dec: string) => codePoint(dec, 10))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&amp;/gi, "&");
}

const TAG_OPEN = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>/g;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function sanitizeAttributes(tag: string, raw: string): string {
  const allowed = TAG_ATTRS[tag];
  const out: string[] = [];
  ATTR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ATTR.exec(raw)) !== null) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    // Event handlers (onclick, onerror, …) are the primary XSS vector.
    if (name.startsWith("on")) continue;
    if (!GLOBAL_ATTRS.has(name) && !allowed?.has(name)) continue;
    if ((name === "href" || name === "src") && !isSafeUrl(decodeEntities(value))) continue;
    if (name === "style") {
      const style = decodeEntities(value);
      // `style` is kept, but must not smuggle a url() or an expression().
      if (/url\s*\(|expression\s*\(|javascript:/i.test(style)) continue;
      out.push(`style="${escapeAttr(style)}"`);
      continue;
    }
    out.push(`${name}="${escapeAttr(value)}"`);
  }
  return out.length ? ` ${out.join(" ")}` : "";
}

function escapeText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Returns the input with any element outside {@link ALLOWED_TAGS} removed
 * (tag *and* contents for script/style-like containers, tag only for unknown
 * elements), unsafe attributes dropped, and disallowed URL schemes stripped.
 */
export function sanitizeHtml(input: unknown): string {
  if (typeof input !== "string") return "";

  // Remove dangerous containers first: dropping only the tag would leak the
  // code as visible text, and dropping only the contents would keep a live tag.
  const stripped = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(script|style|iframe|object|embed|noscript|template|svg|math|form|link|meta|base)\b[\s\S]*?<\/\1\s*>/gi,
      "",
    )
    .replace(/<(script|style|iframe|object|embed|noscript|template|svg|math|form|link|meta|base)\b[\s\S]*?>/gi, "");

  // Walk tag-by-tag instead of `replace(/</g, "&lt;")` at the end: a blanket
  // escape would also destroy the allowlisted tags rebuilt above. Only the text
  // *between* tags is escaped, so a half-written `<` cannot survive.
  let out = "";
  let cursor = 0;
  TAG_OPEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_OPEN.exec(stripped)) !== null) {
    out += escapeText(stripped.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const tag = match[1].toLowerCase();
    // Unknown tag: drop the tag itself, keep the inner text.
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (match[0].startsWith("</")) {
      out += `</${tag}>`;
      continue;
    }

    const selfClosing = /\/\s*>$/.test(match[0]) || tag === "br" || tag === "hr" || tag === "img";
    const attrs = sanitizeAttributes(tag, match[2]);

    if (tag === "a") {
      const href = /\shref="[^"]*"/.exec(attrs)?.[0];
      if (!href) {
        out += `<a${attrs}>`;
        continue;
      }
      // Force safe target/rel so a banner link cannot reach `window.opener` or
      // navigate the admin tab away.
      out += `<a${attrs.replace(href, "")}${href} target="_blank" rel="noopener noreferrer">`;
      continue;
    }
    out += `<${tag}${attrs}${selfClosing ? " /" : ""}>`;
  }
  return out + escapeText(stripped.slice(cursor));
}

/**
 * Validates a banner link. Only absolute http(s) URLs, site-relative paths and
 * `mailto:`/`tel:` are allowed; anything else (`javascript:`, `data:`,
 * protocol-relative, …) becomes an empty string.
 */
export function sanitizeUrl(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("//")) return "";
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  if (trimmed.startsWith(".") || !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    // No scheme at all -> a relative path, which cannot execute.
    return /\s/.test(trimmed) ? "" : trimmed;
  }
  return isSafeUrl(trimmed) ? trimmed : "";
}

const BANNER_HTML_KEY = /^banner\.[a-z]+\.html$/;
const BANNER_URL_KEY = /^banner\.[a-z]+\.(href|image)$/;

/**
 * The single source of truth for "which content keys are live markup/URLs".
 *
 * `banner.<slot>.html` is injected with `dangerouslySetInnerHTML`, and
 * `banner.<slot>.href` / `.image` end up in an anchor's `href` / an image's
 * `src`. Every other block is rendered as text and is passed through verbatim.
 *
 * Applied on both the write path (`PUT /api/admin/content/:key`) and the read
 * path (`GET /api/content`), so payloads persisted before this policy existed
 * are neutralised the moment they are served.
 */
export function sanitizeContentValue(key: string, value: unknown): string {
  if (typeof value !== "string") return "";
  if (BANNER_HTML_KEY.test(key)) return sanitizeHtml(value);
  if (BANNER_URL_KEY.test(key)) return sanitizeUrl(value);
  return value;
}