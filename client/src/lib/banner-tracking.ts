import { config } from "@/lib/config";

/**
 * Fire-and-forget beacon for real banner analytics. The frontend calls it when
 * a banner was actually seen (≥50% visible for ≥1000ms) or clicked; the server
 * dedupes/rejects bots, so failures here are irrelevant — analytics must never
 * affect the browsing experience.
 */
export function trackBanner(slot: string, type: "view" | "click"): void {
  if (typeof window === "undefined") return;
  try {
    void fetch(`${config.url}/api/banners/track`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive so a click that navigates away or closes the page is not lost.
      keepalive: true,
      // Public endpoint — no cookies should ever be attached.
      credentials: "omit",
      body: JSON.stringify({ slot, type }),
    });
  } catch {
    /* best-effort tracking */
  }
}