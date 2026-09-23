"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { TermsContent, PrivacyContent, CookieContent } from "./legal-content";
import { PolicyText } from "./policy-content";
import type { PolicyResponse } from "@/lib/types";

export type TermsView = "terms" | "privacy" | "cookies";

interface TermsModalProps {
  open: boolean;
  onClose: () => void;
  initialView?: TermsView;
  title?: string;
}

/** In-site legal modal so visitors never leave the register/login flow. Mount
 *  it conditionally (only while open) so its internal tab state resets. The
 *  copy is the live DB policy when it loads, falling back to the static text. */
export function TermsModal({ open, onClose, initialView = "terms", title = "Qoidalar" }: TermsModalProps) {
  const [view, setView] = useState<TermsView>(initialView);
  const [terms, setTerms] = useState<PolicyResponse["policy"] | null>(null);
  const [privacy, setPrivacy] = useState<PolicyResponse["policy"] | null>(null);
  const [cookies, setCookies] = useState<PolicyResponse["policy"] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([
      api<PolicyResponse>("/api/policies?type=TERMS").catch(() => null),
      api<PolicyResponse>("/api/policies?type=PRIVACY").catch(() => null),
      api<PolicyResponse>("/api/policies?type=COOKIES").catch(() => null),
    ]).then(([t, p, c]) => {
      if (cancelled) return;
      if (t) setTerms(t.policy);
      if (p) setPrivacy(p.policy);
      if (c) setCookies(c.policy);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

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

  const current = view === "terms" ? terms : view === "privacy" ? privacy : cookies;
  const versionLine = current
    ? `Versiya ${current.version}${current.publishedAt ? ` · ${new Date(current.publishedAt).toLocaleDateString("uz-UZ")}` : ""}`
    : "Versiya 1.1 · 2026-yil sentyabr";

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
            <p className="text-xs text-slate-500 dark:text-slate-400">{versionLine}</p>
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
          <button type="button" onClick={() => setView("cookies")} className={tabClass(view === "cookies")}>
            Cookie qoidalari
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {view === "terms" ? (
            terms ? (
              <PolicyText content={terms.content} />
            ) : (
              <TermsContent />
            )
          ) : view === "privacy" ? (
            privacy ? (
              <PolicyText content={privacy.content} />
            ) : (
              <PrivacyContent modal />
            )
          ) : cookies ? (
            <PolicyText content={cookies.content} />
          ) : (
            <CookieContent />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
              To&apos;liq matn
            </a>
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
              Maxfiylik siyosati
            </a>
            <a href="/cookies" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
              Cookie qoidalari
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