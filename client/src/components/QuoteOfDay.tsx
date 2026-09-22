"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { Quote } from "@/lib/types";
import { VipBadge } from "./VipBadge";

interface TodayResponse {
  date: string;
  quote: Quote | null;
}

function formatLongDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("uz-UZ", { weekday: "long", day: "numeric", month: "long" });
}

/** Highlighter block with the server-picked "quote of the day". Hidden when
 *  the admin hasn't enabled it or the API is unavailable. */
export function QuoteOfDay() {
  const [quote, setQuote] = useState<Quote | null | undefined>(undefined);
  const [date, setDate] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<TodayResponse>("/api/quotes/today")
      .then((data) => {
        if (cancelled) return;
        setQuote(data.quote);
        setDate(data.date);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || quote === null) return null;

  const dateLabel = formatLongDate(date);

  return (
    <section
      aria-label="Kunning iqtibosi"
      className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-md dark:border-blue-900 dark:from-blue-700 dark:to-indigo-900 sm:p-6"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-100 sm:text-xs">
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" />
        </svg>
        Kunning iqtibosi{dateLabel ? ` \u2014 ${dateLabel}` : ""}
      </div>

      {quote === undefined ? (
        <div className="space-y-3 pt-4">
          <div className="animate-shimmer h-4 w-full rounded-full bg-white/40" />
          <div className="animate-shimmer h-4 w-2/3 rounded-full bg-white/40" />
        </div>
      ) : (
        <>
          <blockquote className="mt-3 font-serif text-lg leading-relaxed text-white md:text-xl">
            &ldquo;{quote.text}&rdquo;
          </blockquote>
          <figcaption className="mt-3 flex items-center gap-2 text-sm font-medium text-blue-100">
            <span>— {quote.displayAuthor}</span>
            {quote.authorPremium && <VipBadge size="sm" />}
          </figcaption>
        </>
      )}
    </section>
  );
}