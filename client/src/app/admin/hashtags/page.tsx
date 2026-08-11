"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { AdminTag } from "@/lib/types";

export default function AdminHashtagsPage() {
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  const load = useCallback(async (q: string) => {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const data = await api<{ tags: AdminTag[] }>(`/api/admin/tags?${params.toString()}`);
      setTags(data.tags);
    } catch {
      setError("Heshteglarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => void load(search), 250);
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    };
  }, [load, search]);

  async function rename(tag: AdminTag): Promise<void> {
    const name = window.prompt("Yangi nom:", tag.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      window.alert("Nom bo'sh bo'lishi mumkin emas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/tags/${tag.id}`, {
        method: "PATCH",
        body: { name: trimmed },
      });
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Heshteg saqlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(tag: AdminTag): Promise<void> {
    if (!window.confirm(`#${tag.name} heshtegini butunlay o'chirishni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/tags/${tag.id}`, { method: "DELETE" });
      await load(search);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Heshteg o'chirilmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Heshteglar" subtitle="Barcha heshteglar va ularga bog'langan iqtiboslar soni." />
      <AdminInput
        placeholder="Heshteg bo'yicha qidirish..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {error && <ErrorNote text={error} />}
      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}

      {!busy && tags.length === 0 && <EmptyState text="Heshteglar topilmadi." />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tags.map((tag) => (
          <AdminCard key={tag.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900 dark:text-white">#{tag.name}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                <Badge tone="slate">{tag.quoteCount} ta iqtibos</Badge>
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <AdminButton variant="slate" disabled={busy} onClick={() => void rename(tag)}>
                Nomini o&apos;zgartirish
              </AdminButton>
              <AdminButton variant="ghost" disabled={busy} onClick={() => void remove(tag)}>
                O&apos;chirish
              </AdminButton>
            </div>
          </AdminCard>
        ))}
      </div>
    </div>
  );
}
