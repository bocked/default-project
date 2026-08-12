"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  Badge,
  Checkbox,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { AdminQuote, Category, QuoteStatus } from "@/lib/types";

type Tab = "ALL" | QuoteStatus;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "ALL", label: "Barchasi" },
  { id: "PENDING", label: "Kutilmoqda" },
  { id: "APPROVED", label: "Tasdiqlangan" },
  { id: "REJECTED", label: "Rad etilgan" },
];

const statusTone: Record<QuoteStatus, "amber" | "emerald" | "rose"> = {
  PENDING: "amber",
  APPROVED: "emerald",
  REJECTED: "rose",
};

const statusLabel: Record<QuoteStatus, string> = {
  PENDING: "Kutilmoqda",
  APPROVED: "Tasdiqlangan",
  REJECTED: "Rad etilgan",
};

interface EditDraft {
  id: string;
  text: string;
  displayAuthor: string;
  categorySlug: string;
  tags: string;
  telegramUrl: string;
}

export default function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<AdminQuote[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<Tab>("PENDING");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async (t: Tab, q: string) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (t !== "ALL") params.set("status", t);
      if (q.trim()) params.set("q", q.trim());
      const data = await api<{ quotes: AdminQuote[]; total: number }>(`/api/admin/quotes?${params.toString()}`);
      setQuotes(data.quotes);
      setTotal(data.total);
      setSelected(new Set());
    } catch {
      setError("Iqtiboslarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void api<{ categories: Category[] }>("/api/categories").then((d) => setCategories(d.categories)).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void load(tab, search), 250);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [load, tab, search]);

  async function refresh(): Promise<void> {
    await load(tab, search);
  }

  async function run(path: string, body?: unknown): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(path, { method: "POST", body });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amal bajarilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: string): Promise<void> {
    await run(`/api/admin/quotes/${id}/approve`);
  }

  async function reject(id: string): Promise<void> {
    const reason = window.prompt("Rad etish sababini kiriting (foydalanuvchiga ko'rinadi):");
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("Sabab bo'sh bo'lishi mumkin emas.");
      return;
    }
    await run(`/api/admin/quotes/${id}/reject`, { reason: reason.trim() });
  }

  async function remove(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/quotes/${id}`, { method: "DELETE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amal bajarilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function runBulk(action: "approve" | "reject" | "delete"): Promise<void> {
    const ids = [...selected];
    if (ids.length === 0) return;
    let reason: string | undefined;
    if (action === "reject") {
      reason = window.prompt("Rad etish sababini kiriting (barchasi uchun):") ?? undefined;
      if (reason === undefined) return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>("/api/admin/quotes/bulk", {
        method: "POST",
        body: { ids, action, reason },
      });
      setSelected(new Set());
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Amal bajarilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(): Promise<void> {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/quotes/${editing.id}`, {
        method: "PATCH",
        body: {
          text: editing.text,
          displayAuthor: editing.displayAuthor,
          categorySlug: editing.categorySlug,
          tags: editing.tags
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          telegramUrl: editing.telegramUrl || undefined,
        },
      });
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Iqtibos saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = quotes.length > 0 && quotes.every((q) => selected.has(q.id));

  return (
    <div className="space-y-4">
      <PageTitle
        title="Iqtiboslar"
        subtitle={`Jami: ${total} ta iqtibos.`}
        actions={
          selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">Tanlangan: {selected.size}</span>
              <AdminButton variant="success" disabled={busy} onClick={() => void runBulk("approve")}>
                Tasdiqlash
              </AdminButton>
              <AdminButton variant="danger" disabled={busy} onClick={() => void runBulk("reject")}>
                Rad etish
              </AdminButton>
              <AdminButton variant="slate" disabled={busy} onClick={() => void runBulk("delete")}>
                Arxivga
              </AdminButton>
            </div>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <AdminInput
          placeholder="Matn, muallif yoki egasi bo'yicha qidirish..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {error && <ErrorNote text={error} />}
      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}

      {!busy && quotes.length === 0 && <EmptyState text="Bu bo'limda iqtiboslar yo'q." />}

      {quotes.length > 0 && (
        <div className="space-y-3">
          <AdminCard className="p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={allSelected}
                onChange={(v) => setSelected(v ? new Set(quotes.map((q) => q.id)) : new Set())}
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">Hammasini tanlash</span>
            </div>
          </AdminCard>

          {quotes.map((quote) => (
            <AdminCard key={quote.id}>
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <Checkbox checked={selected.has(quote.id)} onChange={() => toggle(quote.id)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Badge tone={statusTone[quote.status]}>{statusLabel[quote.status]}</Badge>
                    <span>{quote.category.name}</span>
                    <span>{new Date(quote.createdAt).toLocaleDateString("uz-UZ")}</span>
                    {quote.anonymous && <Badge tone="slate">Anonim</Badge>}
                  </div>

                  <blockquote className="mt-2 font-serif text-base leading-relaxed text-slate-800 dark:text-slate-100">
                    &ldquo;{quote.text}&rdquo;
                  </blockquote>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span>
                      Muallif: <span className="font-medium text-slate-700 dark:text-slate-300">{quote.displayAuthor}</span>
                    </span>
                    <span>
                      Egasi:{" "}
                      <Link
                        href={`/user?id=${quote.user.id}`}
                        className="font-medium text-slate-700 hover:text-blue-600 hover:underline dark:text-slate-300 dark:hover:text-blue-400"
                      >
                        {quote.user.email}
                      </Link>
                    </span>
                  </div>

                  {quote.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {quote.tags.map((tag) => (
                        <span key={tag.id} className="text-xs text-blue-600 dark:text-blue-400">
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {quote.status === "REJECTED" && quote.rejectionReason && (
                    <p className="mt-2 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                      Rad etish sababi: {quote.rejectionReason}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {quote.status !== "APPROVED" && (
                      <AdminButton variant="success" disabled={busy} onClick={() => void approve(quote.id)}>
                        Tasdiqlash
                      </AdminButton>
                    )}
                    {quote.status !== "REJECTED" && (
                      <AdminButton variant="danger" disabled={busy} onClick={() => void reject(quote.id)}>
                        Rad etish
                      </AdminButton>
                    )}
                    <AdminButton
                      variant="slate"
                      disabled={busy}
                      onClick={() =>
                        setEditing({
                          id: quote.id,
                          text: quote.text,
                          displayAuthor: quote.displayAuthor,
                          categorySlug: quote.category.slug,
                          tags: quote.tags.map((t) => t.name).join(", "),
                          telegramUrl: quote.telegramUrl ?? "",
                        })
                      }
                    >
                      Tahrirlash
                    </AdminButton>
                    <AdminButton variant="ghost" disabled={busy} onClick={() => void remove(quote.id)}>
                      Arxivga
                    </AdminButton>
                  </div>
                </div>
              </div>
            </AdminCard>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onClick={() => setEditing(null)}>
          <AdminCard className="w-full max-w-lg" >
            <div onClick={(e) => e.stopPropagation()} className="space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Iqtibosni tahrirlash</h2>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Matn</label>
                <AdminTextarea
                  rows={3}
                  value={editing.text}
                  onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Muallif</label>
                  <AdminInput
                    value={editing.displayAuthor}
                    onChange={(e) => setEditing({ ...editing, displayAuthor: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Bo&apos;lim</label>
                  <AdminSelect
                    className="w-full"
                    value={editing.categorySlug}
                    onChange={(e) => setEditing({ ...editing, categorySlug: e.target.value })}
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Heshteglar (vergul bilan ajrating)
                </label>
                <AdminInput
                  value={editing.tags}
                  onChange={(e) => setEditing({ ...editing, tags: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Telegram havola (ixtiyoriy)
                </label>
                <AdminInput
                  placeholder="https://t.me/kanal/123"
                  value={editing.telegramUrl}
                  onChange={(e) => setEditing({ ...editing, telegramUrl: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2">
                <AdminButton variant="slate" onClick={() => setEditing(null)}>
                  Bekor qilish
                </AdminButton>
                <AdminButton disabled={busy} onClick={() => void saveEdit()}>
                  Saqlash
                </AdminButton>
              </div>
            </div>
          </AdminCard>
        </div>
      )}
    </div>
  );
}
