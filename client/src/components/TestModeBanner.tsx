"use client";

import { useSyncExternalStore } from "react";

// The production custom domain. Every other host (local dev, *.pages.dev
// previews and the test deployment) is considered a test environment and gets
// the banner. Set NEXT_PUBLIC_TEST_MODE=1 to force it on the production host too.
const PROD_HOSTS = new Set(["yerlikoglon.uz", "www.yerlikoglon.uz"]);

const emptySubscribe = () => () => {};

function isTestMode(): boolean {
  const forced =
    process.env.NEXT_PUBLIC_TEST_MODE === "1" || process.env.NEXT_PUBLIC_TEST_MODE === "true";
  if (forced) return true;
  const host = window.location.hostname.toLowerCase();
  return !PROD_HOSTS.has(host);
}

export function TestModeBanner() {
  const testMode = useSyncExternalStore(emptySubscribe, isTestMode, () => false);

  if (!testMode) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-400 px-3 py-1 text-center text-[11px] font-semibold tracking-wide text-amber-950 sm:text-xs">
      <span aria-hidden="true">⚠️</span>
      <span>Test rejimi — bu sayt hozircha sinov uchun ishlamoqda</span>
    </div>
  );
}
