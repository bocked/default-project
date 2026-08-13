"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminTextarea,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { SeoRule } from "@/lib/types";

const PRESETS = [
  { page: "home", label: "Bosh sahifa" },
  { page: "about", label: "Biz haqimizda" },
  { page: "rules", label: "Qoidalar" },
];

export default function AdminSeoPage() {
  const [rules, setRules] = useState<SeoRule[]>([]);
  const [page, setPage] = useState("home");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ rules: SeoRule[] }>("/api/admin/seo");
      setRules(data.rules);
    } catch {
      setError("SEO qoidalarini yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  function pickRule(rule: SeoRule): void {
    setPage(rule.page);
    setTitle(rule.title ?? "");
    setDescription(rule.description ?? "");
    setKeywords(rule.keywords ?? "");
  }

  function resetForm(): void {
    setPage("home");
    setTitle("");
    setDescription("");
    setKeywords("");
  }

  async function save(): Promise<void> {
    const p = page.trim();
    if (!p) {
      window.alert("Sahifa kaliti kiriting.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api<{ rule: SeoRule }>("/api/admin/seo", {
        method: "PUT",
        body: {
          page: p,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          keywords: keywords.trim() || undefined,
        },
      });
      setNotice("SEO qoidasi saqlandi.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "SEO qoidasi saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm("Bu SEO qoidasini o'chirishni tasdiqlaysizmi?")) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/seo/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "SEO qoidasi o'chirilmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="SEO sozlamalari"
        subtitle="Har bir sahifa, bo'lim yoki iqtibos uchun meta-teglar."
        actions={
          <AdminButton variant="slate" disabled={busy} onClick={resetForm}>
            Yangi qoida
          </AdminButton>
        }
      />

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {error && <ErrorNote text={error} />}

      <AdminCard>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Qoida</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Sahifa kaliti (home, category:slug, tag:slug, quote:id)
            </label>
            <AdminInput value={page} onChange={(e) => setPage(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Sarlavha (title)</label>
            <AdminInput value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Tavsif (description)</label>
            <AdminTextarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={400} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Kalit so&apos;zlar</label>
            <AdminInput value={keywords} onChange={(e) => setKeywords(e.target.value)} maxLength={400} />
          </div>
          <div className="flex items-center gap-2">
            <AdminButton disabled={busy} onClick={() => void save()}>
              Saqlash
            </AdminButton>
            <span className="text-xs text-slate-400 dark:text-slate-500">Tayyor shablonlar:</span>
            {PRESETS.map((p) => (
              <AdminButton
                key={p.page}
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  const existing = rules.find((r) => r.page === p.page);
                  if (existing) pickRule(existing);
                  else {
                    setPage(p.page);
                    setTitle("");
                    setDescription("");
                    setKeywords("");
                  }
                }}
              >
                {p.label}
              </AdminButton>
            ))}
          </div>
        </div>
      </AdminCard>

      {!busy && rules.length === 0 && <EmptyState text="SEO qoidalari yo'q." />}

      <div className="space-y-2">
        {rules.map((rule) => (
          <AdminCard key={rule.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-mono text-sm font-medium text-slate-900 dark:text-white">
                {rule.page}
                {rule.title && <Badge tone="blue">{rule.title.slice(0, 40)}</Badge>}
              </p>
              {rule.description && (
                <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{rule.description}</p>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <AdminButton variant="slate" disabled={busy} onClick={() => pickRule(rule)}>
                Tahrirlash
              </AdminButton>
              <AdminButton variant="ghost" disabled={busy} onClick={() => void remove(rule.id)}>
                O&apos;chirish
              </AdminButton>
            </div>
          </AdminCard>
        ))}
      </div>
    </div>
  );
}
