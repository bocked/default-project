"use client";

import { toggleSpeech, useSpeechState, speechSupported } from "@/lib/tts";
import { useI18n } from "@/lib/i18n";

export function TtsButton({ text, lang }: { text: string; lang?: string }) {
  const { t } = useI18n();
  const speakingText = useSpeechState();

  if (!speechSupported()) return null;

  const active = speakingText === text;
  const label = active ? t("tts.stop") : t("tts.play");

  return (
    <button
      type="button"
      onClick={() => toggleSpeech(text, lang)}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
      }`}
    >
      {active ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M3 10v4a1 1 0 001 1h3l4.29 3.43A1 1 0 0013 17.68V6.32a1 1 0 00-1.71-.75L7 9H4a1 1 0 00-1 1z" />
          <path d="M16 8.5a4 4 0 010 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
      <span>{label}</span>
    </button>
  );
}