// Generates client/public/og-image.png — the 1200x630 social share card.
//
// WHY A GENERATOR INSTEAD OF A HAND-DRAWN PNG: the card has to match the site's
// palette and stay in sync with the wordmark. Committing a binary blob means it
// silently goes stale; regenerating is one command.
//
// WHY sharp: the client package has no image dependency (and we do not want to
// add one just for a build asset). The server already depends on sharp, so this
// dev-time script borrows it. It is NOT part of `npm run build` — the PNG is
// committed to public/, so Cloudflare Pages never needs sharp.
//
// Usage (from repo root):
//   node client/scripts/generate-og-image.mjs
//
// Text is rendered through librsvg's fontconfig. If the host has no usable
// fonts the glyphs may be dropped, which is why the design also carries
// vector-only elements (quote mark, rules) and is verified by pixel sampling.

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = dirname(here);
const outPath = join(clientRoot, "public", "og-image.png");

// Resolve sharp from the server workspace (this script is not a client dep).
const require = createRequire(import.meta.url);
let sharp;
for (const candidate of ["sharp", "../../server/node_modules/sharp"]) {
  try {
    sharp = require(candidate);
    break;
  } catch {
    /* try next */
  }
}
if (!sharp) {
  console.error("generate-og-image: sharp not found. Run `npm install` in server/ first.");
  process.exit(1);
}

const W = 1200;
const H = 630;

// Palette mirrors globals.css: brand blue on a deep slate field.
const BG_TOP = "#0f172a";
const BG_BOTTOM = "#1e293b";
const BRAND = "#3b82f6";
const TEXT = "#f8fafc";
const MUTED = "#94a3b8";

// Decorative quote glyph drawn as vector paths only, so the card still reads as
// an Iqtibosim card even if the host has no fonts for the <text> elements.
const QUOTE_PATHS = `
    <g fill="${BRAND}" opacity="0.22" transform="translate(96,150) scale(9)">
      <path d="M0 24 L0 0 L14 0 L14 24 L7 24 L7 8 L0 8 Z"/>
      <path d="M22 24 L22 0 L36 0 L36 24 L29 24 L29 8 L22 8 Z"/>
      <path d="M0 34 C0 27 4 23 11 22 L14 22 L14 28 C9 29 7 31 7 34 Z"/>
      <path d="M22 34 C22 27 26 23 33 22 L36 22 L36 28 C31 29 29 31 29 34 Z"/>
    </g>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BG_TOP}"/>
      <stop offset="100%" stop-color="${BG_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${BRAND}"/>
      <stop offset="100%" stop-color="#22d3ee"/>
    </linearGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${W}" height="6" fill="url(#accent)"/>
  ${QUOTE_PATHS}

  <text x="96" y="360" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
        font-size="76" font-weight="700" fill="${TEXT}" letter-spacing="-1">Iqtibosim</text>

  <text x="96" y="424" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
        font-size="31" fill="${MUTED}">Fikrlarni to'playdigan iqtiboslar to'plami</text>

  <rect x="96" y="474" width="132" height="5" rx="2.5" fill="url(#accent)"/>

  <text x="96" y="546" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
        font-size="25" fill="${MUTED}">www.yerlikoglon.uz</text>
</svg>`;

mkdirSync(dirname(outPath), { recursive: true });

const png = await sharp(Buffer.from(svg, "utf8"), { density: 96 })
  .resize(W, H, { fit: "cover" })
  .png({ compressionLevel: 9 })
  .toBuffer();

writeFileSync(outPath, png);

// Cheap sanity checks: a blank or failed render has near-zero channel variance
// and compresses to almost nothing.
const { channels, entropy } = await sharp(png).stats();
const mean = channels[0].mean;
const stdev = channels[0].stdev;
console.log(`generate-og-image: wrote ${outPath}`);
console.log(
  `  ${W}x${H}  ${(png.length / 1024).toFixed(1)} KB  mean=${mean.toFixed(1)}  stdev=${stdev.toFixed(1)}  entropy=${entropy.toFixed(3)}`,
);
if (png.length < 5000 || stdev < 3) {
  console.error("  WARNING: render looks blank — the SVG probably did not rasterize.");
  process.exit(1);
}