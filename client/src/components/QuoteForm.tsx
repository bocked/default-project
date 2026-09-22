"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isPremiumActive } from "@/lib/premium";
import { quoteCardStyle, quoteTextStyle, quoteMarks } from "@/lib/quoteStyles";
import type { Category, Quote, QuoteCustomStyles } from "@/lib/types";

const DEFAULT_STYLES: QuoteCustomStyles = {
  fontFamily: "serif",
  fontSize: 18,
  alignment: "left",
  border: "none",
  quoteMark: "double",
  texture: "none",
};

const FONT_OPTIONS: Array<{ id: NonNullable<QuoteCustomStyles["fontFamily"]>; label: string }> = [
  { id: "serif", label: "Serif" },
  { id: "sans", label: "Sans" },
  { id: "mono", label: "Monospace" },
  { id: "calligraphic", label: "Kalligrafik" },
];

const ALIGN_OPTIONS: Array<{ id: NonNullable<QuoteCustomStyles["alignment"]>; label: string }> = [
  { id: "left", label: "Chapga" },
  { id: "center", label: "Markazga" },
  { id: "right", label: "O\u2019ngga" },
];

const BORDER_OPTIONS: Array<{ id: NonNullable<QuoteCustomStyles["border"]>; label: string }> = [
  { id: "none", label: "Oddiy" },
  { id: "gold", label: "Oltin" },
  { id: "silver", label: "Kumush" },
  { id: "neon", label: "Neon glow" },
];

const MARK_OPTIONS: Array<{ id: NonNullable<QuoteCustomStyles["quoteMark"]>; label: string }> = [
  { id: "classic", label: "\u201C \u201D" },
  { id: "double", label: "\u00AB \u00BB" },
  { id: "single", label: "\u201E \u201C" },
  { id: "none", label: "Yashirish" },
];

const TEXTURE_OPTIONS: Array<{ id: NonNullable<QuoteCustomStyles["texture"]>; label: string }> = [
  { id: "none", label: "Oddiy" },
  { id: "paper", label: "Qog\u2019oz" },
  { id: "glass", label: "Shisha" },
];

const TEXT_SWATCHES = ["#0f172a", "#1e293b", "#7f1d1d", "#14532d", "#581c87", "#1e3a8a", "#334155"];
const BG_SWATCHES = [
  "#ffffff",
  "#f8fafc",
  "#fef3c7",
  "#f5f3ff",
  "#ecfeff",
  "#0f172a",
  "#1e293b",
  "#7f1d1d",
  "#14532d",
  "#000000",
];

function StyleOptionRow({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: Array<{ id: string; label: string }>;
  value: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-amber-800 dark:text-amber-400">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              value === opt.id
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-white text-amber-800 hover:bg-amber-100 dark:bg-slate-800 dark:text-amber-300 dark:hover:bg-slate-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorStyleRow({
  label,
  value,
  onChange,
  swatches,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  swatches: string[];
}) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-amber-800 dark:text-amber-400">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange("")}
          title="Rangsiz"
          className={`rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ${
            value === "" ? "ring-2 ring-amber-400" : "hover:bg-slate-50"
          }`}
        >
          Yo\u2019q
        </button>
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-label={c}
            className={`h-6 w-6 rounded-full border border-slate-300 ${
              value === c ? "ring-2 ring-amber-400" : ""
            }`}
            style={{ background: c }}
          />
        ))}
        <label className="relative ml-0.5 h-6 w-9 cursor-pointer overflow-hidden rounded-lg border border-slate-300">
          <input
            type="color"
            value={value || "#0f172a"}
            onChange={(e) => onChange(e.target.value)}
            className="absolute -inset-2 h-12 w-12 cursor-pointer border-0"
            aria-label="Maxsus rang"
          />
        </label>
      </div>
    </div>
  );
}

export function QuoteForm({
  categories,
  onCreated,
}: {
  categories: Category[];
  onCreated: (quote: Quote) => void;
}) {
  const { user } = useAuth();
  const premium = isPremiumActive(user);
  const [text, setText] = useState("");
  const [categorySlug, setCategorySlug] = useState(categories[0]?.slug ?? "");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState("");
  const [customStyles, setCustomStyles] = useState<QuoteCustomStyles>({ ...DEFAULT_STYLES });
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
        body: {
          text,
          categorySlug,
          tags,
          anonymous,
          telegramUrl: telegramUrl.trim() || undefined,
          ...(premium ? { customStyles } : {}),
        },
      });
      onCreated(quote);
      setText("");
      setTags([]);
      setAnonymous(false);
      setTelegramUrl("");
      setCustomStyles({ ...DEFAULT_STYLES });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  }

  const previewAuthor = anonymous ? "Anonim" : user?.nickname || user?.name || "Foydalanuvchi";
  const categoryName = categories.find((c) => c.slug === categorySlug)?.name ?? "";
  const [openMark, closeMark] = quoteMarks(premium ? customStyles : null);

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

      {premium && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-amber-900 dark:text-amber-300">VIP post uslubi</h3>
            <button
              type="button"
              onClick={() => setCustomStyles({ ...DEFAULT_STYLES })}
              className="text-[11px] font-medium text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-900 dark:text-amber-400"
            >
              Asl holatiga qaytarish
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <StyleOptionRow
              label="Shrift turi"
              options={FONT_OPTIONS}
              value={customStyles.fontFamily ?? "serif"}
              onSelect={(id) => setCustomStyles((s) => ({ ...s, fontFamily: id as QuoteCustomStyles["fontFamily"] }))}
            />
            <StyleOptionRow
              label="Tekislash"
              options={ALIGN_OPTIONS}
              value={customStyles.alignment ?? "left"}
              onSelect={(id) => setCustomStyles((s) => ({ ...s, alignment: id as QuoteCustomStyles["alignment"] }))}
            />
            <StyleOptionRow
              label="Ramka va soya"
              options={BORDER_OPTIONS}
              value={customStyles.border ?? "none"}
              onSelect={(id) => setCustomStyles((s) => ({ ...s, border: id as QuoteCustomStyles["border"] }))}
            />
            <StyleOptionRow
              label="Qo&apos;shtirnoq uslubi"
              options={MARK_OPTIONS}
              value={customStyles.quoteMark ?? "classic"}
              onSelect={(id) => setCustomStyles((s) => ({ ...s, quoteMark: id as QuoteCustomStyles["quoteMark"] }))}
            />
            <StyleOptionRow
              label="Fon teksturasi"
              options={TEXTURE_OPTIONS}
              value={customStyles.texture ?? "none"}
              onSelect={(id) => setCustomStyles((s) => ({ ...s, texture: id as QuoteCustomStyles["texture"] }))}
            />
            <div>
              <p className="mb-1 text-[11px] font-medium text-amber-800 dark:text-amber-400">
                Matn hajmi — {customStyles.fontSize ?? 18}px
              </p>
              <div className="flex h-8 items-center">
                <input
                  type="range"
                  min={14}
                  max={40}
                  value={customStyles.fontSize ?? 18}
                  onChange={(e) => setCustomStyles((s) => ({ ...s, fontSize: Number(e.target.value) }))}
                  className="w-full accent-amber-600"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <ColorStyleRow
              label="Matn rangi"
              value={customStyles.textColor ?? ""}
              onChange={(c) => setCustomStyles((s) => ({ ...s, textColor: c || undefined }))}
              swatches={TEXT_SWATCHES}
            />
            <ColorStyleRow
              label="Karta foni rangi"
              value={customStyles.cardBg ?? ""}
              onChange={(c) => setCustomStyles((s) => ({ ...s, cardBg: c || undefined }))}
              swatches={BG_SWATCHES}
            />
          </div>
        </div>
      )}

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
          className="h-4 w-4 accent-blue-600"
        />
        To&apos;liq anonim qoldirish (muallif nomi ko&apos;rinmasin)
      </label>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Jonli ko&apos;rinish (post kartochkasi)</p>
        <div
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
          style={quoteCardStyle(premium ? customStyles : null)}
        >
          <blockquote
            className="font-serif text-base leading-relaxed text-slate-800 dark:text-slate-100 md:text-lg"
            style={quoteTextStyle(premium ? customStyles : null)}
          >
            <span className="mr-1 select-none opacity-70" aria-hidden="true">
              {openMark}
            </span>
            {text.trim() ? (
              text
            ) : (
              <span className="text-slate-400 dark:text-slate-500">Iqtibos matningiz shu yerda ko&apos;rinadi...</span>
            )}
            <span className="ml-1 select-none opacity-70" aria-hidden="true">
              {closeMark}
            </span>
          </blockquote>
          <figcaption className="mt-3 flex items-center justify-between gap-2 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-slate-700 dark:text-slate-300">{previewAuthor}</span>
              <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500">hozir</span>
            </div>
            {categoryName && (
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {categoryName}
              </span>
            )}
          </figcaption>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {tags.map((tag) => (
                <span key={tag} className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

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