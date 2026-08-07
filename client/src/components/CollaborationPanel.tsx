"use client";

import { useState } from "react";
import type { CanvasApi } from "@/hooks/useCanvas";
import { useAuth } from "./AuthProvider";

const CURSOR_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export default function CollaborationPanel({ api }: { api: CanvasApi }) {
  const { user } = useAuth();
  const { presence, online, currentRoom, identity, updateIdentity, myId } = api;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);

  const toggle = () => {
    if (!open && identity) {
      setName(identity.name);
      setColor(identity.color);
    }
    setOpen((o) => !o);
  };

  const apply = () => {
    const clean = name.trim().slice(0, 32);
    if (!clean && !color) return;
    updateIdentity(clean || identity?.name || "Mehmon", color ?? identity?.color ?? CURSOR_COLORS[5]);
  };

  return (
    <div className="pointer-events-auto absolute left-3 top-14 z-40" onPointerDown={(e) => e.stopPropagation()}>
      <button
        onClick={toggle}
        className={`flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-700 shadow transition hover:bg-white active:scale-95 ${
          open ? "opacity-0" : ""
        }`}
        title="Onlayn foydalanuvchilar"
      >
        👥 {online}
      </button>

      {open && (
        <div className="animate-slide-up w-64 rounded-xl bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">
              {currentRoom ? `Xonada: ${currentRoom.name}` : "Asosiy kanvasda"}
            </h3>
            <button
              onClick={() => setOpen(false)}
              className="rounded px-1.5 py-0.5 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          <ul className="mb-3 max-h-52 space-y-1 overflow-y-auto">
            {presence.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.name}</span>
                {p.id === myId && <span className="text-[10px] font-medium text-slate-400">siz</span>}
              </li>
            ))}
            {presence.length === 0 && <li className="px-1 py-2 text-sm text-slate-400">{"Hozircha hech kim yo'q"}</li>}
          </ul>

          <div className="space-y-2 border-t border-slate-100 pt-2">
            <p className="text-xs font-medium text-slate-500">
              {user ? "Kursor rangi" : "Mehmon nomi va rangi"}
            </p>
            {!user && (
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") apply();
                }}
                maxLength={32}
                placeholder="Nomingiz"
                className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400"
              />
            )}
            <div className="flex items-center gap-1.5">
              {CURSOR_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-5 w-5 rounded-full transition-transform active:scale-75 ${
                    color === c ? "ring-2 ring-slate-800 ring-offset-1" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Rang ${c}`}
                />
              ))}
            </div>
            <button
              onClick={apply}
              className="w-full rounded-md bg-slate-800 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 active:scale-[0.98]"
            >
              Saqlash
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
