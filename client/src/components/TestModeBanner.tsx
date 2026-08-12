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
  const [show, setShow] = useState(true);
  const [testMode, setTestMode] = useState(false);

  useEffect(() => {
    window.setTimeout(() => {
      setTestMode(isTestMode() || process.env.NEXT_PUBLIC_TEST_MODE === "1");
      const dismissed = localStorage.getItem("testModeBannerDismissed");
      if (dismissed === "true") {
        setShow(false);
      }
    }, 0);
  }, []);

  if (!testMode || !show) return null;

  function handleDismiss() {
    setShow(false);
    localStorage.setItem("testModeBannerDismissed", "true");
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-center text-sm font-semibold tracking-wide text-amber-950">
      <div className="flex items-center gap-2">
        <span aria-hidden="true">⚠️</span>
        <span>Test rejimi (Beta version) — sayt sinov rejimida ishlayapti, xatoliklar yuzaga kelishi mumkin</span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="flex-shrink-0 rounded px-2 py-0.5 text-xs font-medium text-amber-950 hover:bg-amber-300 transition"
        aria-label="Yopish"
      >
        ✕
      </button>
    </div>
  );
}
