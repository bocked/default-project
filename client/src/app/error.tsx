"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

/**
 * Route-level error boundary.
 *
 * Next.js renders this when a Client Component throws during render. It is
 * intentionally about *recovery*, not diagnostics: the retry button re-renders
 * the failed subtree without a full page load, which fixes the common real-world
 * cases (a transient 5xx from the API, or a dropped connection mid-request).
 *
 * SECURITY: `error.message` is not rendered in production. In a static export
 * everything runs in the user's browser, but the message may still have been
 * built from a server response containing internals, so it is logged to the
 * console for the developer and the UI stays generic. `error.digest` is Next's
 * own build-time correlation id and is safe to show — that is what support can
 * use to find the matching server log entry.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const online = useOnlineStatus();

  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  const offline = !online;
  const digest = error.digest;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-2 text-5xl" aria-hidden="true">
          {offline ? "📡" : "⚠️"}
        </p>

        <h1 className="mb-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
          {offline ? "Internet aloqasi uzildi" : "Nimadir noto'g'ri ketdi"}
        </h1>

        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
          {offline
            ? "Hozircha tarmoqga ulanib bo'lmadingiz. Aloqa qaytishi bilan sahifa qayta yuklanadi."
            : "Sahifani yuklashda xatolik yuz berdi. Ko'p hollarda qayta urinish muammoni hal qiladi."}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Qayta urinish
          </button>

          {!offline && (
            <Link
              href="/"
              className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Bosh sahifaga
            </Link>
          )}
        </div>

        {digest && (
          <p className="mt-6 break-all text-xs text-slate-400 dark:text-slate-500">
            Texnik xabar: {digest}
          </p>
        )}
      </div>
    </div>
  );
}