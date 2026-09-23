"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Phase = "checking" | "otp" | "success" | "error";

export default function VerifyEmailPage() {
  const { refresh, user } = useAuth();
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function verify(): Promise<void> {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      if (!token) {
        if (!cancelled) setPhase("otp");
        return;
      }
      try {
        await api<{ ok: boolean }>("/api/auth/verify-email", { method: "POST", body: { token } });
        await refresh();
        if (!cancelled) setPhase("success");
      } catch (err) {
        if (!cancelled) {
          setPhase("error");
          setMessage(err instanceof Error ? err.message : "Tasdiqlash amalga oshmadi");
        }
      }
    }
    void verify();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function submitOtp(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    setSubmitting(true);
    setMessage("");
    try {
      await api<{ ok: boolean }>("/api/auth/verify-email", { method: "POST", body: { email, code } });
      await refresh();
      setPhase("success");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Tasdiqlash amalga oshmadi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-sm px-4 sm:px-0">
      <div className="animate-slide-up rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
        {phase === "checking" && <p className="text-sm text-slate-500 dark:text-slate-400">Email tasdiqlanmoqda...</p>}

        {phase === "otp" && (
          <>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Emailni tasdiqlash</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Emailingizga yuborilgan 6 xonali kodni kiriting (kod 1 soat amal qiladi).
            </p>
            <form onSubmit={submitOtp} className="mt-4 space-y-3 text-left">
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
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">6 xonali kod</label>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  pattern="\d{6}"
                  required
                  maxLength={6}
                  placeholder="000000"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-lg tracking-[0.4em] outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
                />
              </div>
              {message && <p className="text-sm text-rose-600 dark:text-rose-400">{message}</p>}
              <button
                type="submit"
                disabled={submitting || !/^\d{6}$/.test(code)}
                className="w-full min-h-[44px] rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
              >
                {submitting ? "Tasdiqlanmoqda..." : "Tasdiqlash"}
              </button>
            </form>
          </>
        )}

        {phase === "success" && (
          <>
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-500/20">
              ✓
            </div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Email tasdiqlandi!</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Endi iqtibos qo&apos;shishingiz mumkin.</p>
            <Link
              href="/profile"
              className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
            >
              Profilga o&apos;tish
            </Link>
          </>
        )}

        {phase === "error" && (
          <>
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-2xl dark:bg-rose-500/20">
              !
            </div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Xatolik</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
            >
              Bosh sahifaga qaytish
            </Link>
          </>
        )}
      </div>
    </div>
  );
}