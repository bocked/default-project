"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";
import { TelegramPost } from "@/components/TelegramPost";
import type { QuoteStatus } from "@/lib/types";

interface AdminQuote {
  id: string;
  text: string;
  displayAuthor: string;
  anonymous: boolean;
  telegramUrl: string | null;
  status: QuoteStatus;
  rejectionReason: string | null;
  createdAt: string;
  category: { id: string; name: string; slug: string };
  tags: { id: string; name: string; slug: string }[];
  user: {
    id: string;
    email: string;
    name: string | null;
    nickname: string | null;
    telegramId: string | null;
    phoneNumber: string | null;
  };
}

interface Stats {
  bans: number;
  online: number;
  quotes: { pending: number; approved: number; rejected: number };
  users: number;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  role: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  telegramId: string | null;
  phoneNumber: string | null;
  createdAt: string;
}

const TABS: QuoteStatus[] = ["PENDING", "APPROVED", "REJECTED"];

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<Stats | null>(null);
  const [tab, setTab] = useState<QuoteStatus | "USERS">("PENDING");
  const [quotes, setQuotes] = useState<AdminQuote[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!isAdmin) return;
    void api<Stats>("/api/admin/stats")
      .then(setStats)
      .catch(() => setStats(null));
  }, [isAdmin]);

  const loadQuotes = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ quotes: AdminQuote[] }>(`/api/admin/quotes?status=${tab}`);
      setQuotes(data.quotes);
    } catch {
      setError("Iqtiboslarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, [tab]);

  const loadUsers = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ users: AdminUser[] }>("/api/admin/users");
      setUsers(data.users);
    } catch {
      setError("Foydalanuvchilarni yuklab bo'lmadi");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const t = window.setTimeout(() => void (tab === "USERS" ? loadUsers() : loadQuotes()), 0);
    return () => window.clearTimeout(t);
  }, [isAdmin, tab, loadUsers, loadQuotes]);

  async function refreshAll(): Promise<void> {
    if (tab === "USERS") {
      const u = await api<{ users: AdminUser[] }>("/api/admin/users").catch(() => null);
      if (u) setUsers(u.users);
      return;
    }
    const [s, q] = await Promise.all([
      api<Stats>("/api/admin/stats").catch(() => null),
      api<{ quotes: AdminQuote[] }>(`/api/admin/quotes?status=${tab}`).catch(() => null),
    ]);
    if (s) setStats(s);
    if (q) setQuotes(q.quotes);
  }

  async function approve(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/quotes/${id}/approve`, { method: "POST" });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tasdiqlash amalga oshmadi");
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string): Promise<void> {
    const reason = window.prompt("Rad etish sababini kiriting (foydalanuvchiga ko'rinadi):");
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("Sabab bo'sh bo'lishi mumkin emas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>(`/api/admin/quotes/${id}/reject`, {
        method: "POST",
        body: { reason: reason.trim() },
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rad etish amalga oshmadi");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>;
  }

  if (!user || !isAdmin) {
    return (
      <div className="mx-auto mt-8 w-full max-w-sm">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-500/30 dark:bg-rose-950/30">
          <h1 className="text-lg font-semibold text-rose-800 dark:text-rose-300">Ruxsat yo&apos;q</h1>
          <p className="mt-1 text-sm text-rose-700 dark:text-rose-400">Bu sahifa faqat adminlar uchun.</p>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Kutilmoqda", value: stats?.quotes.pending ?? 0 },
    { label: "Tasdiqlangan", value: stats?.quotes.approved ?? 0 },
    { label: "Rad etilgan", value: stats?.quotes.rejected ?? 0 },
    { label: "Foydalanuvchilar", value: stats?.users ?? 0 },
  ];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin panel</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Iqtiboslarni moderatsiya qilish va statistika.</p>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
          >
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{card.value}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              tab === t
                ? "rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white"
                : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
            }
          >
            {t === "PENDING" ? "Kutilmoqda" : t === "APPROVED" ? "Tasdiqlangan" : "Rad etilgan"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTab("USERS")}
          className={
            tab === "USERS"
              ? "rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white"
              : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
          }
        >
          Foydalanuvchilar
        </button>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
      )}

      {busy && !error && <p className="text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>}

      {tab !== "USERS" && !busy && quotes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">Bu bo&apos;limda iqtiboslar yo&apos;q.</p>
        </div>
      )}

      {tab === "USERS" && !busy && users.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">Foydalanuvchilar yo&apos;q.</p>
        </div>
      )}

      {tab === "USERS" && (
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{u.email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[u.name, u.nickname ? `@${u.nickname}` : null].filter(Boolean).join(" · ") || "Ism kiritilmagan"}
                  </p>
                </div>
                <span
                  className={
                    u.role === "ADMIN"
                      ? "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"
                      : "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }
                >
                  {u.role === "ADMIN" ? "Admin" : "Foydalanuvchi"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Email:{" "}
                  <span className={u.emailVerified ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}>
                    {u.emailVerified ? "tasdiqlangan" : "tasdiqlanmagan"}
                  </span>
                </span>
                <span>
                  Telegram:{" "}
                  <span className={u.phoneVerified ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}>
                    {u.phoneVerified ? "faollashtirilgan" : "faollashtirilmagan"}
                  </span>
                </span>
                <span>Telegram ID: {u.telegramId ?? "—"}</span>
                <span>Telefon: {u.phoneNumber ?? "—"}</span>
                <span>Ro&apos;yxat: {new Date(u.createdAt).toLocaleDateString("uz-UZ")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab !== "USERS" && (
        <div className="space-y-4">
          {quotes.map((quote) => (
            <div
              key={quote.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <StatusBadge status={quote.status} />
                <span>{quote.category.name}</span>
                <span>{new Date(quote.createdAt).toLocaleDateString("uz-UZ")}</span>
              </div>

              <blockquote className="mt-3 font-serif text-lg leading-relaxed text-slate-800 dark:text-slate-100">
                &ldquo;{quote.text}&rdquo;
              </blockquote>

              {quote.telegramUrl && <TelegramPost url={quote.telegramUrl} />}

              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Muallif: <span className="font-medium text-slate-700 dark:text-slate-300">{quote.displayAuthor}</span>
                {quote.anonymous && <span className="ml-2 text-slate-400 dark:text-slate-500">(anonim)</span>}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Egasi: <span className="text-slate-700 dark:text-slate-300">{quote.user.email}</span>
                {quote.user.name && <span> · {quote.user.name}</span>}
                {quote.user.nickname && <span> · @{quote.user.nickname}</span>}
                {quote.user.phoneNumber && <span> · {quote.user.phoneNumber}</span>}
              </div>

              {quote.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {quote.tags.map((tag) => (
                    <span key={tag.id} className="text-xs text-blue-600 dark:text-blue-400">
                      #{tag.name}
                    </span>
                  ))}
                </div>
              )}

              {quote.status === "REJECTED" && quote.rejectionReason && (
                <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                  Rad etish sababi: {quote.rejectionReason}
                </p>
              )}

              {quote.status === "PENDING" && (
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => approve(quote.id)}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:hover:bg-emerald-500"
                  >
                    Ruxsat berish
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => reject(quote.id)}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50 dark:hover:bg-rose-500"
                  >
                    Rad etish
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
