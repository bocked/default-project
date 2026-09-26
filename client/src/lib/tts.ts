"use client";

import { useEffect, useState } from "react";

/**
 * Single-player text-to-speech over `window.speechSynthesis`.
 *
 * Only one utterance can be "active" at a time across the whole page: starting
 * a new one cancels the previous player, and any component can subscribe to
 * the current speaking text via `useSpeechState`. All calls are no-ops for
 * environments without speechSynthesis (SSR, unsupported browsers).
 */

type Listener = (text: string | null) => void;

let currentText: string | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) listener(currentText);
}

function pickVoice(lang?: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const want = (lang ?? "UZ").toLowerCase().replace("_", "-");
  return (
    voices.find((v) => v.lang.toLowerCase().replace("_", "-").startsWith(want)) ??
    null
  );
}

/** Starts/stops speaking `text`. Returns the new state ("playing" | "stopped"). */
export function toggleSpeech(text: string, lang?: string): "playing" | "stopped" {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return "stopped";

  if (currentText === text) {
    window.speechSynthesis.cancel();
    currentText = null;
    notify();
    return "stopped";
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? (lang ?? "UZ").toLowerCase().replace("_", "-");
  utterance.rate = 0.95;

  const finish = (): void => {
    if (currentText === text) {
      currentText = null;
      notify();
    }
  };
  utterance.onend = finish;
  utterance.onerror = finish;

  currentText = text;
  notify();
  window.speechSynthesis.speak(utterance);
  return "playing";
}

/** Reactive current speaking text (null when nothing plays right now). */
export function useSpeechState(): string | null {
  const [speaking, setSpeaking] = useState<string | null>(currentText);

  useEffect(() => {
    const listener: Listener = (text) => setSpeaking(text);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return speaking;
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}