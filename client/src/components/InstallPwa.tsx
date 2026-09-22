"use client";

import { useEffect, useState } from "react";

/**
 * "Install app" banner. Appears once the browser fires `beforeinstallprompt`
 * (Android Chrome / desktop) or, as a manual hint, on iOS Safari. Install is
 * progressive — the banner hides itself whenever the app is already running
 * standalone and can always be dismissed permanently.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "iqtibosim_install_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function InstallPwa() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [iosHint, setIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;

    const ua = window.navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const onAppInstalled = () => {
      setPromptEvent(null);
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onAppInstalled);
    // iOS never fires `beforeinstallprompt`; show a manual hint after a delay.
    const timer = window.setTimeout(() => {
      setIsIos(ios);
      if (ios) setVisible(true);
    }, 4000);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.clearTimeout(timer);
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* storage may be unavailable in private mode */
    }
    setVisible(false);
  };

  const install = async () => {
    if (!promptEvent) {
      setIosHint((v) => !v);
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setPromptEvent(null);
  };

  if (!visible || (!promptEvent && !isIos)) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Iqtibosimni o&apos;rnating</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Saytni ilova sifatida oching va har kuni yangi iqtiboslarni tezroq o&apos;qing.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Yopish"
          className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      </div>
      <button
        type="button"
        onClick={() => void install()}
        className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
      >
        {promptEvent ? "📲 Saytni ilova sifatida o'rnatish" : isIos ? "Qanday o'rnatiladi?" : "O'rnatish"}
      </button>
      {isIos && !promptEvent && iosHint && (
        <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Safari brauzerida <strong>«Ulashish»</strong> (Share) tugmasini bosing va menyudan{" "}
          <strong>«Bosh ekranga qo&apos;shish»</strong>ni tanlang.
        </p>
      )}
    </div>
  );
}