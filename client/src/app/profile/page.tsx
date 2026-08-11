"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { QuoteCard } from "@/components/QuoteCard";
import { QuoteForm } from "@/components/QuoteForm";
import type { Category, Quote, User } from "@/lib/types";

export default function ProfilePage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [tgSession, setTgSession] = useState<{ botUsername: string; start: string } | null>(null);
  const [tgCode, setTgCode] = useState("");
  const [tgBusy, setTgBusy] = useState(false);
  const [tgMessage, setTgMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void api<{ quotes: Quote[] }>("/api/quotes/mine")
      .then((data) => setQuotes(data.quotes))
      .catch(() => setQuotes([]));
    void api<{ categories: Category[] }>("/api/categories")
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
  }, [user]);

  async function resendVerification(): Promise<void> {
    if (!user) return;
    setResending(true);
    setResendMessage(null);
    try {
      await api<{ ok: boolean }>("/api/auth/resend-verification", {
        method: "POST",
        body: { email: user.email },
      });
      setResendMessage("Tasdiqlash havolasi emailingizga yuborildi.");
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setResending(false);
    }
  }

  async function startTelegramVerify(): Promise<void> {
    if (!user) return;
    setTgBusy(true);
    setTgMessage(null);
    try {
      const data = await api<{ botUsername: string; start: string }>("/api/auth/telegram/session", {
        method: "POST",
      });
      setTgSession(data);
      window.open(`https://t.me/${data.botUsername}?start=${data.start}`, "_blank");
    } catch (err) {
      setTgMessage(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setTgBusy(false);
    }
  }

  async function submitTelegramCode(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!user) return;
    setTgBusy(true);
    setTgMessage(null);
    try {
      await api<{ ok: boolean }>("/api/auth/telegram/verify", {
        method: "POST",
        body: { code: tgCode },
      });
      setTgCode("");
      setTgSession(null);
      await refresh();
    } catch (err) {
      setTgMessage(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setTgBusy(false);
    }
  }

  function handleCreated(quote: Quote): void {
    setQuotes((prev) => [quote, ...prev]);
  }

  if (loading || !user) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>;
  }

  const pendingCount = quotes.filter((q) => q.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Mening profilim</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {user.email} · {pendingCount} ta iqtibos moderatsiyada
        </p>
      </section>

      {!user.emailVerified && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Email hali tasdiqlanmagan</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {user.phoneVerified
                  ? "Profil Telegram orqali faollashtirilgan, email tasdiqlash hali kutilmoqda."
                  : "Iqtibos qo'shishdan oldin emailingizni tasdiqlang yoki Telegram orqali faollashtiring."}
              </p>
            </div>
            <button
              type="button"
              onClick={resendVerification}
              disabled={resending}
              className="rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50 dark:hover:bg-amber-500"
            >
              {resending ? "Yuborilmoqda..." : "Tasdiqlash havolasini qayta yuborish"}
            </button>
          </div>
          {resendMessage && <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">{resendMessage}</p>}

          <div className="mt-3 border-t border-amber-200 pt-3 dark:border-amber-500/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Telegram orqali tasdiqlash</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Botdan telefon raqamingizni yuborib, undan olingan kod bilan profilni faollashtiring.
                </p>
              </div>
              {!user.phoneVerified && (
                <button
                  type="button"
                  onClick={startTelegramVerify}
                  disabled={tgBusy}
                  className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
                >
                  {tgBusy ? "Yuborilmoqda..." : "Telegram orqali tasdiqlash"}
                </button>
              )}
            </div>

            {tgSession && (
              <form onSubmit={submitTelegramCode} className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-amber-800 dark:text-amber-300">
                    Botdan olgan 6 xonali kod
                  </label>
                  <input
                    value={tgCode}
                    onChange={(e) => setTgCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    inputMode="numeric"
                    pattern="\d{6}"
                    required
                    maxLength={6}
                    placeholder="000000"
                    className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-amber-600 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={tgBusy}
                  className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:hover:bg-emerald-500"
                >
                  {tgBusy ? "Tekshirilmoqda..." : "Tasdiqlash"}
                </button>
              </form>
            )}

            {tgMessage && <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">{tgMessage}</p>}
          </div>
        </div>
      )}

      <ProfileSettings key={user.id} user={user} onSaved={refresh} />

      {(user.emailVerified || user.phoneVerified) && categories.length > 0 && (
        <QuoteForm categories={categories} onCreated={handleCreated} />
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Mening iqtiboslarim</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">{quotes.length} ta</span>
        </div>
        {quotes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Hali iqtibos qo&apos;shmagansiz. Yuqoridagi forma orqali birinchi iqtibosingizni yuboring.
            </p>
          </div>
        ) : (
          quotes.map((quote) => <QuoteCard key={quote.id} quote={quote} showStatus />)
        )}
      </section>
    </div>
  );
}

function ProfileSettings({
  user,
  onSaved,
}: {
  user: User;
  onSaved: () => Promise<User | null>;
}) {
  const [name, setName] = useState(user.name ?? "");
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [profileSaved, setProfileSaved] = useState(false);

  async function saveProfile(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    await api<{ user: User }>("/api/auth/me", {
      method: "PATCH",
      body: { name, nickname },
    });
    await onSaved();
    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 2500);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Profil sozlamalari</h2>
      <form onSubmit={saveProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
            Haqiqiy ism (faqat adminlarga ko&apos;rinadi)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Nickname (sahifada ko&apos;rinadi)</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            Saqlash
          </button>
          {profileSaved && <span className="ml-3 text-sm text-emerald-600 dark:text-emerald-400">Saqlandi ✓</span>}
        </div>
      </form>
    </section>
  );
}
