"use client";

import { useSyncExternalStore } from "react";

/**
 * Reactive `navigator.onLine`.
 *
 * Deliberately uses `useSyncExternalStore` instead of the obvious
 * `useState` + `useEffect` + `setState` pair:
 *  - the linter (react-hooks/set-state-in-effect) rejects a synchronous
 *    setState in an effect body because it forces a second render pass, and
 *  - reading `navigator.onLine` during render would differ between server and
 *    client, producing a hydration mismatch.
 *
 * `getServerSnapshot` is what solves the hydration problem: React renders the
 * server snapshot on both the server and the first client pass, then immediately
 * re-renders with the real client snapshot. So there is never a mismatch warning
 * and never a flash of the wrong banner.
 *
 * Note this reflects the *browser's* view only. A captive portal or a dead API
 * with working internet still reads as online, which is why the API layer
 * surfaces its own timeout errors separately.
 */

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

// Assume online during SSR. Claiming "offline" in server HTML would mean a
// crawler or a bot with no network — and a user whose connection drops before
// hydration — briefly sees a connectivity warning that is not meaningful.
function getServerSnapshot(): boolean {
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}