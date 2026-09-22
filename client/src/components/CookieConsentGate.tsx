"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { TermsModal, type TermsView } from "./TermsModal";

type Phase = "mounting" | "prompt" | "denied" | "accepted";

/** Mandatory cookie + terms consent overlay shown on every full page load
 *  (Refresh/F5). "Rozimasman" blurs and blocks the whole page until consented. */
export function CookieConsentGate() {
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>("mounting");
  const [modal, setModal] = useState<TermsView | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setPhase("prompt"), 60);
    return () => window.clearTimeout(id);
  }, []);

  // When the logged-in user must re-accept updated terms, the TermsReAcceptGate
  // already covers the whole screen — do not stack another overlay on top.
  if (user?.termsRequired) return null;
  if (phase === "mounting" || phase === "accepted") return null;

  if (phase === "denied") {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-slate-950/90 p-6 text-center backdrop-blur-md">
        <h2 className="text-lg font-semibold text-white">Rozilik talab qilinadi</h2>
        <p className="max-w-md text-sm text-slate-300">
          Sayt kontenti bloklandi. Saytdan foydalanishni davom ettirish uchun Cookie va foydalanish shartlariga rozilik berishingiz kerak.
        </p>
        <button
          type="button"
          onClick={() => setPhase("prompt")}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          Roziman
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md" aria-hidden="true" />
        <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Cookie va foydalanish shartlari</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Saytimiz ishlashi, xavfsizligi va qulayligi uchun cookie fayllar hamda localStorage dan foydalanamiz.
            Saytdan foydalanish uchun{" "}
            <button type="button" onClick={() => setModal("terms")} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Foydalanish shartlariga
            </button>
            ,{" "}
            <button type="button" onClick={() => setModal("privacy")} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Maxfiylik siyosatiga
            </button>{" "}
            va cookie qoidalariga rozilik berishingiz kerak.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPhase("denied")}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Rozimasman
            </button>
            <button
              type="button"
              onClick={() => setPhase("accepted")}
              className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
            >
              Roziman
            </button>
          </div>
        </div>
      </div>
      {modal !== null && <TermsModal open initialView={modal} onClose={() => setModal(null)} />}
    </>
  );
}