import { quoteMarks } from "@/lib/quoteStyles";
import type { Quote, QuoteCustomStyles } from "@/lib/types";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Canvas-safe stacks for the VIP custom style fonts (mirrors quoteStyles.ts). */
const FONT_STACKS: Record<NonNullable<QuoteCustomStyles["fontFamily"]>, string> = {
  serif: SERIF,
  sans: SANS,
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  calligraphic: "'Segoe Script', 'Brush Script MT', 'Comic Sans MS', cursive",
};

const BORDER_COLORS: Record<Exclude<NonNullable<QuoteCustomStyles["border"]>, "none">, string> = {
  gold: "#d4af37",
  silver: "#b6b8ba",
  neon: "#22d3ee",
};

const COLORS = {
  white: "#ffffff",
  border: "#e2e8f0",
  ink: "#0f172a",
  blue: "#2563eb",
  pillBg: "#f1f5f9",
  pillText: "#475569",
  watermark: "#94a3b8",
} as const;

/** Exclusive VIP canvas theme. Vs. the plain white card these use rich
 *  gradients, accent colours and premium serif stacks (with graceful system
 *  fallbacks) — all drawn with the Canvas 2D API, no external assets. */
export interface VipTheme {
  id: string;
  name: string;
  gradient: [string, string];
  border: string;
  textColor: string;
  accentColor: string;
  chipBg: string;
  chipText: string;
  watermarkColor: string;
  quoteFont: string;
}

export const VIP_THEMES: VipTheme[] = [
  {
    id: "midnight",
    name: "Midnight Indigo",
    gradient: ["#0f172a", "#1e1b4b"],
    border: "#334155",
    textColor: "#e2e8f0",
    accentColor: "#60a5fa",
    chipBg: "#334155",
    chipText: "#e2e8f0",
    watermarkColor: "#94a3b8",
    quoteFont: "'Playfair Display', Georgia, 'Times New Roman', serif",
  },
  {
    id: "royal",
    name: "Royal & Gold",
    gradient: ["#2e1065", "#581c87"],
    border: "#7c3aed",
    textColor: "#f5f3ff",
    accentColor: "#fbbf24",
    chipBg: "#4c1d95",
    chipText: "#fde68a",
    watermarkColor: "#c4b5fd",
    quoteFont: "Georgia, 'Times New Roman', serif",
  },
  {
    id: "emerald",
    name: "Emerald Depth",
    gradient: ["#064e3b", "#022c22"],
    border: "#065f46",
    textColor: "#d1fae5",
    accentColor: "#34d399",
    chipBg: "#065f46",
    chipText: "#d1fae5",
    watermarkColor: "#6ee7b7",
    quoteFont: "'Baskerville', 'Garamond', Georgia, serif",
  },
  {
    id: "ocean",
    name: "Ocean Night",
    gradient: ["#0c4a6e", "#082f49"],
    border: "#0e7490",
    textColor: "#e0f2fe",
    accentColor: "#38bdf8",
    chipBg: "#0e7490",
    chipText: "#e0f2fe",
    watermarkColor: "#7dd3fc",
    quoteFont: "'Playfair Display', Georgia, 'Times New Roman', serif",
  },
  {
    id: "charcoal",
    name: "Charcoal & Copper",
    gradient: ["#1c1917", "#292524"],
    border: "#44403c",
    textColor: "#fafaf9",
    accentColor: "#fb923c",
    chipBg: "#44403c",
    chipText: "#fed7aa",
    watermarkColor: "#d6d3d1",
    quoteFont: "'Baskerville', 'Garamond', Georgia, serif",
  },
  {
    id: "twilight",
    name: "Twilight Rose",
    gradient: ["#4c0519", "#1e1b4b"],
    border: "#9f1239",
    textColor: "#ffe4e6",
    accentColor: "#fb7185",
    chipBg: "#9f1239",
    chipText: "#ffe4e6",
    watermarkColor: "#fda4af",
    quoteFont: "Georgia, 'Times New Roman', serif",
  },
];

/** Deterministic per-quote VIP theme so the same quote always renders the same
 *  premium card while different quotes rotate through the exclusive set. */
export function pickVipTheme(quoteId: string): VipTheme {
  let hash = 0;
  for (let i = 0; i < quoteId.length; i++) {
    hash = (hash * 31 + quoteId.charCodeAt(i)) >>> 0;
  }
  return VIP_THEMES[hash % VIP_THEMES.length];
}

export interface QuoteImageOptions {
  /** An exclusive VIP theme (gradient background + premium fonts). */
  theme?: VipTheme;
  /** Replaces the yerlikoglon.uz wordmark with the user's own channel/handle. */
  watermark?: string;
}

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
 *
 * The VIP `quote.customStyles` (font, colour, alignment, border, quote marks,
 * texture, size) take precedence over the theme, so the downloaded PNG matches
 * the card the visitor composed in the quote form.
 */
export async function renderQuoteImage(quote: Quote, opts: QuoteImageOptions = {}): Promise<Blob> {
  const theme = opts.theme;
  const styles = quote.customStyles ?? null;
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = SIZE * scale;
  canvas.height = SIZE * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  ctx.scale(scale, scale);

  // Fonts are loaded from a font-face (next/font) at runtime; wait for the
  // active family so wrapText() measures the same stack the renderer paints.
  const quoteFont = () => (styles?.fontFamily ? FONT_STACKS[styles.fontFamily] : theme?.quoteFont ?? SERIF);
  const fontToLoad = styles?.fontFamily ? FONT_STACKS[styles.fontFamily] : theme?.quoteFont;
  if (fontToLoad && fontToLoad !== SERIF && typeof document !== "undefined" && "fonts" in document) {
    try {
      await (document as Document & { fonts?: FontFaceSet }).fonts?.load(`normal 26px ${fontToLoad}`);
    } catch {
      // keep going with the system fallback if the font is unavailable
    }
  }

  const watermark = opts.watermark?.trim() || "yerlikoglon.uz";

  // Palette: VIP themes swap the whole card look, everything else stays the
  // classic white card. Per-quote custom styles then override individual slots.
  const palette = theme
    ? {
        white: theme.gradient[0],
        border: theme.border,
        ink: theme.textColor,
        blue: theme.accentColor,
        pillBg: theme.chipBg,
        pillText: theme.chipText,
        watermark: theme.watermarkColor,
      }
    : { ...COLORS };
  if (styles?.textColor) palette.ink = styles.textColor;

  // Card fill: an explicit background wins, then the texture, then the theme
  // gradient, then the classic white card.
  let cardFill: string | CanvasGradient = palette.white;
  if (styles?.cardBg) cardFill = styles.cardBg;
  else if (styles?.texture === "paper") cardFill = "#fdfcf7";
  else if (styles?.texture === "glass") cardFill = "#ffffff";
  else if (theme) {
    const gradient = ctx.createLinearGradient(MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN);
    gradient.addColorStop(0, theme.gradient[0]);
    gradient.addColorStop(1, theme.gradient[1]);
    cardFill = gradient;
  }

  const hasCustomBorder = styles?.border != null && styles.border !== "none";
  const borderColor =
    styles?.border && styles.border !== "none" ? BORDER_COLORS[styles.border] : palette.border;
  const borderWidth = hasCustomBorder ? 2 : 1;

  const centerX = SIZE / 2;

  // Vertical layout.
  const topY = PAD + HEADER_H + GAP_HEADER_CHIP;
  const urlTop = SIZE - PAD - URL_LH;
  const middleHeight = urlTop - URL_GAP - topY;
  const quoteMaxHeight = middleHeight - CHIP_H - GAP_CHIP_QUOTE;

  // Pick the largest quote font whose wrapped lines fit, then spread short
  // quotes across the available height so the card stays balanced. An explicit
  // custom font-size tunes the preferred size (scaled to the 1080px card).
  const preferredSize = styles?.fontSize
    ? Math.max(20, Math.min(72, Math.round(styles.fontSize * 2.7)))
    : null;
  const sizeCandidates =
    preferredSize && !QUOTE_SIZES.includes(preferredSize)
      ? [preferredSize, ...QUOTE_SIZES.filter((s) => s < preferredSize)]
      : QUOTE_SIZES;
  let quoteFontSize = 20;
  let quoteLines: string[] = [];
  for (const size of sizeCandidates) {
    ctx.font = `normal ${size}px ${quoteFont()}`;
    const lines = wrapText(ctx, quote.text, CONTENT_W);
    if (lines.length * size * 1.5 <= quoteMaxHeight) {
      quoteFontSize = size;
      quoteLines = lines;
      break;
    }
  }
  if (quoteLines.length === 0) {
    quoteFontSize = 20;
    ctx.font = `normal ${quoteFontSize}px ${quoteFont()}`;
    quoteLines = wrapText(ctx, quote.text, CONTENT_W);
  }
  const baseLineHeight = quoteFontSize * 1.5;
  const spreadLineHeight = Math.min(quoteMaxHeight / quoteLines.length, quoteFontSize * 2);
  const quoteLineHeight = Math.max(baseLineHeight, spreadLineHeight);

  const groupHeight = CHIP_H + GAP_CHIP_QUOTE + quoteLines.length * quoteLineHeight;
  const groupTop = topY + Math.round((middleHeight - groupHeight) / 2);

  // Card shadow (only around the card; the canvas outside stays transparent).
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.18)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  roundedRect(ctx, MARGIN, MARGIN, CARD, CARD, RADIUS);
  ctx.fillStyle = cardFill;
  ctx.fill();
  ctx.restore();

  // Paper texture: faint ruled lines clipped to the card, only over the plain
  // paper background (an explicit cardBg overrides the texture).
  if (styles?.texture === "paper" && !styles.cardBg) {
    ctx.save();
    roundedRect(ctx, MARGIN, MARGIN, CARD, CARD, RADIUS);
    ctx.clip();
    ctx.strokeStyle = "rgba(59,130,246,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let py = MARGIN + 26; py < SIZE - MARGIN; py += 26) {
      ctx.moveTo(MARGIN, py);
      ctx.lineTo(SIZE - MARGIN, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Card border, in the custom colour (with a soft glow for neon) when set.
  ctx.save();
  if (hasCustomBorder && styles?.border === "neon") {
    ctx.shadowColor = "rgba(34,211,238,0.55)";
    ctx.shadowBlur = 16;
  }
  roundedRect(ctx, MARGIN + 0.5, MARGIN + 0.5, CARD - 1, CARD - 1, RADIUS);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  ctx.stroke();
  ctx.restore();

  // Brand row: quote-glyph box + "Iqtibosim" on the left.
  const headerMidY = PAD + HEADER_H / 2;
  roundedRect(ctx, PAD, PAD, HEADER_H, HEADER_H, 12);
  ctx.fillStyle = palette.blue;
  ctx.fill();
  ctx.font = BRAND_GLYPH_FONT;
  ctx.fillStyle = palette.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("\u201C", PAD + HEADER_H / 2, headerMidY + 1);

  ctx.font = BRAND_TEXT_FONT;
  ctx.fillStyle = palette.ink;
  ctx.textAlign = "left";
  ctx.fillText("Iqtibosim", PAD + HEADER_H + 14, headerMidY + 1);

  // Wordmark logo on the right: "yerlikoglon" + ".uz" (site brand always stays
  // the same; only the bottom footer is replaced by the VIP custom watermark).
  const logoMain = "yerlikoglon";
  const logoDot = ".uz";
  ctx.font = LOGO_DOT_FONT;
  const dotWidth = ctx.measureText(logoDot).width;
  const rightEdge = SIZE - PAD;
  ctx.font = LOGO_DOT_FONT;
  ctx.fillStyle = palette.watermark;
  ctx.textAlign = "right";
  ctx.fillText(logoDot, rightEdge, headerMidY + 1);
  ctx.font = LOGO_MAIN_FONT;
  ctx.fillStyle = palette.ink;
  ctx.fillText(logoMain, rightEdge - dotWidth - 1, headerMidY + 1);

  // Category chip, centered just above the quote.
  ctx.font = CHIP_FONT;
  const categoryText = quote.category.name;
  const chipWidth = ctx.measureText(categoryText).width + 44;
  roundedRect(ctx, centerX - chipWidth / 2, groupTop, chipWidth, CHIP_H, CHIP_H / 2);
  ctx.fillStyle = palette.pillBg;
  ctx.fill();
  ctx.fillStyle = palette.pillText;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(categoryText, centerX, groupTop + CHIP_H / 2);

  // Quote text with the configured alignment; accent quotation marks are drawn
  // inline on the first and last line (none when the style disables them).
  const alignment = styles?.alignment ?? "center";
  const [openMark, closeMark] = quoteMarks(styles);
  const quoteTop = groupTop + CHIP_H + GAP_CHIP_QUOTE;
  const contentRight = PAD + CONTENT_W;
  ctx.font = `normal ${quoteFontSize}px ${quoteFont()}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  let y = quoteTop;
  for (let i = 0; i < quoteLines.length; i++) {
    const line = quoteLines[i];
    const open = i === 0 ? openMark : "";
    const close = i === quoteLines.length - 1 ? closeMark : "";
    const openW = open ? ctx.measureText(open).width : 0;
    const closeW = close ? ctx.measureText(close).width : 0;
    const lineW = ctx.measureText(line).width;
    const blockW = openW + lineW + closeW;
    let x;
    if (alignment === "left") x = PAD;
    else if (alignment === "right") x = contentRight - blockW;
    else x = centerX - blockW / 2;
    if (open) {
      ctx.fillStyle = palette.blue;
      ctx.fillText(open, x, y);
      x += openW;
    }
    ctx.fillStyle = palette.ink;
    ctx.fillText(line, x, y);
    x += lineW;
    if (close) {
      ctx.fillStyle = palette.blue;
      ctx.fillText(close, x, y);
    }
    y += quoteLineHeight;
  }

  // Custom watermark (or the default domain), centered at the very bottom.
  ctx.font = URL_FONT;
  ctx.fillStyle = palette.watermark;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "1.5px";
  }
  ctx.fillText(watermark, centerX, urlTop);
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "0px";
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png");
  });
  return blob;
}
