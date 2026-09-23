"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TermsModal, type TermsView } from "@/components/TermsModal";

export default function LoginPage() {
  const { login, applyTelegramLogin } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [termsView, setTermsView] = useState<TermsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickStatus, setQuickStatus] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!accepted) {
      setError("Davom etish uchun Foydalanish shartlari, Maxfiylik va Cookie siyosatiga rozilik bering");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const me = await login(email, password);
      // If the terms were updated since the last consent, stay on this screen —
      // the TermsReAcceptGate overlay will ask for the new consent first.
      if (!me.termsRequired) router.push("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirishda xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  }

  async function quickLogin(): Promise<void> {
    if (!accepted) {
      setError("Davom etish uchun Foydalanish shartlari, Maxfiylik va Cookie siyosatiga rozilik bering");
      return;
    }
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
      if (!user.termsRequired) router.push("/profile");
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
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 py-3 pr-10 pl-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <label className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
            />
            <span>
              Saytdan foydalanish uchun{" "}
              <button type="button" onClick={() => setTermsView("terms")} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                Foydalanish shartlariga
              </button>
              ,{" "}
              <button type="button" onClick={() => setTermsView("privacy")} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                Maxfiylik siyosatiga
              </button>{" "}
              va{" "}
              <button type="button" onClick={() => setTermsView("cookies")} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                Cookie qoidalariga
              </button>{" "}
              roziman
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting || !accepted}
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

        {termsView !== null && <TermsModal open initialView={termsView} onClose={() => setTermsView(null)} />}
      </div>
    </div>
  );
}
