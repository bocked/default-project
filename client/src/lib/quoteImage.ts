import type { Quote } from "@/lib/types";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const COLORS = {
  white: "#ffffff",
  border: "#e2e8f0",
  ink: "#0f172a",
  blue: "#2563eb",
  pillBg: "#f1f5f9",
  pillText: "#475569",
  watermark: "#94a3b8",
} as const;

// Square 1080x1080 share card. The card fills the canvas with a small margin,
// so there is no extra white space. Layout top to bottom: brand row (Iqtibosim
// on the left, yerlikoglon.uz wordmark logo on the right), category chip just
// above the centered quote text, and the domain at the very bottom center.
const SIZE = 1080;
const MARGIN = 48;
const CARD = SIZE - MARGIN * 2;
const RADIUS = 40;

const PAD = 72;
const CONTENT_W = CARD - PAD * 2;

const HEADER_H = 46;
const BRAND_GLYPH_FONT = `700 26px ${SERIF}`;
const BRAND_TEXT_FONT = `700 26px ${SERIF}`;
const LOGO_MAIN_FONT = `700 24px ${SANS}`;
const LOGO_DOT_FONT = `600 22px ${SANS}`;

const GAP_HEADER_CHIP = 48;
const CHIP_H = 44;
const CHIP_FONT = `600 18px ${SANS}`;
const GAP_CHIP_QUOTE = 26;

const URL_LH = 24;
const URL_FONT = `600 15px ${SANS}`;
const URL_GAP = 48;

const QUOTE_SIZES = [72, 68, 64, 60, 56, 52, 48, 44, 40, 36, 32, 28, 24, 22, 20];

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

/**
 * Renders the share image directly on a canvas with the Canvas 2D API. This
 * deliberately avoids DOM/HTML capture (html-to-image), which silently drops
 * page stylesheets and web fonts on many devices and produces a blank PNG.
 * Canvas text is rasterized from installed system fonts, so the output is
 * deterministic everywhere. Likes/views, author and hashtags are omitted.
 */
export async function renderQuoteImage(quote: Quote): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = SIZE * scale;
  canvas.height = SIZE * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  ctx.scale(scale, scale);

  const centerX = SIZE / 2;

  // Vertical layout.
  const topY = PAD + HEADER_H + GAP_HEADER_CHIP;
  const urlTop = SIZE - PAD - URL_LH;
  const middleHeight = urlTop - URL_GAP - topY;
  const quoteMaxHeight = middleHeight - CHIP_H - GAP_CHIP_QUOTE;

  // Pick the largest quote font whose wrapped lines fit, then spread short
  // quotes across the available height so the card stays balanced.
  let quoteFont = 20;
  let quoteLines: string[] = [];
  for (const size of QUOTE_SIZES) {
    ctx.font = `normal ${size}px ${SERIF}`;
    const lines = wrapText(ctx, quote.text, CONTENT_W);
    if (lines.length * size * 1.5 <= quoteMaxHeight) {
      quoteFont = size;
      quoteLines = lines;
      break;
    }
  }
  if (quoteLines.length === 0) {
    quoteFont = 20;
    ctx.font = `normal ${quoteFont}px ${SERIF}`;
    quoteLines = wrapText(ctx, quote.text, CONTENT_W);
  }
  const baseLineHeight = quoteFont * 1.5;
  const spreadLineHeight = Math.min(quoteMaxHeight / quoteLines.length, quoteFont * 2);
  const quoteLineHeight = Math.max(baseLineHeight, spreadLineHeight);

  const groupHeight = CHIP_H + GAP_CHIP_QUOTE + quoteLines.length * quoteLineHeight;
  const groupTop = topY + Math.round((middleHeight - groupHeight) / 2);

  // Card shadow (only around the card; the canvas outside stays transparent).
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, MARGIN, MARGIN, CARD, CARD, RADIUS);
  ctx.fillStyle = COLORS.white;
  ctx.fill();
  ctx.restore();

  roundedRect(ctx, MARGIN + 0.5, MARGIN + 0.5, CARD - 1, CARD - 1, RADIUS);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Brand row: quote-glyph box + "Iqtibosim" on the left.
  const headerMidY = PAD + HEADER_H / 2;
  roundedRect(ctx, PAD, PAD, HEADER_H, HEADER_H, 12);
  ctx.fillStyle = COLORS.blue;
  ctx.fill();
  ctx.font = BRAND_GLYPH_FONT;
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\u201C", PAD + HEADER_H / 2, headerMidY + 1);

  ctx.font = BRAND_TEXT_FONT;
  ctx.fillStyle = COLORS.ink;
  ctx.textAlign = "left";
  ctx.fillText("Iqtibosim", PAD + HEADER_H + 14, headerMidY + 1);

  // Wordmark logo on the right: "yerlikoglon" + ".uz".
  const logoMain = "yerlikoglon";
  const logoDot = ".uz";
  ctx.font = LOGO_DOT_FONT;
  const dotWidth = ctx.measureText(logoDot).width;
  const rightEdge = SIZE - PAD;
  ctx.font = LOGO_DOT_FONT;
  ctx.fillStyle = COLORS.watermark;
  ctx.textAlign = "right";
  ctx.fillText(logoDot, rightEdge, headerMidY + 1);
  ctx.font = LOGO_MAIN_FONT;
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(logoMain, rightEdge - dotWidth - 1, headerMidY + 1);

  // Category chip, centered just above the quote.
  ctx.font = CHIP_FONT;
  const categoryText = quote.category.name;
  const chipWidth = ctx.measureText(categoryText).width + 44;
  roundedRect(ctx, centerX - chipWidth / 2, groupTop, chipWidth, CHIP_H, CHIP_H / 2);
  ctx.fillStyle = COLORS.pillBg;
  ctx.fill();
  ctx.fillStyle = COLORS.pillText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(categoryText, centerX, groupTop + CHIP_H / 2);

  // Quote text, centered, blue quotation marks on the first and last line.
  const quoteTop = groupTop + CHIP_H + GAP_CHIP_QUOTE;
  ctx.font = `normal ${quoteFont}px ${SERIF}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let y = quoteTop;
  for (let i = 0; i < quoteLines.length; i++) {
    const line = quoteLines[i];
    const openWidth = i === 0 ? ctx.measureText("\u201C").width : 0;
    const closeWidth = i === quoteLines.length - 1 ? ctx.measureText("\u201D").width : 0;
    const total = ctx.measureText(line).width + openWidth + closeWidth;
    let x = centerX - total / 2;
    if (i === 0) {
      ctx.fillStyle = COLORS.blue;
      ctx.fillText("\u201C", x, y);
      x += openWidth;
    }
    ctx.fillStyle = COLORS.ink;
    ctx.fillText(line, x, y);
    x += ctx.measureText(line).width;
    if (i === quoteLines.length - 1) {
      ctx.fillStyle = COLORS.blue;
      ctx.fillText("\u201D", x, y);
    }
    y += quoteLineHeight;
  }

  // Domain, minimal, centered at the very bottom.
  ctx.font = URL_FONT;
  ctx.fillStyle = COLORS.watermark;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.5px";
  }
  ctx.fillText("yerlikoglon.uz", centerX, urlTop);
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png");
  });
  return blob;
}
