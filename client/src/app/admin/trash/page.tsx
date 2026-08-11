"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  AdminButton,
  AdminCard,
  Badge,
  EmptyState,
  ErrorNote,
  PageTitle,
} from "@/components/admin-ui";
import type { AdminQuote, AdminUser, QuoteStatus } from "@/lib/types";

const statusTone: Record<QuoteStatus, "amber" | "emerald" | "rose"> = {
  PENDING: "amber",
  APPROVED: "emerald",
  REJECTED: "rose",
};

export default function AdminTrashPage() {
  const [quotes, setQuotes] = useState<AdminQuote[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [q, u] = await Promise.all([
        api<{ quotes: AdminQuote[] }>("/api/admin/quotes?deleted=1"),
        api<{ users: AdminUser[] }>("/api/admin/users?deleted=1"),
      ]);
      setQuotes(q.quotes);
      setUsers(u.users);
    } catch {
      setError("Arxivni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function restoreQuote(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/quotes/${id}/restore`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Iqtibos tiklanmadi");
    } finally {
      setBusy(false);
    }
  }

  async function restoreUser(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/users/${id}/restore`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Foydalanuvchi tiklanmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Arxiv" subtitle="O'chirilgan (soft delete) elementlar. Bu yerdan tiklash mumkin." />
      {error && <ErrorNote text={error} />}
      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
          Arxivdagi iqtiboslar ({quotes.length})
        </h2>
        {!busy && quotes.length === 0 && <EmptyState text="Arxivda iqtiboslar yo'q." />}
        <div className="space-y-3">
          {quotes.map((quote) => (
            <AdminCard key={quote.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <Badge tone={statusTone[quote.status]}>{quote.status}</Badge>
                    <span>{quote.category.name}</span>
                    <span>{new Date(quote.createdAt).toLocaleDateString("uz-UZ")}</span>
                  </div>
                  <blockquote className="mt-2 font-serif text-base text-slate-800 dark:text-slate-100">
                    &ldquo;{quote.text}&rdquo;
                  </blockquote>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Muallif: {quote.displayAuthor} · Egasi: {quote.user.email}
                  </p>
                </div>
                <AdminButton variant="success" disabled={busy} onClick={() => void restoreQuote(quote.id)}>
                  Tiklash
                </AdminButton>
              </div>
            </AdminCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
          Arxivdagi foydalanuvchilar ({users.length})
        </h2>
        {!busy && users.length === 0 && <EmptyState text="Arxivda foydalanuvchilar yo'q." />}
        <div className="space-y-3">
          {users.map((u) => (
            <AdminCard key={u.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900 dark:text-white">{u.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[u.name, u.nickname ? `@${u.nickname}` : null].filter(Boolean).join(" · ") || "Ism kiritilmagan"}
                  </p>
                </div>
                <AdminButton variant="success" disabled={busy} onClick={() => void restoreUser(u.id)}>
                  Tiklash
                </AdminButton>
              </div>
            </AdminCard>
          ))}
        </div>
      </section>
    </div>
  );
}
