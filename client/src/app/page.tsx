"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { QuoteCard } from "@/components/QuoteCard";
import { ServerGame } from "@/components/ServerGame";
import type { PaginatedQuotes, Quote } from "@/lib/types";

/** If a request takes longer than this, show an error fallback instead of hanging. */
const LOADING_TIMEOUT_MS = 12000;
/** After this many ms of initial loading (no quotes yet), show the mini-game. */
const GAME_DELAY_MS = 4000;

export default function Home() {
  return (
    <Suspense fallback={<div className="space-y-6"><p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p></div>}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [content, setContent] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGame, setShowGame] = useState(false);
  const requestIdRef = useRef(0);

  // Search, category and tag filters are owned by the NavBar dropdowns and
  // travel through the URL (?q=, ?category=, ?tag=); this page only renders
  // the matching quotes and handles pagination (?page=).
  const q = searchParams.get("q")?.trim() ?? "";
  const category = searchParams.get("category") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));

  const heroTitle = content["hero.title"] ?? "Iqtibosim";
  const heroSubtitle =
    content["hero.subtitle"] ??
    "Dono fikrlarni o'qing va o'zingiznikini qo'shing. Har bir iqtibos moderatsiyadan o'tadi.";

  // When filters change, drop the old (possibly filtered) list immediately so
  // stale quotes never linger while the new request is in flight.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setQuotes([]);
      setTotal(0);
    }, 0);
    return () => window.clearTimeout(id);
  }, [q, category, tag]);

  const fetchQuotes = useCallback(
    async (nextPage: number) => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      const watchdog = window.setTimeout(() => {
        if (requestId === requestIdRef.current) {
          setError("Serverdan javob kelishida muammo yuz berdi. Qayta urinib ko'ring.");
          setLoading(false);
        }
      }, LOADING_TIMEOUT_MS);

      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (category) params.set("category", category);
        if (tag) params.set("tag", tag);
        params.set("page", String(nextPage));
        const qs = params.toString();
        const data = await api<PaginatedQuotes>(`/api/quotes${qs ? `?${qs}` : ""}`);
        // Ignore stale responses (e.g. a slower filtered request that resolves
        // after the URL was cleared) so the list always matches the URL.
        if (requestId !== requestIdRef.current) return;
        setError(null);
        if (nextPage === 1) setQuotes(data.quotes);
        else setQuotes((prev) => [...prev, ...data.quotes]);
        setTotal(data.total);
      } catch {
        if (requestId === requestIdRef.current) {
          setError("Iqtiboslarni yuklab bo'lmadi");
        }
      } finally {
        window.clearTimeout(watchdog);
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [q, category, tag]
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchQuotes(page);
    }, 0);
    return () => window.clearTimeout(id);
  }, [fetchQuotes, page]);

  // Show the mini-game after GAME_DELAY_MS of initial loading (no quotes yet).
  useEffect(() => {
    if (!loading || quotes.length > 0) return;
    const id = window.setTimeout(() => setShowGame(true), GAME_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [loading, quotes.length]);

  // Also show the game immediately when an error is set (server failed).
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setShowGame(true), 0);
    return () => window.clearTimeout(id);
  }, [error]);

  // When the health-check in ServerGame succeeds, hide the game and re-fetch.
  const handleGameReady = useCallback(() => {
    setShowGame(false);
    setError(null);
    void fetchQuotes(page);
  }, [fetchQuotes, page]);

  useEffect(() => {
    void api<{ content: Record<string, string> }>("/api/content")
      .then((data) => setContent(data.content))
      .catch(() => setContent({}));
  }, []);

  function clearFilters(): void {
    router.push("/", { scroll: false });
  }

  function loadMore(): void {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (tag) params.set("tag", tag);
    params.set("page", String(page + 1));
    router.push(`/?${params.toString()}`, { scroll: false });
  }

  const remaining = total - quotes.length;
  const activeFilter = Boolean(q || category || tag);

  return (
    <div className="space-y-6">
      {showGame && <ServerGame onReady={handleGameReady} />}

      <section className="pt-2 text-center">
        <h1 className="font-serif text-4xl font-bold text-slate-900 dark:text-white">{heroTitle}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{heroSubtitle}</p>
      </section>

      <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
        <span>
          {error && quotes.length === 0
            ? ""
            : loading && quotes.length === 0
              ? "Yuklanmoqda..."
              : total === 0
                ? "0 ta iqtibos"
                : `${quotes.length} / ${total} ta iqtibos`}
          {activeFilter ? " (filtrlangan)" : ""}
        </span>
        {activeFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
          >
            Filtrni tozalash
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/40">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>
          <p className="mt-1 text-xs text-rose-500 dark:text-rose-400">
            Server vaqtincha javob bermasligi mumkin. Qayta urinib ko&apos;ring yoki birozdan keyin kiring.
          </p>
          <button
            type="button"
            onClick={() => void fetchQuotes(page)}
            className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 dark:hover:bg-rose-500"
          >
            Qayta urinish
          </button>
        </div>
      )}

      {!loading && quotes.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">Hozircha iqtiboslar yo&apos;q. Birinchi bo&apos;lib qo&apos;shing!</p>
        </div>
      )}

      <div className="space-y-4">
        {quotes.map((quote) => (
          <QuoteCard key={quote.id} quote={quote} />
        ))}
      </div>

      {remaining > 0 && !error && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-500 dark:hover:text-blue-400"
          >
            {loading ? "Yuklanmoqda..." : `Ko'proq ko'rsatish (yana ${remaining} ta)`}
          </button>
        </div>
      )}
    </div>
  );
}
