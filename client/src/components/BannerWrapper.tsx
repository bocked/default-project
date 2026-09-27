"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { trackBanner } from "@/lib/banner-tracking";

const STORAGE_PREFIX = "iqtibosim_banner_closed:";
const FADE_MS = 320;
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// MRC viewability threshold: ≥50% of the banner visible for ≥1000ms.
const IO_THRESHOLD = 0.5;
const VIEW_DELAY_MS = 1000;

interface BannerWrapperProps {
  /** Unique banner id; the dismiss state is persisted per id in localStorage. */
  id: string;
  /**
   * A signature of the banner's current content (html|image|href). Dismissals
   * are stored per content signature, so replacing a banner (e.g. a placeholder
   * with a real ad) makes it reappear instead of staying hidden forever.
   */
  contentKey?: string;
  children: React.ReactNode;
  /** Extra classes for the outer (relative) container. */
  className?: string;
  /** Tailwind classes positioning the close button (default: top-right). */
  closeClassName?: string;
  /** Transition classes applied while the banner fades out. */
  leaveClassName?: string;
  /** When false, the close button is not rendered. */
  showCloseButtonOnMobile?: boolean;
  /**
   * Analytics slot this banner belongs to ("left" | "right" | "top" | "feed" |
   * "bottom"). Only sent to /api/banners/track when `trackable` is true.
   */
  slot?: string;
  /** When true, view/click events are reported for this banner (real creatives). */
  trackable?: boolean;
}

/**
 * Reusable dismissible banner shell: renders children under an optional close
 * ("X") button, fades the whole banner out smoothly on close and remembers the
 * dismissal in localStorage. Dismissal is scoped to a content signature and
 * expires after 7 days, so a user never permanently loses a banner — and a
 * newly configured ad always reappears even if the old placeholder was closed.
 */
export function BannerWrapper({
  id,
  contentKey = "",
  children,
  className = "",
  closeClassName = "right-2 top-2",
  leaveClassName = "opacity-0 -translate-y-1",
  showCloseButtonOnMobile = true,
  slot,
  trackable = false,
}: BannerWrapperProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();

  // View tracking state (typical MRC Active View): a banner that stays ≥50%
  // visible for 1000ms counts as one view. Deduped per slot per page view.
  const visibleRef = useRef(false);
  const viewedPathRef = useRef<string>("");
  const viewTimerRef = useRef<number | null>(null);

  const storageKey = `${STORAGE_PREFIX}${id}:${shortHash(contentKey)}`;

  // Read the persisted dismissal after mount (never during render, to keep
  // server and client markup identical for hydration). Legacy entries without
  // a signature block are treated as expired, so banners hidden by an old
  // "close once, never again" rule reappear once content is configured.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = window.localStorage.getItem(storageKey);
        if (stored === "1") setVisible(false);
        else if (stored?.startsWith("1:")) {
          const ts = Number(stored.slice(2));
          if (Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS) setVisible(false);
        }
      } catch {
        /* storage unavailable */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  // MRC viewability tracking: observe the root; when ≥50% of it stays visible
  // for ≥1000ms report one view (once per slot per pathname). Leaving the
  // viewport cancels the pending timer so nothing below the threshold counts.
  useEffect(() => {
    if (!trackable || !slot || typeof window === "undefined" || !rootRef.current) return;

    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const stillVisible = entry.isIntersecting && entry.intersectionRatio >= IO_THRESHOLD;
        visibleRef.current = stillVisible;
        if (stillVisible && viewTimerRef.current === null && viewedPathRef.current !== pathname) {
          viewTimerRef.current = window.setTimeout(() => {
            viewTimerRef.current = null;
            if (visibleRef.current && viewedPathRef.current !== pathname) {
              viewedPathRef.current = pathname;
              trackBanner(slot, "view");
            }
          }, VIEW_DELAY_MS);
        } else if (!stillVisible && viewTimerRef.current !== null) {
          window.clearTimeout(viewTimerRef.current);
          viewTimerRef.current = null;
        }
      },
      { threshold: IO_THRESHOLD },
    );
    io.observe(rootRef.current);

    return () => {
      io.disconnect();
      if (viewTimerRef.current !== null) window.clearTimeout(viewTimerRef.current);
    };
  }, [trackable, slot, pathname]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (!trackable || !slot) return;
    // Clicks on the close ("✕") button are UI actions, not ad clicks.
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    trackBanner(slot, "click");
  }

  function handleClose(): void {
    if (!visible || closing) return;
    setClosing(true);
    timerRef.current = window.setTimeout(() => {
      setVisible(false);
      setClosing(false);
      try {
        window.localStorage.setItem(storageKey, `1:${Date.now()}`);
      } catch {
        /* storage unavailable */
      }
    }, FADE_MS);
  }

  if (!visible) return null;

  return (
    <div
      ref={rootRef}
      aria-hidden={closing}
      onClick={trackable && slot ? handleClick : undefined}
      className={`relative transition-all duration-300 ease-out ${closing ? leaveClassName : "opacity-100"} ${className}`}
    >
      {children}
      {showCloseButtonOnMobile && (
        <button
          type="button"
          onClick={handleClose}
          aria-label={t("common.close")}
          className={`absolute z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-xs font-bold text-white shadow-md transition hover:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/60 dark:hover:bg-black/70 ${closeClassName}`}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function shortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}