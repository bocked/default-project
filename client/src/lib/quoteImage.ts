import type { Quote } from "@/lib/types";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const COLORS = {
  white: "#ffffff",
  border: "#e2e8f0",
  ink: "#0f172a",
  blue: "#2563eb",
  author: "#1e293b",
  tag: "#2563eb",
  pillBg: "#f1f5f9",
  pillText: "#475569",
  divider: "#f1f5f9",
  watermark: "#94a3b8",
} as const;

const WIDTH = 640;
const PAD = 40;
const MAX_TEXT_WIDTH = WIDTH - PAD * 2;
const RADIUS = 24;

const BRAND_SIZE = 36;
const BRAND_FONT = `700 18px ${SERIF}`;
const BRAND_GLYPH_FONT = `700 24px ${SERIF}`;
const QUOTE_FONT = `normal 26px ${SERIF}`;
const QUOTE_LINE_HEIGHT = 42;
const AUTHOR_FONT = `600 16px ${SANS}`;
const TAG_FONT = `500 14px ${SANS}`;
const CAT_FONT = `500 14px ${SANS}`;
const WATERMARK_FONT = `600 12px ${SANS}`;

const AUTHOR_LINE_HEIGHT = 22;
const AUTHOR_TAG_GAP = 8;
const TAG_LINE_HEIGHT = 20;
const TAG_ROW_GAP = 4;
const PILL_HEIGHT = 30;
const WATERMARK_LINE_HEIGHT = 16;

const GAP_BRAND_QUOTE = 28;
const GAP_QUOTE_FOOTER = 32;
const GAP_FOOTER_DIVIDER = 32;
const GAP_DIVIDER_WATERMARK = 16;

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Wraps text to a pixel width, splitting words and long words by characters. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = [];
  for (const raw of text.split("\n")) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      result.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      let remaining = word;
      while (ctx.measureText(remaining).width > maxWidth) {
        let lo = 1;
        let hi = remaining.length;
        let best = 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (ctx.measureText(remaining.slice(0, mid)).width <= maxWidth) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        const chunk = remaining.slice(0, best);
        remaining = remaining.slice(best);
        const test = line ? `${line} ${chunk}` : chunk;
        if (ctx.measureText(test).width > maxWidth && line) {
          result.push(line);
          line = chunk;
        } else {
          line = test;
        }
      }
      const test = line ? `${line} ${remaining}` : remaining;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) result.push(line);
        line = remaining;
      }
    }
    result.push(line);
  }
  return result.length > 0 ? result : [""];
}

/** Lays the "#tag" strings out into rows that fit the available width. */
function tagRows(ctx: CanvasRenderingContext2D, tags: string[], maxWidth: number): string[] {
  const rows: string[] = [];
  let row = "";
  for (const tag of tags) {
    const test = row ? `${row}  ${tag}` : tag;
    if (ctx.measureText(test).width <= maxWidth) {
      row = test;
    } else {
      if (row) rows.push(row);
      row = tag;
    }
  }
  if (row) rows.push(row);
  return rows;
}

/**
 * Renders the share image directly on a canvas with the Canvas 2D API. This
 * deliberately avoids DOM/HTML capture (html-to-image): capturing live DOM to
 * an SVG <foreignObject> silently drops page stylesheets (Tailwind v4 oklch
 * variables) and web fonts on many devices, producing a blank white PNG.
 * Canvas text is rasterized from installed system fonts, so the output is
 * deterministic everywhere. Likes/views are intentionally omitted.
 */
export async function renderQuoteImage(quote: Quote): Promise<Blob> {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) throw new Error("Canvas 2D not supported");

  probe.font = QUOTE_FONT;
  const quoteLines = wrapText(probe, quote.text, MAX_TEXT_WIDTH);
  const tagTexts = quote.tags.map((tag) => `#${tag.name}`);
  probe.font = TAG_FONT;
  const tagLines = tagRows(probe, tagTexts, MAX_TEXT_WIDTH);

  probe.font = CAT_FONT;
  const categoryText = quote.category.name;
  const pillWidth = probe.measureText(categoryText).width + 24;

  const authorBlockHeight =
    AUTHOR_LINE_HEIGHT + AUTHOR_TAG_GAP + Math.max(0, tagLines.length - 1) * TAG_ROW_GAP + tagLines.length * TAG_LINE_HEIGHT;
  const footerHeight = Math.max(authorBlockHeight, PILL_HEIGHT);

  const quoteHeight = quoteLines.length * QUOTE_LINE_HEIGHT;
  const height =
    PAD +
    BRAND_SIZE +
    GAP_BRAND_QUOTE +
    quoteHeight +
    GAP_QUOTE_FOOTER +
    footerHeight +
    GAP_FOOTER_DIVIDER +
    1 +
    GAP_DIVIDER_WATERMARK +
    WATERMARK_LINE_HEIGHT +
    PAD;

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = WIDTH * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  ctx.scale(scale, scale);

  roundedRect(ctx, 0.5, 0.5, WIDTH - 1, height - 1, RADIUS);
  ctx.fillStyle = COLORS.white;
  ctx.fill();
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  let y = PAD;

  // Brand row: blue rounded square with a serif quotation glyph + "Iqtibosim".
  roundedRect(ctx, PAD, y, BRAND_SIZE, BRAND_SIZE, 10);
  ctx.fillStyle = COLORS.blue;
  ctx.fill();
  ctx.font = BRAND_GLYPH_FONT;
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\u201C", PAD + BRAND_SIZE / 2, y + BRAND_SIZE / 2 + 1);

  ctx.font = BRAND_FONT;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = "left";
  ctx.fillText("Iqtibosim", PAD + BRAND_SIZE + 12, y + BRAND_SIZE / 2 + 1);

  y += BRAND_SIZE + GAP_BRAND_QUOTE;

  // Quote text, blue quotation marks on the first and last line.
  ctx.font = QUOTE_FONT;
  ctx.textBaseline = "top";
  for (let i = 0; i < quoteLines.length; i++) {
    const line = quoteLines[i];
    let x = PAD;
    if (i === 0) {
      ctx.fillStyle = COLORS.blue;
      ctx.fillText("\u201C", x, y);
      x += ctx.measureText("\u201C").width;
    }
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(line, x, y);
    x += ctx.measureText(line).width;
    if (i === quoteLines.length - 1) {
      ctx.fillStyle = COLORS.blue;
      ctx.fillText("\u201D", x, y);
    }
    y += QUOTE_LINE_HEIGHT;
  }

  y += GAP_QUOTE_FOOTER;

  // Footer: author + tags on the left, category pill on the right.
  ctx.textBaseline = "top";
  ctx.font = AUTHOR_FONT;
  ctx.fillStyle = COLORS.author;
  ctx.fillText(quote.displayAuthor, PAD, y);

  if (tagLines.length > 0) {
    let tagY = y + AUTHOR_LINE_HEIGHT + AUTHOR_TAG_GAP;
    ctx.font = TAG_FONT;
    ctx.fillStyle = COLORS.tag;
    for (const row of tagLines) {
      ctx.fillText(row, PAD, tagY);
      tagY += TAG_LINE_HEIGHT + TAG_ROW_GAP;
    }
  }

  const pillX = WIDTH - PAD - pillWidth;
  roundedRect(ctx, pillX, y, pillWidth, PILL_HEIGHT, 999);
  ctx.fillStyle = COLORS.pillBg;
  ctx.fill();
  ctx.font = CAT_FONT;
  ctx.fillStyle = COLORS.pillText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(categoryText, pillX + pillWidth / 2, y + PILL_HEIGHT / 2);

  y += footerHeight + GAP_FOOTER_DIVIDER;

  // Divider.
  ctx.strokeStyle = COLORS.divider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(WIDTH - PAD, y);
  ctx.stroke();

  y += GAP_DIVIDER_WATERMARK;

  // Watermark.
  ctx.textBaseline = "top";
  ctx.font = WATERMARK_FONT;
  ctx.fillStyle = COLORS.watermark;
  ctx.textAlign = "right";
  ctx.fillText("yerlikoglon.uz", WIDTH - PAD, y);
  ctx.textAlign = "left";

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png");
  });
  return blob;
}
