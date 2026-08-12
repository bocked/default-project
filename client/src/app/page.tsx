"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { QuoteCard } from "@/components/QuoteCard";
import type { Category, PaginatedQuotes, Quote, Tag } from "@/lib/types";

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
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [content, setContent] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(1);
  const [showAllTags, setShowAllTags] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const initialParamsAppliedRef = useRef(false);

  const heroTitle = content["hero.title"] ?? "Iqtibosim";
  const heroSubtitle =
    content["hero.subtitle"] ??
    "Dono fikrlarni o'qing va o'zingiznikini qo'shing. Har bir iqtibos moderatsiyadan o'tadi.";

  // Apply initial URL params once after hydration (deferred to avoid lint).
  useEffect(() => {
    if (initialParamsAppliedRef.current) return;
    initialParamsAppliedRef.current = true;
    window.setTimeout(() => {
      const q = searchParams.get("q");
      const cat = searchParams.get("category");
      const tg = searchParams.get("tag");
      const pg = searchParams.get("page");
      if (q) setSearch(q);
      if (cat) setCategory(cat);
      if (tg) setTag(tg);
      if (pg) setPage(Math.max(1, Number(pg)));
    }, 0);
  }, [searchParams]);

  // Push URL updates when filters/page change (avoid initial hydration push).
  useEffect(() => {
    if (!initialParamsAppliedRef.current) return;
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (category) params.set("category", category);
    if (tag) params.set("tag", tag);
    if (page > 1) params.set("page", String(page));
    const qs = params.toString();
    const newUrl = qs ? `/?${qs}` : "/";
    if (window.location.search !== `?${qs}` && window.location.pathname !== newUrl) {
      router.push(newUrl, { scroll: false });
    }
  }, [search, category, tag, page, router]);

  const fetchQuotes = useCallback(async (nextPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (category) params.set("category", category);
      if (tag) params.set("tag", tag);
      params.set("page", String(nextPage));
      const qs = params.toString();
      const data = await api<PaginatedQuotes>(`/api/quotes${qs ? `?${qs}` : ""}`);
      setQuotes((prev) => (nextPage === 1 ? data.quotes : [...prev, ...data.quotes]));
      setTotal(data.total);
    } catch {
      setError("Iqtiboslarni yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }, [search, category, tag]);

  useEffect(() => {
    void api<{ categories: Category[] }>("/api/categories")
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
    void api<{ tags: Tag[] }>("/api/tags")
      .then((data) => setTags(data.tags))
      .catch(() => setTags([]));
    void api<{ content: Record<string, string> }>("/api/content")
      .then((data) => setContent(data.content))
      .catch(() => setContent({}));
  }, []);

  // Debounced "realtime" search as the user types. Resets pagination.
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setPage(1);
      void fetchQuotes(1);
    }, 300);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [fetchQuotes]);

  async function loadMore(): Promise<void> {
    const next = page + 1;
    await fetchQuotes(next);
    setPage(next);
  }

  const activeFilter = category || tag;
  const remaining = total - quotes.length;

  return (
    <div className="space-y-6">
      <section className="pt-2 text-center">
        <h1 className="font-serif text-4xl font-bold text-slate-900 dark:text-white">{heroTitle}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{heroSubtitle}</p>
      </section>

      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Iqtibos, muallif yoki heshteg bo'yicha qidirish..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
        />
      </div>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={!category} onClick={() => setCategory("")}>
            Barchasi
          </FilterChip>
          {categories.map((c) => (
            <FilterChip key={c.id} active={category === c.slug} onClick={() => setCategory(category === c.slug ? "" : c.slug)}>
              {c.name}
            </FilterChip>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(showAllTags ? tags : tags.slice(0, 15)).map((t) => (
            <FilterChip
              key={t.id}
              active={tag === t.slug}
              tone="blue"
              onClick={() => setTag(tag === t.slug ? "" : t.slug)}
            >
              #{t.name}
            </FilterChip>
          ))}
          {tags.length > 15 && (
            <button
              type="button"
              onClick={() => setShowAllTags((v) => !v)}
              className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-blue-400 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
            >
              {showAllTags ? "Yashirish" : `Barcha heshteglar (${tags.length})`}
            </button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
        <span>
          {loading && quotes.length === 0
            ? "Qidirilmoqda..."
            : total === 0
              ? "0 ta iqtibos"
              : `${quotes.length} / ${total} ta iqtibos`}
          {activeFilter ? " (filtrlangan)" : ""}
        </span>
        {activeFilter && (
          <button type="button" onClick={() => { setCategory(""); setTag(""); }} className="text-blue-600 hover:underline dark:text-blue-400">
            Filtrni tozalash
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
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
            onClick={() => void loadMore()}
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

function FilterChip({
  active,
  tone = "slate",
  onClick,
  children,
}: {
  active: boolean;
  tone?: "slate" | "blue";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base = "rounded-full border px-3 py-1 text-xs font-medium transition";
  const cls = active
    ? tone === "blue"
      ? "border-blue-600 bg-blue-600 text-white"
      : "border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900"
    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white";
  return (
    <button type="button" onClick={onClick} className={`${base} ${cls}`}>
      {children}
    </button>
  );
}
