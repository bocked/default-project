"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { TermsModal, type TermsView } from "./TermsModal";
import type { User } from "@/lib/types";

/** Full-screen gate for accounts whose acceptedTermsVersion is outdated: the
 *  profile stays locked until the current terms are accepted again. */
export function TermsReAcceptGate() {
  const { user, loading, refresh, logout } = useAuth();

  if (loading || !user || !user.termsRequired) return null;

  // Keyed on the user + gate state so each new requirement gets fresh UI state.
  return (
    <TermsGate key={`${user.id}-${user.termsRequired}`} user={user} refresh={refresh} logout={logout} />
  );
}

function TermsGate({
  user,
  refresh,
  logout,
}: {
  user: User;
  refresh: () => Promise<User | null>;
  logout: () => void;
}) {
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<TermsView | null>(null);

  async function accept(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api<{ ok: boolean }>("/api/auth/accept-terms", {
        method: "POST",
        body: { version: user.currentTermsVersion },
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rozilik qayd etilmadi. Qayta urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-md" aria-hidden="true" />
        <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Foydalanish shartlari yangilandi</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Davom etish uchun yangi shartlarga rozilik bering. Rozilik bermaguningizcha profilingizdan foydalana olmaysiz.
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Joriy versiya: {user.currentTermsVersion}</p>

          <label className="mt-4 flex items-start gap-2.5 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
            />
            <span>
              Men{" "}
              <button type="button" onClick={() => setModal("terms")} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                Foydalanish shartlariga
              </button>{" "}
              va{" "}
              <button type="button" onClick={() => setModal("privacy")} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                Maxfiylik siyosatiga
              </button>{" "}
              roziman
            </span>
          </label>

          {error && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>}

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              disabled={!agreed || busy}
              onClick={() => void accept()}
              className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 dark:hover:bg-blue-500"
            >
              {busy ? "Qayd etilmoqda..." : "Davom etish"}
            </button>
            <button
              type="button"
              onClick={logout}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Chiqish
            </button>
          </div>
        </div>
      </div>
      {modal !== null && <TermsModal open initialView={modal} onClose={() => setModal(null)} />}
    </>
  );
}