"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { hasStoredConsent } from "./CookieConsentGate";

/** WWW.UZ (www.uz) official site counter. It sets a `smart_top` cookie and pings
 *  a third-party domain, so it must only run after the visitor accepted the
 *  cookie policy on this device — never before consent. */
export function WwwUzTracker() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setEnabled(hasStoredConsent()), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!enabled) return null;

  return (
    <Script
      id="www-uz-counter"
      strategy="afterInteractive"
      src="/www-uz-counter.js"
    />
  );
}