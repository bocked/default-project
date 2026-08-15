import type { Quote } from "@/lib/types";

/**
 * Static artwork rendered off-screen and captured to PNG. Deliberately
 * contains no likes/views counters and always uses the light palette, so the
 * generated image looks identical regardless of the site's theme. The
 * "yerlikoglon.uz" watermark appears bottom-right as branding.
 */
export function QuoteArt({ quote }: { quote: Quote }) {
  return (
    <div className="w-[640px] rounded-3xl border border-slate-200 bg-white p-10 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 font-serif text-xl font-bold text-white">
          &ldquo;
        </span>
        <span className="font-serif text-lg font-bold tracking-wide text-slate-900">Iqtibosim</span>
      </div>

      <blockquote className="mt-7 font-serif text-[26px] leading-relaxed text-slate-900">
        <span className="text-blue-600">&ldquo;</span>
        {quote.text}
        <span className="text-blue-600">&rdquo;</span>
      </blockquote>

      <div className="mt-8 flex items-end justify-between gap-4">
        <div>
          <div className="text-base font-semibold text-slate-800">{quote.displayAuthor}</div>
          {quote.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {quote.tags.map((tag) => (
                <span key={tag.id} className="text-sm font-medium text-blue-600">
                  #{tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
          {quote.category.name}
        </span>
      </div>

      <div className="mt-8 border-t border-slate-100 pt-4 text-right">
        <span className="text-xs font-medium tracking-wide text-slate-400">yerlikoglon.uz</span>
      </div>
    </div>
  );
}
