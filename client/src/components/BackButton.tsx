"use client";

import { useRouter } from "next/navigation";

/** Navigates to the previously visited page; falls back to `/` when there is
 *  no in-app history (e.g. the tab was opened directly on the link). */
export function BackButton({ label = "Orqaga" }: { label?: string }) {
  const router = useRouter();

  function goBack(): void {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="mb-4 inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path d="m12 19-7-7 7-7M5 12h14" />
      </svg>
      {label}
    </button>
  );
}