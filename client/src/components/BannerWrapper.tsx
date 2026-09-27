"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

const STORAGE_PREFIX = "iqtibosim_banner_closed:";
const FADE_MS = 320;
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
}: BannerWrapperProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(true);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

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
      aria-hidden={closing}
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