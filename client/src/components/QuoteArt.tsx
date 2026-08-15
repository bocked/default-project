import type { Quote } from "@/lib/types";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * The artwork rendered for the share/download image. It is styled entirely
 * with inline styles (no Tailwind classes) and system font stacks so that
 * html-to-image captures it deterministically: page stylesheets (Tailwind v4
 * oklch variables, @property/@layer rules) and web fonts (@font-face) are not
 * available inside the SVG foreignObject that html-to-image renders into, and
 * relying on them produces a blank white image. Deliberately contains no
 * likes/views counters and always uses the light palette.
 */
export function QuoteArt({ quote }: { quote: Quote }) {
  return (
    <div style={{ width: 640, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 24, padding: 40, boxSizing: "border-box", color: "#0f172a", fontFamily: SANS }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: "#2563eb",
            color: "#ffffff",
            fontFamily: SERIF,
            fontSize: 24,
            fontWeight: 700,
            lineHeight: 1,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
          }}
        >
          &ldquo;
        </span>
        <span style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, letterSpacing: 0.5, color: "#0f172a" }}>Iqtibosim</span>
      </div>

      <div style={{ marginTop: 28, fontFamily: SERIF, fontSize: 26, lineHeight: 1.55, color: "#0f172a", whiteSpace: "pre-wrap" }}>
        <span style={{ color: "#2563eb" }}>&ldquo;</span>
        {quote.text}
        <span style={{ color: "#2563eb" }}>&rdquo;</span>
      </div>

      <div style={{ marginTop: 32, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1e293b" }}>{quote.displayAuthor}</div>
          {quote.tags.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
              {quote.tags.map((tag) => (
                <span key={tag.id} style={{ fontSize: 14, fontWeight: 500, color: "#2563eb" }}>
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <span style={{ flexShrink: 0, background: "#f1f5f9", borderRadius: 999, padding: "6px 12px", fontSize: 14, fontWeight: 500, color: "#475569", whiteSpace: "nowrap" }}>
          {quote.category.name}
        </span>
      </div>

      <div style={{ marginTop: 32, borderTop: "1px solid #f1f5f9", paddingTop: 16, textAlign: "right" }}>
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, color: "#94a3b8" }}>yerlikoglon.uz</span>
      </div>
    </div>
  );
}
