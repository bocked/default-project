"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";

type Cell = "X" | "O" | null;
type Board = Cell[];

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function checkWinner(board: Board): "X" | "O" | "draw" | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a] as "X" | "O";
  }
  if (board.every((c) => c !== null)) return "draw";
  return null;
}

function randomMove(board: Board): number {
  const empty = board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  return empty[Math.floor(Math.random() * empty.length)];
}

const HEALTH_INTERVAL_MS = 5000;

export function ServerGame({ onReady }: { onReady: () => void }) {
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [winner, setWinner] = useState<"X" | "O" | "draw" | null>(null);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [draws, setDraws] = useState(0);
  const [thinking, setThinking] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    async function ping(): Promise<void> {
      try {
        const res = await fetch(`${config.url}/api/health`);
        if (res.ok && aliveRef.current) { onReady(); return; }
      } catch { /* retry */ }
      if (aliveRef.current) timer = setTimeout(ping, HEALTH_INTERVAL_MS);
    }
    timer = setTimeout(ping, HEALTH_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [onReady]);

  const reset = useCallback(() => {
    setBoard(Array(9).fill(null));
    setWinner(null);
    setThinking(false);
  }, []);

  const handleCell = useCallback((idx: number) => {
    if (board[idx] || winner || thinking) return;

    const next = [...board];
    next[idx] = "X";
    const w1 = checkWinner(next);
    if (w1) {
      setBoard(next);
      setWinner(w1);
      if (w1 === "X") setWins((v) => v + 1);
      else if (w1 === "O") setLosses((v) => v + 1);
      else setDraws((v) => v + 1);
      return;
    }

    setThinking(true);
    setBoard(next);
    setTimeout(() => {
      const ci = randomMove(next);
      next[ci] = "O";
      const w2 = checkWinner(next);
      setBoard([...next]);
      setThinking(false);
      if (w2) {
        setWinner(w2);
        if (w2 === "X") setWins((v) => v + 1);
        else if (w2 === "O") setLosses((v) => v + 1);
        else setDraws((v) => v + 1);
      }
    }, 400);
  }, [board, winner, thinking]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50/95 p-4 backdrop-blur dark:bg-slate-950/95">
      <div className="w-full max-w-md space-y-6 text-center">

        {/* Header banner */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 shadow-md dark:border-amber-800/50 dark:bg-amber-950/40">
          <p className="text-base font-bold text-amber-800 dark:text-amber-200">
            Server uyg&apos;onmoqda...
          </p>
          <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
            Quidagi o&apos;ynab vaqtni o&apos;tkazing — avtomatik ulanadi
          </p>
        </div>

        {/* Game card */}
        <div className="rounded-2xl border-2 border-blue-200 bg-white p-6 shadow-xl dark:border-blue-800/50 dark:bg-slate-900">
          <p className="mb-1 font-serif text-xl font-bold text-slate-800 dark:text-slate-100">
            Iks-Nol
          </p>
          {(wins > 0 || losses > 0 || draws > 0) && (
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{wins}</span> g&apos;alaba ·{" "}
              <span className="font-semibold text-rose-600 dark:text-rose-400">{losses}</span> mag&apos;lubiyat ·{" "}
              <span className="font-semibold text-amber-600 dark:text-amber-400">{draws}</span> durrang
            </p>
          )}

          <div className="mx-auto grid grid-cols-3 gap-2" style={{ width: "240px" }}>
            {board.map((cell, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleCell(i)}
                disabled={!!cell || !!winner || thinking}
                className={`flex h-20 w-20 items-center justify-center rounded-xl text-3xl font-bold transition active:scale-95 ${
                  cell === "X"
                    ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400"
                    : cell === "O"
                      ? "bg-rose-100 text-rose-500 dark:bg-rose-900 dark:text-rose-400"
                      : "bg-slate-100 text-transparent hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                } ${!cell && !winner && !thinking ? "cursor-pointer hover:scale-105" : "cursor-default"}`}
              >
                {cell ?? ""}
              </button>
            ))}
          </div>

          {winner && (
            <div className="mt-5 space-y-3">
              <p className={`text-lg font-bold ${
                winner === "X" ? "text-emerald-600 dark:text-emerald-400"
                  : winner === "O" ? "text-rose-600 dark:text-rose-400"
                    : "text-amber-600 dark:text-amber-400"
              }`}>
                {winner === "X" ? "Yutdingiz!" : winner === "O" ? "Yutqazdingiz!" : "Durrang!"}
              </p>
              <button
                type="button"
                onClick={reset}
                className="min-h-[48px] rounded-xl bg-blue-600 px-8 py-3 text-base font-semibold text-white transition hover:bg-blue-700 active:scale-95 dark:hover:bg-blue-500"
              >
                Qayta o&apos;ynash
              </button>
            </div>
          )}

          {!winner && !thinking && board.every((c) => c === null) && (
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Siz — <span className="font-bold text-blue-500">X</span> · Kompyuter — <span className="font-bold text-rose-500">O</span>. Birinchi bosing!
            </p>
          )}
          {thinking && (
            <p className="mt-4 text-sm text-slate-400 dark:text-slate-500">
              Kompyuter o&apos;ylayapti...
            </p>
          )}
        </div>

        {/* Connection status */}
        <div className="flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Server ga ulanish qayta urinilmoqda...
          </span>
        </div>
      </div>
    </div>
  );
}
