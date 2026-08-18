"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

export default function LoginPage() {
  const { login, applyTelegramLogin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickStatus, setQuickStatus] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirishda xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  }

  async function quickLogin(): Promise<void> {
    setQuickBusy(true);
    setError(null);
    setManualLink(null);
    try {
      const session = await api<{ botUsername: string; sessionId: string }>("/api/auth/telegram/quick/session", {
        method: "POST",
      });
      const link = `https://t.me/${session.botUsername}?start=quick_${session.sessionId}`;
      const opened = window.open(link, "_blank", "noopener");
      if (!opened) setManualLink(link);
      setQuickStatus("Telegramda havolani oching va kirishni tasdiqlang...");
      const user = await applyTelegramLogin(session.sessionId);
      if (user.quickLogin) {
        setQuickStatus("Profilni to'liq to'ldirish tavsiya etiladi.");
      }
      router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tezkor kirishda xatolik yuz berdi");
      setQuickStatus(null);
    } finally {
      setQuickBusy(false);
    }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-sm px-4 sm:px-0">
      <div className="animate-slide-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none sm:p-6">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Kirish</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Hisobingizga kiring.</p>

        <button
          type="button"
          onClick={quickLogin}
          disabled={quickBusy}
          className="mt-5 w-full min-h-[44px] rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950"
        >
          {quickBusy ? "Kutilmoqda..." : "Telegram orqali tezkor kirish"}
        </button>

        {manualLink && (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Oyna ochilmadi.{" "}
            <a href={manualLink} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Shu yerga bosing
            </a>
          </p>
        )}
        {quickStatus && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{quickStatus}</p>}

        <div className="mt-4 flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          <span>yoki email bilan</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
        </div>

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Parol</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
            />
          </div>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
          >
            {submitting ? "Kirilmoqda..." : "Kirish"}
          </button>
        </form>

        <div className="mt-4 space-y-2 text-center text-sm">
          <Link href="/forgot-password" className="block text-slate-500 hover:text-blue-600 hover:underline dark:text-slate-400 dark:hover:text-blue-400">
            Parolni unutdingizmi?
          </Link>
          <p className="text-slate-500 dark:text-slate-400">
            Hisobingiz yo&apos;qmi?{" "}
            <Link href="/register" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Ro&apos;yxatdan o&apos;tish
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
