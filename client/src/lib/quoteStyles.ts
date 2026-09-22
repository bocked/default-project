import type { CSSProperties } from "react";
import type { QuoteCustomStyles } from "@/lib/types";

const FONT_STACKS: Record<NonNullable<QuoteCustomStyles["fontFamily"]>, string> = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  mono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  calligraphic: "'Segoe Script', 'Brush Script MT', 'Comic Sans MS', cursive",
};

function fontStack(styles: QuoteCustomStyles | null | undefined): string {
  return styles?.fontFamily ? FONT_STACKS[styles.fontFamily] : FONT_STACKS.serif;
}

/** Card-level overrides: background/texture, border and glow shadow. */
export function quoteCardStyle(styles: QuoteCustomStyles | null | undefined): CSSProperties {
  const style: CSSProperties = {};
  if (styles?.cardBg) {
    style.background = styles.cardBg;
  } else if (styles?.texture === "paper") {
    style.background =
      "repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(59,130,246,0.08) 27px), #fdfcf7";
  } else if (styles?.texture === "glass") {
    style.background = "rgba(255,255,255,0.72)";
  }

  switch (styles?.border) {
    case "gold":
      style.borderColor = "#d4af37";
      style.boxShadow = "0 4px 22px -8px rgba(212,175,55,.6)";
      break;
    case "silver":
      style.borderColor = "#b6b8ba";
      style.boxShadow = "0 4px 22px -8px rgba(150,150,160,.5)";
      break;
    case "neon":
      style.borderColor = "#22d3ee";
      style.boxShadow = "0 0 16px -2px rgba(34,211,238,.55), 0 0 44px -10px rgba(217,70,239,.4)";
      break;
  }
  return style;
}

/** Text-level overrides for the quote body: font, size, colour, alignment. */
export function quoteTextStyle(styles: QuoteCustomStyles | null | undefined): CSSProperties {
  const style: CSSProperties = { fontFamily: fontStack(styles) };
  if (styles?.fontSize) style.fontSize = `${styles.fontSize}px`;
  if (styles?.textColor) style.color = styles.textColor;
  if (styles?.alignment) style.textAlign = styles.alignment;
  return style;
}

/** Opening/closing quote marks for the configured « », „ “ or classic style. */
export function quoteMarks(styles: QuoteCustomStyles | null | undefined): [string, string] {
  switch (styles?.quoteMark ?? "classic") {
    case "double":
      return ["\u00AB", "\u00BB"];
    case "single":
      return ["\u201E", "\u201C"];
    case "none":
      return ["", ""];
    default:
      return ["\u201C", "\u201D"];
  }
}