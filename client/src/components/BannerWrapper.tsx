"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";

const STORAGE_PREFIX = "iqtibosim_banner_closed:";
const FADE_MS = 320;

interface BannerWrapperProps {
  /** Unique banner id; the dismiss state is persisted per id in localStorage. */
  id: string;
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
 * dismissal per id in localStorage so it stays gone for the current session.
 */
export function BannerWrapper({
  id,
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

  // Read the persisted dismissal after mount (never during render, to keep
  // server and client markup identical for hydration).
  useEffect(() => {
    const key = `${STORAGE_PREFIX}${id}`;
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(key) === "1") setVisible(false);
      } catch {
        /* storage unavailable */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [id]);

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
        window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, "1");
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