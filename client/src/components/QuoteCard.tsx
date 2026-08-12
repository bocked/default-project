"use client";

import Link from "next/link";
import type { Quote } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { TelegramPost } from "./TelegramPost";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
}

export function QuoteCard({ quote, showStatus = false }: { quote: Quote; showStatus?: boolean }) {
  return (
    <figure className="animate-slide-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
      <blockquote className="font-serif text-lg leading-relaxed text-slate-800 dark:text-slate-100">
        <span className="mr-1 text-blue-600 dark:text-blue-400">&ldquo;</span>
        {quote.text}
        <span className="ml-1 text-blue-600 dark:text-blue-400">&rdquo;</span>
      </blockquote>

      {quote.telegramUrl && <TelegramPost url={quote.telegramUrl} />}

      <figcaption className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">{quote.displayAuthor}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(quote.createdAt)}</span>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {quote.category.name}
        </span>
      </figcaption>

      {quote.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {quote.tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/?tag=${encodeURIComponent(tag.slug)}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition"
            >
              <span aria-hidden="true">#</span>
              <span>{tag.name}</span>
            </Link>
          ))}
        </div>
      )}

      {showStatus && quote.status && (
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <StatusBadge status={quote.status} />
          {quote.status === "REJECTED" && quote.rejectionReason && (
            <span className="text-xs text-slate-500 dark:text-slate-400">Sabab: {quote.rejectionReason}</span>
          )}
        </div>
      )}
    </figure>
  );
}
