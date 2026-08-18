"use client";

import { useEffect, useState } from "react";

// The production custom domain. Every other host (local dev, *.pages.dev
// previews and the test deployment) is considered a test environment and gets
// the banner. Set NEXT_PUBLIC_TEST_MODE=1 to force it on the production host too.
const PROD_HOSTS = new Set(["yerlikoglon.uz", "www.yerlikoglon.uz"]);

function isTestMode(): boolean {
  const forced =
    process.env.NEXT_PUBLIC_TEST_MODE === "1" || process.env.NEXT_PUBLIC_TEST_MODE === "true";
  if (forced) return true;
  const host = window.location.hostname.toLowerCase();
  return !PROD_HOSTS.has(host);
}

export function TestModeBanner() {
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    window.setTimeout(() => {
      setTestMode(isTestMode() || process.env.NEXT_PUBLIC_TEST_MODE === "1");
    }, 0);
  }, []);

  if (!testMode) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-semibold tracking-wide text-amber-950 sm:text-sm">
      <span aria-hidden="true">⚠️</span>
      <span className="hidden sm:inline">Test rejimi (Beta version) — sayt sinov rejimida ishlayapti, xatoliklar yuzaga kelishi mumkin</span>
      <span className="sm:hidden">Test rejimi — sayt sinovda</span>
    </div>
  );
}
