"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { Category, Quote } from "@/lib/types";

export function QuoteForm({
  categories,
  onCreated,
}: {
  categories: Category[];
  onCreated: (quote: Quote) => void;
}) {
  const [text, setText] = useState("");
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug ?? "");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addTag(): void {
    const value = tagInput.trim().replace(/^#+/, "").slice(0, 40);
    if (value && !tags.includes(value) && tags.length < 5) {
      setTags([...tags, value]);
    }
    setTagInput("");
  }

  function handleTagKey(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag();
    }
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { quote } = await api<{ quote: Quote }>("/api/quotes", {
        method: "POST",
        body: { text, categorySlug, tags, anonymous, telegramUrl: telegramUrl.trim() || undefined },
      });
      onCreated(quote);
      setText("");
      setTags([]);
      setAnonymous(false);
      setTelegramUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 dark:border-blue-900/50 dark:bg-blue-950/30">
      <h2 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Yangi iqtibos qo&apos;shish</h2>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Iqtibos matnini yozing..."
        required
        maxLength={1000}
        rows={4}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
      />

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Bo&apos;lim</label>
          <select
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Heshteglar (maks. 5)</label>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKey}
            onBlur={addTag}
            placeholder="Enter bilan qo'shing"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
          />
        </div>
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setTags(tags.filter((t) => t !== tag))}
              className="rounded-full bg-white px-2.5 py-0.5 text-xs text-blue-700 shadow-sm transition hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700"
            >
              #{tag} ×
            </button>
          ))}
        </div>
      )}

      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
          Telegram post havolasi (ixtiyoriy)
        </label>
        <input
          type="url"
          value={telegramUrl}
          onChange={(e) => setTelegramUrl(e.target.value)}
          placeholder="https://t.me/kanal_nomi/123"
          maxLength={200}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
        />
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Post saytda Telegramning o&apos;ziday ko&apos;rinadi.</p>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="h-4 w-4 accent-blue-600"
        />
        To&apos;liq anonim qoldirish (muallif nomi ko&apos;rinmasin)
      </label>

      {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !text.trim()}
        className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-500"
      >
        {submitting ? "Yuborilmoqda..." : "Iqtibosni yuborish (moderatsiyadan o'tadi)"}
      </button>
    </form>
  );
}
