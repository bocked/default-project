"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await api<{ ok: boolean }>("/api/auth/forgot-password", { method: "POST", body: { email } });
      setMessage("Agar bu email ro'yxatdan o'tgan bo'lsa, parolni tiklash havolasi yuborildi.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-8 w-full max-w-sm">
      <div className="animate-slide-up rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Parolni tiklash</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Email manzilingizni kiriting — unga parolni tiklash havolasi yuboriladi.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900"
            />
          </div>

          {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
          >
            {submitting ? "Yuborilmoqda..." : "Havolani yuborish"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Kirish sahifasiga qaytish
          </Link>
        </p>
      </div>
    </div>
  );
}
