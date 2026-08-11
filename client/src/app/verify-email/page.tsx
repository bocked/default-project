"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Phase = "checking" | "success" | "error";

export default function VerifyEmailPage() {
  const { refresh } = useAuth();
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function verify(): Promise<void> {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      if (!token) {
        if (!cancelled) {
          setPhase("error");
          setMessage("Tasdiqlash havolasi topilmadi. Emaildagi havoladan foydalaning.");
        }
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

  return (
    <div className="mx-auto mt-8 w-full max-w-sm">
      <div className="animate-slide-up rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        {phase === "checking" && <p className="text-sm text-slate-500">Email tasdiqlanmoqda...</p>}

        {phase === "success" && (
          <>
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-2xl">✓</div>
            <h1 className="text-lg font-semibold text-slate-900">Email tasdiqlandi!</h1>
            <p className="mt-1 text-sm text-slate-500">Endi iqtibos qo&apos;shishingiz mumkin.</p>
            <Link
              href="/profile"
              className="mt-4 inline-block rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Profilga o&apos;tish
            </Link>
          </>
        )}

        {phase === "error" && (
          <>
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-rose-100 text-2xl">!</div>
            <h1 className="text-lg font-semibold text-slate-900">Xatolik</h1>
            <p className="mt-1 text-sm text-slate-500">{message}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              Bosh sahifaga qaytish
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
