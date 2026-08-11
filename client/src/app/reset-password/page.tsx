"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  const [token] = useState<string | null>(
    () => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null)
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!token) {
      setError("Tiklash havolasi topilmadi. Emaildagi havoladan foydalaning.");
      return;
    }
    if (password !== confirm) {
      setError("Parollar bir-biriga mos kelmaydi");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api<{ ok: boolean }>("/api/auth/reset-password", {
        method: "POST",
        body: { token, password },
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-sm">
      <div className="animate-slide-up rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
        {done ? (
          <>
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl dark:bg-emerald-500/20">
              ✓
            </div>
            <h1 className="text-center text-lg font-semibold text-slate-900 dark:text-white">Parol tiklandi!</h1>
            <p className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
              Endi yangi parol bilan kirishingiz mumkin.
            </p>
            <Link
              href="/login"
              className="mt-4 block rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
            >
              Kirish
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Yangi parol o&apos;rnatish</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kamida 8 belgidan iborat yangi parol kiriting.</p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Yangi parol
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Parolni takrorlang
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
                />
              </div>

              {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !token}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
              >
                {submitting ? "Saqlanmoqda..." : "Parolni saqlash"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
