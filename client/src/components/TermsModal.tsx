"use client";

import { useEffect, useState } from "react";
import { TermsContent, PrivacyContent } from "./legal-content";

export type TermsView = "terms" | "privacy";

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
  initialView?: TermsView;
  title?: string;
}

/** In-site legal modal so visitors never leave the register/login flow. Mount
 *  it conditionally (only while open) so its internal tab state resets. */
export function TermsModal({ open, onClose, initialView = "terms", title = "Qoidalar" }: TermsModalProps) {
  const [view, setView] = useState<TermsView>(initialView);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const tabClass = (active: boolean): string =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? "bg-blue-600 text-white"
        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Versiya 1.1 · 2026-yil sentyabr</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-slate-200 px-5 py-2.5 dark:border-slate-800">
          <button type="button" onClick={() => setView("terms")} className={tabClass(view === "terms")}>
            Foydalanish shartlari
          </button>
          <button type="button" onClick={() => setView("privacy")} className={tabClass(view === "privacy")}>
            Maxfiylik siyosati
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {view === "terms" ? <TermsContent /> : <PrivacyContent modal />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
              To&apos;liq matn
            </a>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
              Maxfiylik siyosati
            </a>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 dark:hover:bg-blue-500"
          >
            Yopish
          </button>
        </div>
      </div>
    </div>
  );
}