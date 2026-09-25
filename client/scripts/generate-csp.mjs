// Post-build step for the static export: writes out/_headers with a strict
// Content-Security-Policy per HTML page. Every inline script (RSC flight
// payload, theme boot script) gets an exact sha256 hash so script-src needs no
// 'unsafe-inline' / 'unsafe-eval' — required for a 100/100 ImmuniWeb and
// Mozilla Observatory score.
//
// Runs via the client build script: `next build && node scripts/generate-csp.mjs`.
// The file is regenerated on every build, so hashes always match the emitted
// HTML (Cloudflare Pages copies _headers from the out/ directory).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(clientRoot, "out");

// The API lives on a different host than the static site. It must appear
// explicitly in connect-src (no generic https:) or every browser API call
// would be blocked.
const API_ORIGIN =
  process.env.NEXT_PUBLIC_SERVER_URL ?? "https://yerlikoglon-backend.onrender.com";

const JS_TYPES = new Set([
  "",
  "text/javascript",
  "application/javascript",
  "module",
  "text/module",
]);

// Next 16 re-injects the beforeInteractive theme script (src/app/layout.tsx)
// as an inline <script> after hydration, so its hash must be allowed on top of
// the hashes of the scripts that already live in the static HTML. Read the
// authoring string straight out of layout.tsx so the hash stays in sync if the
// theme boot script ever changes.
function themeInitHash() {
  const layoutPath = join(clientRoot, "src", "app", "layout.tsx");
  const src = readFileSync(layoutPath, "utf8");
  const m = /const themeInit = `([^`]*)`;/.exec(src);
  if (!m) throw new Error("generate-csp: themeInit template literal not found in layout.tsx");
  return `'sha256-${sha256base64(m[1])}'`;
}
const THEME_HASH = themeInitHash();

function sha256base64(text) {
  return createHash("sha256").update(text, "utf8").digest("base64");
}

function listHtml(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listHtml(full));
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

// The browser hashes the raw text content of a classic inline script. Scripts
// with a src attribute and non-JavaScript types are ignored.
function inlineHashes(html) {
  const hashes = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] ?? "";
    const content = m[2] ?? "";
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = /type\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (typeMatch && !JS_TYPES.has(typeMatch[1].toLowerCase().trim())) continue;
    if (!content.trim()) continue;
    // The HTML parser normalises \r\n / \r to \n in the byte stream before the
    // script text is tokenised, so hash the same normalised text the browser
    // sees. Next emits LF-only, but this keeps hashes valid if an editor ever
    // rewrites the exported markup with CRLF.
    const normalised = content.replace(/\r\n?/g, "\n");
    hashes.push(`'sha256-${sha256base64(normalised)}'`);
  }
  return hashes;
}

function pagePaths(htmlFile) {
  const rel = join(htmlFile)
    .replace(outDir, "")
    .replace(/\\/g, "/")
    .replace(/^\//, "");
  const withoutExt = rel.replace(/\.html$/, "");
  if (withoutExt === "index") return ["/", "/index.html"];
  return [`/${withoutExt}`, `/${rel}`];
}

function cspFor(hashes) {
  const scriptSrc =
    hashes.length > 0
      ? `'self' ${hashes.join(" ")} ${THEME_HASH} https://telegram.org https://a.nel.cloudflare.com https://static.cloudflareinsights.com`
      : `'self' ${THEME_HASH} https://telegram.org https://a.nel.cloudflare.com https://static.cloudflareinsights.com`;
  return [
    `default-src 'self'`,
    `script-src ${scriptSrc}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `connect-src 'self' ${API_ORIGIN} wss: https://a.nel.cloudflare.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-src https://telegram.org https://t.me`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join("; ") + ";";
}

const base = [
  "/*",
  "  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
  "  X-Content-Type-Options: nosniff",
  "  X-Frame-Options: DENY",
  "  Referrer-Policy: strict-origin-when-cross-origin",
  "  Permissions-Policy: camera=(), microphone=(), geolocation=(), display-capture=(), payment=()",
  "  Cross-Origin-Opener-Policy: same-origin",
  "  Cross-Origin-Resource-Policy: same-origin",
  "  X-XSS-Protection: 1; mode=block",
  "",
  "/assets/*",
  "  Cache-Control: public, max-age=31536000, immutable",
  "",
  "/sw.js",
  "  Cache-Control: public, max-age=0, must-revalidate",
  "",
];

const pages = listHtml(outDir).map((file) => ({
  file,
  hashes: inlineHashes(readFileSync(file, "utf8")),
}));

const lines = [...base];
let ruleCount = 0;
for (const { file, hashes } of pages) {
  const csp = cspFor(hashes);
  for (const p of pagePaths(file)) {
    lines.push(p);
    lines.push(`  Content-Security-Policy: ${csp}`);
    lines.push("");
    ruleCount++;
  }
}

writeFileSync(join(outDir, "_headers"), lines.join("\n"), "utf8");
console.log(
  `generate-csp: ${pages.length} pages, ${ruleCount} path rules (API_ORIGIN=${API_ORIGIN})`,
);
for (const { file, hashes } of pages.slice(0, 3)) {
  console.log(`  ${file.split("out").pop()} -> ${hashes.length} sha256 hashes`);
}