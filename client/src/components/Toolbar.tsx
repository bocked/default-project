"use client";

import type { Identity } from "@/lib/types";

export interface ToolbarProps {
  tool: "MOVE" | "TEXT" | "STICKY" | "IMAGE";
  setTool: (tool: "MOVE" | "TEXT" | "STICKY" | "IMAGE") => void;
  color: string;
  setColor: (color: string) => void;
  colors: string[];
  online: number;
  connected: boolean;
  identity: Identity | null;
  onAdmin: () => void;
}

const TOOLS: { key: ToolbarProps["tool"]; label: string; icon: string }[] = [
  { key: "MOVE", label: "Harakat", icon: "✋" },
  { key: "TEXT", label: "Matn", icon: "✏️" },
  { key: "STICKY", label: "Yozuv", icon: "📝" },
  { key: "IMAGE", label: "Rasm", icon: "🖼️" },
];

export default function Toolbar({ tool, setTool, color, setColor, colors, online, connected, identity, onAdmin }: ToolbarProps) {
  return (
    <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            title={t.label}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition ${
              tool === t.key ? "bg-blue-100 text-blue-600" : "text-slate-500 hover:bg-slate-100"
            }`}
            onClick={() => setTool(t.key)}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            className={`h-5 w-5 rounded-full transition ${color === c ? "ring-2 ring-blue-500 ring-offset-1" : "hover:scale-110"}`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      <div className="h-6 w-px bg-slate-200" />

      <div className="flex items-center gap-1.5 text-sm text-slate-600">
        <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-red-400"}`} />
        {connected ? `${online} onlayn` : "ulanish... "}
      </div>

      {identity && (
        <div className="hidden items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 sm:flex">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: identity.color }} />
          {identity.name}
        </div>
      )}

      <div className="h-6 w-px bg-slate-200" />

      <button
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        onClick={onAdmin}
      >
        🛠 Admin
      </button>
    </div>
  );
}
