"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";

type Cell = "X" | "O" | null;
type Board = Cell[];

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],             // diags
];

function checkWinner(board: Board): "X" | "O" | "draw" | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a] as "X" | "O";
  }
  if (board.every((c) => c !== null)) return "draw";
  return null;
}

function computerMove(board: Board): number {
  // Win if possible
  for (const [a, b, c] of WIN_LINES) {
    const vals = [board[a], board[b], board[c]];
    if (vals.filter((v) => v === "O").length === 2 && vals.includes(null)) {
      return [a, b, c][vals.indexOf(null)]!;
    }
  }
  // Block player win
  for (const [a, b, c] of WIN_LINES) {
    const vals = [board[a], board[b], board[c]];
    if (vals.filter((v) => v === "X").length === 2 && vals.includes(null)) {
      return [a, b, c][vals.indexOf(null)]!;
    }
  }
  // Take center
  if (board[4] === null) return 4;
  // Take corner
  const corners = [0, 2, 6, 8].filter((i) => board[i] === null);
  if (corners.length > 0) return corners[Math.floor(Math.random() * corners.length)];
  // Take any
  const empty = board.map((c, i) => (c === null ? i : -1)).filter((i) => i >= 0);
  return empty[Math.floor(Math.random() * empty.length)];
}

const HEALTH_INTERVAL_MS = 5000;

/**
 * Overlay shown when the server is slow to respond or down. Displays a
 * lightweight Tic-Tac-Toe (iks-nol) mini-game while pinging the health
 * endpoint in the background. Once the server responds, calls `onReady`
 * so the parent can hide the game and show normal content.
 */
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

  // Auto-ping the health endpoint. When it succeeds, call onReady.
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

    // Player move
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

    // Computer move (small delay for feel)
    setThinking(true);
    setBoard(next);
    setTimeout(() => {
      const ci = computerMove(next);
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
    }, 300);
  }, [board, winner, thinking]);

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

        {/* Tic-Tac-Toe board */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-1 font-serif text-lg font-bold text-slate-800 dark:text-slate-100">
            Iks-Nol
          </p>
          {(wins > 0 || losses > 0 || draws > 0) && (
            <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
              {wins} g&apos;alaba · {losses} mag&apos;lubiyat · {draws} durrang
            </p>
          )}

          <div className="mx-auto grid grid-cols-3 gap-1.5" style={{ width: "192px" }}>
            {board.map((cell, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleCell(i)}
                disabled={!!cell || !!winner || thinking}
                className={`flex h-16 w-16 items-center justify-center rounded-xl text-2xl font-bold transition active:scale-95 ${
                  cell === "X"
                    ? "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                    : cell === "O"
                      ? "bg-rose-50 text-rose-500 dark:bg-rose-950 dark:text-rose-400"
                      : "bg-slate-50 text-transparent hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700"
                } ${!cell && !winner && !thinking ? "cursor-pointer" : "cursor-default"}`}
              >
                {cell ?? ""}
              </button>
            ))}
          </div>

          {winner && (
            <div className="mt-4 space-y-2">
              <p className={`text-sm font-bold ${
                winner === "X" ? "text-emerald-600 dark:text-emerald-400"
                  : winner === "O" ? "text-rose-600 dark:text-rose-400"
                    : "text-amber-600 dark:text-amber-400"
              }`}>
                {winner === "X" ? "Yutdingiz!" : winner === "O" ? "Yutqazdingiz!" : "Durrang!"}
              </p>
              <button
                type="button"
                onClick={reset}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-95 dark:hover:bg-blue-500"
              >
                Qayta o&apos;ynash
              </button>
            </div>
          )}

          {!winner && !thinking && board.every((c) => c === null) && (
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              Siz — <span className="font-bold text-blue-500">X</span>, Kompyuter — <span className="font-bold text-rose-500">O</span>. Birinchi bosing!
            </p>
          )}
          {thinking && (
            <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              Kompyuter o&apos;ylayapti...
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
