"use client";

import { useState } from "react";
import type { CanvasApi } from "@/hooks/useCanvas";

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  create: { label: "qo'shdi", icon: "➕" },
  update: { label: "tahrirladi", icon: "✏️" },
  delete: { label: "o'chirdi", icon: "🗑️" },
  undo: { label: "tikladi", icon: "↩️" },
  move: { label: "ko'chirdi", icon: "↔️" },
};

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return "hozir";
  if (s < 60) return `${s}s oldin`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min oldin`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.floor(h / 24)} kun oldin`;
}

export default function ActivityPanel({ api }: { api: CanvasApi }) {
  const { activity, fetchActivity } = api;
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const toggle = () => {
    if (!open && !loaded) {
      setLoaded(true);
      void fetchActivity();
    }
    setOpen((o) => !o);
  };

  return (
    <div className="pointer-events-auto absolute left-3 top-36 z-40" onPointerDown={(e) => e.stopPropagation()}>
      <button
        onClick={toggle}
        className={`flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-700 shadow transition hover:bg-white active:scale-95 ${
          open ? "opacity-0" : ""
        }`}
        title="Faoliyat jurnali"
      >
        🕘 Faoliyat
      </button>

      {open && (
        <div className="animate-slide-up w-72 rounded-xl bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Faoliyat</h3>
            <button
              onClick={() => setOpen(false)}
              className="rounded px-1.5 py-0.5 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              ✕
            </button>
          </div>
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {activity.map((a) => {
              const meta = ACTION_LABELS[a.action] ?? { label: a.action, icon: "•" };
              return (
                <li key={a.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                  <span className="mt-0.5 text-sm">{meta.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700">
                      <b>{a.actorName ?? "Mehmon"}</b> {meta.label}{" "}
                      {a.itemType === "IMAGE" ? "rasm" : a.itemType === "STICKY" ? "yozuv" : "matn"}
                    </p>
                    <p className="truncate text-[11px] text-slate-400">
                      {a.preview || (a.itemType === "IMAGE" ? "(rasm)" : "")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(a.at)}</span>
                </li>
              );
            })}
            {activity.length === 0 && (
              <li className="px-1 py-2 text-sm text-slate-400">{"Hozircha faoliyat yo'q"}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
