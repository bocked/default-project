"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminTextarea,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { ContentBlock } from "@/lib/types";

export default function AdminContentPage() {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { title: string; value: string }>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ blocks: ContentBlock[] }>("/api/admin/content");
      setBlocks(data.blocks);
      setDrafts(Object.fromEntries(data.blocks.map((b) => [b.key, { title: b.title, value: b.value }])));
    } catch {
      setError("Kontent bloklarini yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  function patch(key: string, part: Partial<{ title: string; value: string }>): void {
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...part } }));
  }

  async function save(key: string): Promise<void> {
    const draft = drafts[key];
    if (!draft) return;
    setSaving(key);
    setError(null);
    setNotice(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/content/${key}`, {
        method: "PUT",
        body: { value: draft.value, title: draft.title },
      });
      setNotice(`"${draft.title}" saqlandi.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kontent saqlanmadi");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Kontent boshqaruvi" subtitle="Saytdagi dinamik matnlarni o'zgartiring." />

      {notice && (
        <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {notice}
        </p>
      )}
      {error && <ErrorNote text={error} />}
      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}

      {!busy && blocks.length === 0 && <EmptyState text="Kontent bloklari topilmadi." />}

      <div className="grid gap-4 lg:grid-cols-2">
        {blocks.map((block) => {
          const draft = drafts[block.key];
          if (!draft) return null;
          return (
            <AdminCard key={block.key}>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Sarlavha</label>
                  <AdminInput value={draft.title} onChange={(e) => patch(block.key, { title: e.target.value })} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    Matn <span className="text-slate-400">({block.key})</span>
                  </label>
                  <AdminTextarea rows={3} value={draft.value} onChange={(e) => patch(block.key, { value: e.target.value })} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Yangilandi: {new Date(block.updatedAt).toLocaleString("uz-UZ")}
                  </span>
                  <AdminButton
                    disabled={saving === block.key || draft.value.trim() === ""}
                    onClick={() => void save(block.key)}
                  >
                    {saving === block.key ? "Saqlanmoqda..." : "Saqlash"}
                  </AdminButton>
                </div>
              </div>
            </AdminCard>
          );
        })}
      </div>
    </div>
  );
}
