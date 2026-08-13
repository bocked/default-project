"use client";

import { useCallback, useEffect, useState } from "react";
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
import type { Category } from "@/lib/types";

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ categories: Category[] }>("/api/categories");
      setCategories(data.categories);
    } catch {
      setError("Bo'limlarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function create(): Promise<void> {
    const name = newName.trim();
    const slug = newSlug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name || !slug) {
      setError("Nom va slug bo&apos;sh bo&apos;lishi mumkin emas");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<{ category: Category }>("/api/admin/categories", {
        method: "POST",
        body: { name, slug },
      });
      setNewName("");
      setNewSlug("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bo&apos;lim yaratilmadi");
    } finally {
      setBusy(false);
    }
  }

  async function update(cat: Category): Promise<void> {
    const name = editName.trim();
    const slug = editSlug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name || !slug) {
      setError("Nom va slug bo&apos;sh bo&apos;lishi mumkin emas");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<{ category: Category }>(`/api/admin/categories/${cat.id}`, {
        method: "PATCH",
        body: { name, slug },
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bo&apos;lim tahrirlanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(cat: Category): Promise<void> {
    if (!window.confirm(`"${cat.name}" bo&apos;limini o&apos;chirishni tasdiqlaysizmi?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/categories/${cat.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bo&apos;lim o&apos;chirilmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Bo&apos;limlar (Kategoriyalar)"
        subtitle="Sayt bo&apos;limlarini qo&apos;shish, tahrirlash va o&apos;chirish."
      />

      <AdminCard className="p-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Yangi bo&apos;lim qo&apos;shish</h3>
        <div className="flex flex-wrap gap-3">
          <AdminInput
            placeholder="Nom (masalan: Falsafa)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="max-w-xs"
          />
          <AdminInput
            placeholder="Slug (masalan: falsafa)"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
            className="max-w-xs"
          />
          <AdminButton variant="success" disabled={busy} onClick={create}>
            Qo&apos;shish
          </AdminButton>
        </div>
      </AdminCard>

      {error && <ErrorNote text={error} />}
      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}

      {!busy && categories.length === 0 && <EmptyState text="Bo&apos;limlar topilmadi." />}

      <AdminCard className="overflow-x-auto p-0">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Iqtiboslar soni</th>
              <th className="px-4 py-3 text-right">Harakatlar</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr
                key={cat.id}
                className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                  editingId === cat.id ? "bg-blue-50 dark:bg-blue-950/30" : ""
                }`}
              >
                <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">{cat.id.slice(0, 8)}</td>
                <td className="px-4 py-3">
                  {editingId === cat.id ? (
                    <AdminInput
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full"
                      autoFocus
                    />
                  ) : (
                    <span className="font-medium text-slate-900 dark:text-white">{cat.name}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {editingId === cat.id ? (
                    <AdminInput
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                      className="w-full"
                    />
                  ) : (
                    <span className="font-mono text-slate-700 dark:text-slate-300">{cat.slug}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  <Badge tone="blue">{cat.quoteCount ?? 0} ta</Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {editingId === cat.id ? (
                      <>
                        <AdminButton variant="success" disabled={busy} onClick={() => update(cat)}>
                          Saqlash
                        </AdminButton>
                        <AdminButton variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                          Bekor
                        </AdminButton>
                      </>
                    ) : (
                      <>
                        <AdminButton variant="slate" disabled={busy} onClick={() => { setEditName(cat.name); setEditSlug(cat.slug); setEditingId(cat.id); }}>
                          Tahrirlash
                        </AdminButton>
                        <AdminButton variant="danger" disabled={busy} onClick={() => remove(cat)}>
                          O&apos;chirish
                        </AdminButton>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}