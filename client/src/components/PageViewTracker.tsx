"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { config } from "@/lib/config";

/** Fires a page-view analytics beacon on every navigation. Unique visitors and
 *  bots are handled server-side (Redis, 24h window); this just reports that a
 *  real page was opened by the browser. Admin pages are excluded so internal
 *  usage does not skew public audience stats. */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof pathname !== "string" || pathname.startsWith("/admin")) return;
    // Small delay so rapid route changes during hydration skip the beacon.
    const timer = window.setTimeout(() => {
      void fetch(`${config.url}/api/pageview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => {
        /* analytics must never break navigation */
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}