"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker once the page becomes interactive.
 * `/sw.js` is a plain static file in this export-only app, so registration is
 * just a browser API call. Skipped during development to avoid stale caching.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA support is progressive — ignore registration failures */
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}