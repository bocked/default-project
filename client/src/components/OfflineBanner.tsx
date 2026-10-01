"use client";

import { useOnlineStatus } from "@/lib/useOnlineStatus";

/**
 * Site-wide connectivity indicator.
 *
 * A static export means the page itself is already loaded, but every content
 * request still goes to the API over the network. Without this, going offline
 * produced silent no-ops: fetch failures were swallowed by the per-component
 * catch blocks, so the feed simply stopped updating with no explanation. This
 * banner is the single, always-visible signal.
 *
 * Deliberately only reflects the browser's own online/offline transition
 * events, and does NOT poll the API. Probing would generate a request every few
 * seconds on every open tab, and a failed probe is indistinguishable from a
 * CORS/network hiccup.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-slide-in-left sticky top-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-slate-900"
    >
      Internet aloqasi uzildi. Ma&apos;lumotlar yangilanmaydi.
    </div>
  );
}