"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { QuoteCard } from "@/components/QuoteCard";
import type { Category, PaginatedQuotes, Quote, Tag } from "@/lib/types";

export default function Home() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (category) params.set("category", category);
      if (tag) params.set("tag", tag);
      const qs = params.toString();
      const data = await api<PaginatedQuotes>(`/api/quotes${qs ? `?${qs}` : ""}`);
      setQuotes(data.quotes);
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
  }, []);

  // Debounced "realtime" search as the user types.
  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void fetchQuotes();
    }, 300);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [fetchQuotes]);

  const activeFilter = category || tag;

  return (
    <div className="space-y-6">
      <section className="pt-2 text-center">
        <h1 className="text-3xl font-bold text-slate-900">Iqtibosim</h1>
        <p className="mt-2 text-sm text-slate-500">
          Dono fikrlarni o&apos;qing va o&apos;zingiznikini qo&apos;shing. Har bir iqtibos moderatsiyadan o&apos;tadi.
        </p>
      </section>

      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">🔎</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Iqtibos, muallif yoki heshteg bo'yicha qidirish..."
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
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
          {tags.slice(0, 15).map((t) => (
            <FilterChip
              key={t.id}
              active={tag === t.slug}
              tone="blue"
              onClick={() => setTag(tag === t.slug ? "" : t.slug)}
            >
              #{t.name}
            </FilterChip>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          {loading ? "Qidirilmoqda..." : `${total} ta iqtibos`}
          {activeFilter ? " (filtrlangan)" : ""}
        </span>
        {activeFilter && (
          <button type="button" onClick={() => { setCategory(""); setTag(""); }} className="text-blue-600 hover:underline">
            Filtrni tozalash
          </button>
        )}
      </div>

      {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-600">{error}</p>}

      {!loading && quotes.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
          <p className="text-sm text-slate-500">Hozircha iqtiboslar yo&apos;q. Birinchi bo&apos;lib qo&apos;shing!</p>
        </div>
      )}

      <div className="space-y-4">
        {quotes.map((quote) => (
          <QuoteCard key={quote.id} quote={quote} />
        ))}
      </div>
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
      : "border-slate-800 bg-slate-800 text-white"
    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900";
  return (
    <button type="button" onClick={onClick} className={`${base} ${cls}`}>
      {children}
    </button>
  );
}
