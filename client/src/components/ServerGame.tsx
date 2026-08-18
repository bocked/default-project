"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";

const CHOICES = [
  { id: "rock", emoji: "🪨", label: "Tosh" },
  { id: "scissors", emoji: "✂️", label: "Qaychi" },
  { id: "paper", emoji: "📄", label: "Qog'oz" },
] as const;

type ChoiceId = (typeof CHOICES)[number]["id"];

const BEATS: Record<ChoiceId, ChoiceId> = {
  rock: "scissors",
  scissors: "paper",
  paper: "rock",
};

function evaluate(player: ChoiceId, computer: ChoiceId): "win" | "lose" | "draw" {
  if (player === computer) return "draw";
  return BEATS[player] === computer ? "win" : "lose";
}

const RESULT_TEXT = {
  win: "Yutdingiz!",
  lose: "Yutqazdingiz!",
  draw: "Durrang!",
} as const;

const RESULT_COLOR = {
  win: "text-emerald-600 dark:text-emerald-400",
  lose: "text-rose-600 dark:text-rose-400",
  draw: "text-amber-600 dark:text-amber-400",
} as const;

const HEALTH_INTERVAL_MS = 5000;

/**
 * Overlay shown when the server is slow to respond or down. Displays a
 * lightweight Rock-Paper-Scissors mini-game while pinging the health
 * endpoint in the background. Once the server responds, calls `onReady`
 * so the parent can hide the game and show normal content.
 */
export function ServerGame({ onReady }: { onReady: () => void }) {
  const [playerChoice, setPlayerChoice] = useState<ChoiceId | null>(null);
  const [computerChoice, setComputerChoice] = useState<ChoiceId | null>(null);
  const [result, setResult] = useState<"win" | "lose" | "draw" | null>(null);
  const [wins, setWins] = useState(0);
  const [games, setGames] = useState(0);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Auto-ping the health endpoint. When it succeeds, call onReady.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    async function ping(): Promise<void> {
      try {
        const res = await fetch(`${config.url}/api/health`);
        if (res.ok && aliveRef.current) {
          onReady();
          return;
        }
      } catch {
        // ignore – will retry
      }
      if (aliveRef.current) timer = setTimeout(ping, HEALTH_INTERVAL_MS);
    }

    timer = setTimeout(ping, HEALTH_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [onReady]);

  const play = useCallback(
    (choice: ChoiceId) => {
      const computer = CHOICES[Math.floor(Math.random() * 3)].id;
      const outcome = evaluate(choice, computer);
      setPlayerChoice(choice);
      setComputerChoice(computer);
      setResult(outcome);
      setGames((g) => g + 1);
      if (outcome === "win") setWins((w) => w + 1);
    },
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/95 p-4 backdrop-blur dark:bg-slate-950/95">
      <div className="w-full max-w-sm space-y-5 text-center">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Server uyg&apos;onmoqda, biroz kuting...
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            O&apos;ynab turib vaqtni o&apos;tkazing — avtomatik ulanadi
          </p>
        </div>

        {/* Mini-game: Tosh-Qaychi-Qog'oz */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-1 font-serif text-lg font-bold text-slate-800 dark:text-slate-100">
            Tosh-Qaychi-Qog&apos;oz
          </p>
          {games > 0 && (
            <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
              {wins} / {games} g&apos;alaba
            </p>
          )}

          <div className="mb-4 flex justify-center gap-3">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => play(c.id)}
                className="flex h-20 w-20 flex-col items-center justify-center rounded-2xl border-2 border-slate-200 bg-slate-50 text-3xl transition hover:border-blue-400 hover:bg-blue-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-500 dark:hover:bg-blue-950"
              >
                <span>{c.emoji}</span>
                <span className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  {c.label}
                </span>
              </button>
            ))}
          </div>

          {result && playerChoice && computerChoice && (
            <div className="space-y-2">
              <p className={`text-sm font-bold ${RESULT_COLOR[result]}`}>
                {RESULT_TEXT[result]}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {CHOICES.find((c) => c.id === playerChoice)?.emoji} vs{" "}
                {CHOICES.find((c) => c.id === computerChoice)?.emoji}
              </p>
            </div>
          )}

          {games === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Quyidagi tugmalardan birini bosing
            </p>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Server ga ulanish qayta urinilmoqda...
          </span>
        </div>
      </div>
    </div>
  );
}
