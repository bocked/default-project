"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toPng } from "html-to-image";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Quote } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { TelegramPost } from "./TelegramPost";
import { QuoteArt } from "./QuoteArt";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("uz-UZ", { day: "numeric", month: "long", year: "numeric" });
}

export function QuoteCard({ quote, showStatus = false }: { quote: Quote; showStatus?: boolean }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState(Boolean(quote.likedByMe));
  const [likeCount, setLikeCount] = useState(quote.likeCount ?? 0);
  const [busy, setBusy] = useState(false);
  const [artVisible, setArtVisible] = useState(false);
  const [busyArt, setBusyArt] = useState(false);
  const artRef = useRef<HTMLDivElement | null>(null);

  async function toggleLike(): Promise<void> {
    if (!user) {
      window.location.href = "/login";
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const next = !liked;
      await api<{ liked: boolean; likeCount: number }>(`/api/quotes/${quote.id}/like`, {
        method: next ? "POST" : "DELETE",
      });
      setLiked(next);
      setLikeCount((c) => (next ? c + 1 : Math.max(0, c - 1)));
    } catch {
      // non-fatal: keep current state
    } finally {
      setBusy(false);
    }
  }

  async function captureArt(): Promise<void> {
    const node = artRef.current;
    if (!node) return;
    const dataUrl = await toPng(node, { pixelRatio: 2, cacheBust: true });
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `iqtibos-${quote.id}.png`, { type: "image/png" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Iqtibos" });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `iqtibos-${quote.id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  }

  async function shareAsImage(): Promise<void> {
    if (busyArt) return;
    setBusyArt(true);
    setArtVisible(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
      await captureArt();
    } catch {
      // user cancelled the native share sheet or rendering failed: ignore
    } finally {
      setArtVisible(false);
      setBusyArt(false);
    }
  }

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

      <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleLike()}
          aria-pressed={liked}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
            liked
              ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          <svg className={`h-3.5 w-3.5 ${liked ? "fill-current" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20l7.682-7.318a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
          <span>{likeCount}</span>
        </button>

        <span className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          {quote.views ?? 0}
        </span>

        <button
          type="button"
          disabled={busyArt}
          onClick={() => void shareAsImage()}
          title="Rasm sifatida ulashish yoki yuklab olish"
          aria-label="Rasm sifatida ulashish"
          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200 disabled:opacity-60 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span>{busyArt ? "..." : "Rasm"}</span>
        </button>
      </div>

      {showStatus && quote.status && (
        <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <StatusBadge status={quote.status} />
          {quote.status === "REJECTED" && quote.rejectionReason && (
            <span className="text-xs text-slate-500 dark:text-slate-400">Sabab: {quote.rejectionReason}</span>
          )}
        </div>
      )}

      {artVisible && (
        <div aria-hidden="true" className="pointer-events-none fixed left-[-9999px] top-0 z-50" ref={artRef}>
          <QuoteArt quote={quote} />
        </div>
      )}
    </figure>
  );
}
