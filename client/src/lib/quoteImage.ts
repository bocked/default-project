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

// Square 1080x1080 card: fills the canvas with a small margin, so the output
// is tight (no extra white) and social-ready (square ratio). Only the quote
// text, the category chip and the yerlikoglon.uz logo are drawn.
const SIZE = 1080;
const MARGIN = 48;
const CARD = SIZE - MARGIN * 2;
const RADIUS = 40;

const PAD_X = 88;
const PAD_Y_TOP = 96;
const PAD_Y_BOTTOM = 88;
const CONTENT_W = CARD - PAD_X * 2;

const CHIP_H = 56;
const CHIP_FONT = `600 20px ${SANS}`;
const LOGO_H = 30;
const LOGO_FONT = `600 16px ${SANS}`;
const GAP_QUOTE_CHIP = 44;
const GAP_CHIP_LOGO = 30;

const QUOTE_REGION = CARD - PAD_Y_TOP - PAD_Y_BOTTOM - CHIP_H - LOGO_H - GAP_QUOTE_CHIP - GAP_CHIP_LOGO;
const QUOTE_SIZES = [56, 52, 48, 44, 40, 36, 32, 28, 24, 22, 20];

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

  // Pick the largest quote font whose wrapped lines fit the quote region.
  let quoteFont = 20;
  let quoteLines: string[] = [];
  for (const size of QUOTE_SIZES) {
    ctx.font = `normal ${size}px ${SERIF}`;
    const lines = wrapText(ctx, quote.text, CONTENT_W);
    if (lines.length * size * 1.5 <= QUOTE_REGION) {
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
  const quoteLineHeight = quoteFont * 1.5;

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

  const centerX = SIZE / 2;

  // Quote text, centered, blue quotation marks on the first and last line.
  const quoteHeight = quoteLines.length * quoteLineHeight;
  const quoteY = PAD_Y_TOP + Math.round((QUOTE_REGION - quoteHeight) / 2);
  ctx.font = `normal ${quoteFont}px ${SERIF}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let y = quoteY;
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

  // Category chip, centered below the quote.
  const chipY = PAD_Y_TOP + QUOTE_REGION + GAP_QUOTE_CHIP;
  ctx.font = CHIP_FONT;
  const categoryText = quote.category.name;
  const chipWidth = ctx.measureText(categoryText).width + 48;
  roundedRect(ctx, centerX - chipWidth / 2, chipY, chipWidth, CHIP_H, CHIP_H / 2);
  ctx.fillStyle = COLORS.pillBg;
  ctx.fill();
  ctx.fillStyle = COLORS.pillText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(categoryText, centerX, chipY + CHIP_H / 2);

  // yerlikoglon.uz logo, centered at the bottom.
  const logoY = chipY + CHIP_H + GAP_CHIP_LOGO;
  ctx.font = LOGO_FONT;
  ctx.fillStyle = COLORS.watermark;
  ctx.textBaseline = "top";
  ctx.fillText("yerlikoglon.uz", centerX, logoY);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png");
  });
  return blob;
}
