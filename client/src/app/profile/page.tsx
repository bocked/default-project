"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { QuoteCard } from "@/components/QuoteCard";
import { QuoteForm } from "@/components/QuoteForm";
import { isPremiumActive, formatPremiumExpiry } from "@/lib/premium";
import { useToast } from "@/components/ToastProvider";
import type { Category, Quote, Quiz, QuizResultSummary, User } from "@/lib/types";

type ProfileTab = "quotes" | "tests" | "liked" | "settings";

const TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "quotes", label: "Iqtiboslarim" },
  { id: "tests", label: "Testlarim" },
  { id: "liked", label: "Saqlanganlar" },
  { id: "settings", label: "Sozlamalar" },
];

export default function ProfilePage() {
  const { user, loading, refresh } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<ProfileTab>("quotes");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // If a SUPER_ADMIN approved this account elsewhere, the cached session is
  // stale until refetched — refresh once on mount so posting unlocks at once.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading || !user) {
    return <p className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">Yuklanmoqda...</p>;
  }

  const displayName = user.nickname ? `@${user.nickname}` : user.name ?? "Mening profilim";

  return (
    <div className="space-y-6">
      <section className="flex items-center gap-4">
        <Avatar
          url={user.avatarUrl}
          name={user.nickname ?? user.name ?? user.email}
          size={64}
          className="border border-slate-200 dark:border-slate-700"
        />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-slate-900 dark:text-white">{displayName}</h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {user.email ?? user.telegramUsername ?? "Telegram foydalanuvchisi"}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div key={tab} className="space-y-6">
        {tab === "quotes" && <QuotesTab user={user} />}
        {tab === "tests" && <TestsTab />}
        {tab === "liked" && <LikedTab />}
        {tab === "settings" && <SettingsTab user={user} onSaved={refresh} />}
      </div>
    </div>
  );
}

function QuotesTab({ user }: { user: User }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<{ quotes: Quote[] }>("/api/quotes/mine").catch(() => ({ quotes: [] as Quote[] })),
      api<{ categories: Category[] }>("/api/categories").catch(() => ({ categories: [] as Category[] })),
    ]).then(([q, c]) => {
      if (cancelled) return;
      setQuotes(q.quotes);
      setCategories(c.categories);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingCount = quotes.filter((q) => q.status === "PENDING").length;

  // Mirrors the server's profileCanPost: anyone verified, VIP, manually
  // approved by a SUPER_ADMIN, or holding an admin role can post.
  const canPost =
    user.emailVerified ||
    user.phoneVerified ||
    user.isSuperApproved ||
    user.role === "ADMIN" ||
    user.role === "SUPER_ADMIN" ||
    isPremiumActive(user);

  function handleCreated(quote: Quote): void {
    setQuotes((prev) => [quote, ...prev]);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        {pendingCount} ta iqtibos moderatsiyada
      </p>

      {canPost && categories.length > 0 && <QuoteForm categories={categories} onCreated={handleCreated} />}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Mening iqtiboslarim</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">{quotes.length} ta</span>
        </div>
        {quotes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Hali iqtibos qo&apos;shmagansiz. Iqtiboslarim yorlig&apos;idagi forma orqali birinchi iqtibosingizni yuboring.
            </p>
          </div>
        ) : (
          quotes.map((quote) => <QuoteCard key={quote.id} quote={quote} showStatus />)
        )}
      </section>
    </div>
  );
}

function TestsTab() {
  const [mine, setMine] = useState<Quiz[]>([]);
  const [results, setResults] = useState<QuizResultSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api<{ quizzes: Quiz[] }>("/api/quizzes/mine").catch(() => ({ quizzes: [] as Quiz[] })),
      api<{ results: QuizResultSummary[] }>("/api/quizzes/mine/results").catch(() => ({ results: [] as QuizResultSummary[] })),
    ]).then(([m, r]) => {
      if (cancelled) return;
      setMine(m.quizzes);
      setResults(r.results);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Mening testlarim</h2>
        <Link
          href="/tests/create"
          className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
        >
          Yangi test yaratish
        </Link>
      </div>

      {mine.length === 0 && results.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Hali testlarisiz yo&apos;q. Yangi test yaratish tugmasini bosing va bilimingizni sinab ko&apos;ring.
          </p>
        </div>
      ) : (
        <>
          {mine.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Yaratgan testlarim
              </h3>
              {mine.map((quiz) => (
                <QuizRow key={quiz.id} quiz={quiz} />
              ))}
            </section>
          )}

          {results.length > 0 && (
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Natijalarim
              </h3>
              {results.map((r) => (
                <ResultRow key={`${r.quizId}-${r.updatedAt}`} result={r} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

const quizStatusStyles: Record<Quiz["status"], { label: string; className: string }> = {
  PENDING: { label: "Kutilmoqda", className: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  APPROVED: { label: "Tasdiqlangan", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" },
  REJECTED: { label: "Rad etilgan", className: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300" },
};

function QuizRow({ quiz }: { quiz: Quiz }) {
  const status = quizStatusStyles[quiz.status] ?? quizStatusStyles.PENDING;
  const body = (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{quiz.title}</h4>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {quiz.questionCount} ta savol · {quiz.attemptCount} ta urinish
          </p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${status.className}`}>{status.label}</span>
      </div>
      {quiz.status === "REJECTED" && (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">Sabab: {quiz.description ?? "rad etildi"}</p>
      )}
    </div>
  );
  return quiz.status === "APPROVED" ? <Link href={`/tests?id=${encodeURIComponent(quiz.id)}`}>{body}</Link> : body;
}

function ResultRow({ result }: { result: QuizResultSummary }) {
  const percent = result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
  return (
    <Link
      href={`/tests?id=${encodeURIComponent(result.quizId)}`}
      className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-600 dark:shadow-none"
    >
      <span
        className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-bold ${
          percent >= 60
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
            : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
        }`}
      >
        {percent}%
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{result.title}</h4>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {result.score}/{result.total} to&apos;g&apos;ri · {new Date(result.updatedAt).toLocaleDateString("uz-UZ")}
        </p>
      </div>
    </Link>
  );
}

function LikedTab() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void api<{ quotes: Quote[] }>("/api/quotes/mine/likes")
      .then((d) => {
        if (cancelled) return;
        setQuotes(d.quotes);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setQuotes([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Yuklanmoqda...</p>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Saqlangan iqtiboslar</h2>
        <span className="text-xs text-slate-400 dark:text-slate-500">{quotes.length} ta</span>
      </div>
      {quotes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Yoqtirgan iqtiboslaringiz shu yerda saqlanadi. Iqtibos kartochkasidagi yurakcha orqali saqlang.
          </p>
        </div>
      ) : (
        quotes.map((quote) => <QuoteCard key={quote.id} quote={quote} />)
      )}
    </section>
  );
}

function SettingsTab({ user, onSaved }: { user: User; onSaved: () => Promise<User | null> }) {
  const toast = useToast();
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [tgSession, setTgSession] = useState<{ botUsername: string; start: string } | null>(null);
  const [tgCode, setTgCode] = useState("");
  const [tgBusy, setTgBusy] = useState(false);
  const [tgMessage, setTgMessage] = useState<string | null>(null);
  const [emailOtp, setEmailOtp] = useState("");
  const [emailOtpBusy, setEmailOtpBusy] = useState(false);
  const [emailOtpMessage, setEmailOtpMessage] = useState<string | null>(null);

  const canPost =
    user.emailVerified ||
    user.phoneVerified ||
    user.isSuperApproved ||
    user.role === "ADMIN" ||
    user.role === "SUPER_ADMIN" ||
    isPremiumActive(user);

  async function resendVerification(): Promise<void> {
    if (!user?.email) return;
    setResending(true);
    setResendMessage(null);
    try {
      await api<{ ok: boolean }>("/api/auth/resend-verification", {
        method: "POST",
        body: { email: user.email },
      });
      setResendMessage("Tasdiqlash havolasi emailingizga yuborildi.");
      toast.success("Kod pochtangizga yuborildi!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Xatolik yuz berdi";
      setResendMessage(message);
      toast.error(message);
    } finally {
      setResending(false);
    }
  }

  async function submitEmailOtp(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!user?.email || !/^\d{6}$/.test(emailOtp)) return;
    setEmailOtpBusy(true);
    setEmailOtpMessage(null);
    try {
      await api<{ ok: boolean }>("/api/auth/verify-email", {
        method: "POST",
        body: { email: user.email, code: emailOtp },
      });
      setEmailOtp("");
      await onSaved();
    } catch (err) {
      setEmailOtpMessage(err instanceof Error ? err.message : "Kod noto'g'ri");
    } finally {
      setEmailOtpBusy(false);
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
      await onSaved();
    } catch (err) {
      setTgMessage(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setTgBusy(false);
    }
  }

  const tgLink = tgSession ? `https://t.me/${tgSession.botUsername}?start=${tgSession.start}` : null;

  async function copyTgLink(): Promise<void> {
    if (!tgLink) return;
    try {
      await navigator.clipboard.writeText(tgLink);
      setTgMessage("Havola nusxalandi");
    } catch {
      setTgMessage("Havolani nusxalab bo'lmadi, qo'lda ko'chiring");
    }
  }

  return (
    <div className="space-y-6">
      {user.quickLogin ? (
        <UpgradeForm user={user} onSaved={onSaved} />
      ) : (
        !user.emailVerified &&
        user.email && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Email hali tasdiqlanmagan</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {user.phoneVerified
                    ? "Profil Telegram orqali faollashtirilgan, email tasdiqlash hali kutilmoqda."
                    : canPost
                      ? "Iqtibos joylashingiz mumkin — email/Telegram tasdiqlash profilni to'liq qilish uchun eslatib turadi."
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

            <form onSubmit={submitEmailOtp} className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1">
                <label className="mb-1 block text-xs font-medium text-amber-800 dark:text-amber-300">
                  Emaildagi 6 xonali kod
                </label>
                <input
                  value={emailOtp}
                  onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  pattern="\d{6}"
                  required
                  maxLength={6}
                  placeholder="000000"
                  className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm tracking-[0.3em] outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-amber-600 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={emailOtpBusy || !/^\d{6}$/.test(emailOtp)}
                className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50 dark:hover:bg-emerald-500"
              >
                {emailOtpBusy ? "Tekshirilmoqda..." : "Kodni tasdiqlash"}
              </button>
            </form>
            {emailOtpMessage && (
              <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">{emailOtpMessage}</p>
            )}

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

              {tgSession && tgLink && (
                <div className="mt-3 space-y-3">
                  <div className="rounded-xl border border-amber-300 bg-amber-100/60 px-3 py-2.5 dark:border-amber-600 dark:bg-amber-900/20">
                    <p className="mb-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                      Botda ushbu unikal havola orqali start bosing (yangi havola olish uchun pastdagi tugmani bosing):
                    </p>
                    <a
                      href={tgLink}
                      target="_blank"
                      rel="noreferrer"
                      className="block break-all text-xs font-semibold text-blue-700 underline dark:text-blue-400"
                    >
                      {tgLink}
                    </a>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={copyTgLink}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
                      >
                        Havolani nusxalash
                      </button>
                      <button
                        type="button"
                        onClick={startTelegramVerify}
                        disabled={tgBusy}
                        className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:border-amber-600 dark:text-amber-300 dark:hover:bg-amber-900/30"
                      >
                        {tgBusy ? "Yuborilmoqda..." : "Yangi unikal havola olish"}
                      </button>
                    </div>
                  </div>

                  <form onSubmit={submitTelegramCode} className="flex items-end gap-2">
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
                </div>
              )}

              {tgMessage && <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">{tgMessage}</p>}
            </div>
          </div>
        )
      )}

      <ProfileSettings user={user} onSaved={onSaved} />

      <PremiumCard user={user} onSaved={onSaved} />
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
  const [customWatermark, setCustomWatermark] = useState(user.customWatermark ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? "");
  const [profileSaved, setProfileSaved] = useState(false);
  const premium = isPremiumActive(user);

  async function saveProfile(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    await api<{ user: User }>("/api/auth/me", {
      method: "PATCH",
      body: { name, nickname, avatarUrl, ...(premium ? { customWatermark } : {}) },
    });
    await onSaved();
    setProfileSaved(true);
    window.setTimeout(() => setProfileSaved(false), 2500);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Profil sozlamalari</h2>
      <form onSubmit={saveProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <div className="flex items-center gap-4">
            <Avatar url={avatarUrl || null} name={nickname || name || user.email} size={56} />
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Rasm havolasi (URL) — http(s) bilan boshlanishi kerak
              </label>
              <input
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                maxLength={500}
                placeholder="https://example.com/avatar.jpg"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
              />
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Bo&apos;sh qoldirilsa, avatar o&apos;chiriladi va nick dan bosh harflar ko&apos;rinadi.
              </p>
            </div>
          </div>
        </div>
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
        {premium && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Rasm watermarki (VIP) — Telegram kanalingiz yoki ismingiz
            </label>
            <input
              value={customWatermark}
              onChange={(e) => setCustomWatermark(e.target.value)}
              maxLength={50}
              placeholder="masalan: @kanalim"
              className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:border-amber-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-amber-500"
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Rasm sifatida ulashishda pastdagi &quot;yerlikoglon.uz&quot; o&apos;rniga shu matn chiqadi.
            </p>
          </div>
        )}
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

/** VIP status card: shows active-subscription info, or promotes the three
 *  exclusive benefits to everyone else. */
function PremiumCard({ user, onSaved }: { user: User; onSaved: () => Promise<User | null> }) {
  const premium = isPremiumActive(user);

  if (premium) {
    return (
      <section
        className="rounded-2xl border border-amber-300 p-5 shadow-sm dark:border-amber-700"
        style={{ background: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div>
              <h2 className="text-sm font-semibold text-amber-950">VIP a&apos;zolik faol</h2>
              <p className="text-xs text-amber-800">
                {formatPremiumExpiry(user)} · iqtiboslaringiz uchun eksklyuziv post uslubi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onSaved}
            className="rounded-xl border border-amber-400 bg-white/70 px-3.5 py-2 text-xs font-semibold text-amber-900 transition hover:bg-white"
          >
            Yangilash
          </button>
        </div>

        <ul className="mt-4 grid gap-2 text-xs text-amber-900 sm:grid-cols-3">
          <li className="rounded-xl bg-white/70 px-3 py-2.5">🖼 O&apos;z watermarkingiz (kanal/ism)</li>
          <li className="rounded-xl bg-white/70 px-3 py-2.5">🎨 5+ eksklyuziv fon va premium shriftlar</li>
          <li className="rounded-xl bg-white/70 px-3 py-2.5">🎛 Post uslubini sozlash (shrift, rang, ramka, tekstura)</li>
        </ul>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-amber-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-amber-950/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">VIP a&apos;zolik</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Eksklyuziv imkoniyatlardan foydalaning — status admin panelida beriladi.
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-3">
        <li className="rounded-xl bg-white/70 px-3 py-2.5 dark:bg-white/5">🖼 Rasmda o&apos;z telegram kanalingiz/ismingiz</li>
        <li className="rounded-xl bg-white/70 px-3 py-2.5 dark:bg-white/5">🎨 5+ eksklyuziv fon va premium shriftlar</li>
        <li className="rounded-xl bg-white/70 px-3 py-2.5 dark:bg-white/5">🎛 Post uslubi — eksklyuziv post kartochka dizayni</li>
      </ul>
    </section>
  );
}

/** Completes a Telegram quick-login account into a full registration. Quick
 *  users may like quotes but cannot post until they upgrade and verify. */
function UpgradeForm({ user, onSaved }: { user: User; onSaved: () => Promise<User | null> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(user.name ?? "");
  const [nickname, setNickname] = useState(user.nickname ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api<{ token: string; user: User }>("/api/auth/upgrade", {
        method: "POST",
        body: { email, password, name, nickname },
      });
      await onSaved();
      setMessage("Profil to'liq ro'yxatdan o'tkazildi. Emailni tasdiqlash havolasini tekshiring.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saqlashda xatolik yuz berdi");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm dark:border-blue-500/30 dark:bg-blue-950/30">
      <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-300">
        Ro&apos;yxatdan o&apos;tishni yakunlang
      </h2>
      <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
        Telegram orqali tezkor kirishda iqtiboslarni yoqtirishingiz mumkin. Iqtibos joylash va to&apos;liq huquqlar
        uchun email va parol qo&apos;shing, so&apos;ngra emailingizni tasdiqlang.
      </p>
      <form onSubmit={upgrade} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-blue-900 dark:text-blue-300">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-blue-900 dark:text-blue-300">Parol</label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-blue-900 dark:text-blue-300">
            Haqiqiy ism (faqat adminlarga ko&apos;rinadi)
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-blue-900 dark:text-blue-300">Nickname (sahifada ko&apos;rinadi)</label>
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500"
          />
        </div>
        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
          >
            {saving ? "Saqlanmoqda..." : "Ro&apos;yxatdan o&apos;tishni yakunlash"}
          </button>
          {message && <span className="ml-3 text-sm text-emerald-600 dark:text-emerald-400">{message}</span>}
          {error && <span className="ml-3 text-sm text-rose-600 dark:text-rose-400">{error}</span>}
        </div>
      </form>
    </section>
  );
}