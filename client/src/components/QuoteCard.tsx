"use client";

import type { Quote } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
}

export function QuoteCard({ quote, showStatus = false }: { quote: Quote; showStatus?: boolean }) {
  return (
    <figure className="animate-slide-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <blockquote className="text-[15px] leading-relaxed text-slate-800">
        <span className="mr-1 text-blue-600">&ldquo;</span>
        {quote.text}
        <span className="ml-1 text-blue-600">&rdquo;</span>
      </blockquote>

      <figcaption className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700">{quote.displayAuthor}</span>
          <span className="text-xs text-slate-400">{formatDate(quote.createdAt)}</span>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {quote.category.name}
        </span>
      </figcaption>

      {quote.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {quote.tags.map((tag) => (
            <span key={tag.id} className="text-xs text-blue-600">
              #{tag.name}
            </span>
          ))}
        </div>
      )}

      {showStatus && quote.status && (
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3">
          <StatusBadge status={quote.status} />
          {quote.status === "REJECTED" && quote.rejectionReason && (
            <span className="text-xs text-slate-500">Sabab: {quote.rejectionReason}</span>
          )}
        </div>
      )}
    </figure>
  );
}
