"use client";

import { useState } from "react";
import type { Identity } from "@/lib/types";
import type { ExportFormat } from "@/lib/export";

export interface ToolTemplate {
  key: string;
  type: "STICKY" | "TEXT";
  label: string;
  icon: string;
  content: string;
  color: string;
}

export interface ToolbarProps {
  tool: "MOVE" | "TEXT" | "STICKY" | "IMAGE";
  setTool: (tool: "MOVE" | "TEXT" | "STICKY" | "IMAGE") => void;
  color: string;
  setColor: (color: string) => void;
  colors: string[];
  online: number;
  connected: boolean;
  identity: Identity | null;
  templates: ToolTemplate[];
  activeTemplateKey: string | null;
  onPickTemplate: (key: string | null) => void;
  onAdmin: () => void;
  onExport: (format: ExportFormat) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

const TOOLS: { key: ToolbarProps["tool"]; label: string; icon: string }[] = [
  { key: "MOVE", label: "Harakat", icon: "✋" },
  { key: "TEXT", label: "Matn", icon: "✏️" },
  { key: "STICKY", label: "Yozuv", icon: "📝" },
  { key: "IMAGE", label: "Rasm", icon: "🖼️" },
];

export default function Toolbar({
  tool,
  setTool,
  color,
  setColor,
  colors,
  online,
  connected,
  identity,
  templates,
  activeTemplateKey,
  onPickTemplate,
  onAdmin,
  onExport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ToolbarProps) {
  const [openTemplates, setOpenTemplates] = useState(false);
  const [openExport, setOpenExport] = useState(false);

  const pickExport = (format: ExportFormat) => {
    setOpenExport(false);
    onExport(format);
  };

  return (
    <div className="pointer-events-auto flex min-w-0 max-w-[calc(100vw-1rem)] items-center gap-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 shadow-lg backdrop-blur [&>*]:shrink-0">
      <div className="flex items-center gap-1">
        {TOOLS.map((t) => (
          <button
            key={t.key}
            title={t.label}
            aria-pressed={tool === t.key}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-transform active:scale-90 ${
              tool === t.key ? "animate-pop-in bg-blue-100 text-blue-600" : "text-slate-500 hover:scale-105 hover:bg-slate-100"
            }`}
            onClick={() => setTool(t.key)}
          >
            {t.icon}
          </button>
        ))}
      </div>

      {/* Undo / redo */}
      <div className="flex items-center gap-0.5">
        <button
          title="Bekor qilish (Ctrl+Z)"
          disabled={!canUndo}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-base text-slate-500 transition hover:bg-slate-100 active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={onUndo}
        >
          ↩️
        </button>
        <button
          title="Qaytarish (Ctrl+Shift+Z)"
          disabled={!canRedo}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-base text-slate-500 transition hover:bg-slate-100 active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent"
          onClick={onRedo}
        >
          ↪️
        </button>
      </div>

      {/* Templates */}
      <div className="relative">
        <button
          title="Shablonlar"
          aria-pressed={activeTemplateKey !== null}
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-transform active:scale-90 ${
            activeTemplateKey !== null
              ? "animate-pop-in bg-amber-100 text-amber-600"
              : "text-slate-500 hover:scale-105 hover:bg-slate-100"
          }`}
          onClick={() => {
            if (activeTemplateKey) {
              onPickTemplate(null);
              return;
            }
            setOpenTemplates((o) => !o);
          }}
        >
          📋
        </button>
        {openTemplates && (
          <div className="animate-slide-up absolute top-11 left-0 z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            <p className="px-2 py-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              Shablonni tanlang
            </p>
            <div className="grid grid-cols-2 gap-1">
              {templates.map((t) => (
                <button
                  key={t.key}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition active:scale-95 ${
                    activeTemplateKey === t.key
                      ? "bg-amber-100 text-amber-700"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  onClick={() => {
                    onPickTemplate(activeTemplateKey === t.key ? null : t.key);
                    setOpenTemplates(false);
                  }}
                >
                  <span className="text-base">{t.icon}</span>
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>
            <p className="px-2 pt-1 pb-0.5 text-[10px] text-slate-400">
              Tanlangan shablonni joylashtirish uchun daftarga bosing.
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            aria-label={`Rang ${c}`}
            className={`h-5 w-5 rounded-full transition-transform active:scale-75 ${
              color === c ? "ring-2 ring-blue-500 ring-offset-1" : "hover:scale-110"
            }`}
            style={{ backgroundColor: c }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      <div className="h-6 w-px bg-slate-200" />

      {/* Export (PNG / SVG) */}
      <div className="relative">
        <button
          title="Eksport"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-slate-500 transition-transform hover:scale-105 hover:bg-slate-100 active:scale-90"
          onClick={() => {
            setOpenTemplates(false);
            setOpenExport((o) => !o);
          }}
        >
          ⬇️
        </button>
        {openExport && (
          <div className="animate-slide-up absolute top-11 left-0 z-50 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            <p className="px-2 py-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
              Rasm sifatida yuklab olish
            </p>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-100 active:scale-[0.98]"
              onClick={() => pickExport("png")}
            >
              <span className="text-base">🖼️</span> PNG (yuqori sifat)
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-100 active:scale-[0.98]"
              onClick={() => pickExport("svg")}
            >
              <span className="text-base">📐</span> SVG (vektor)
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-sm text-slate-600">
        <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse bg-green-500" : "bg-red-400"}`} />
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
        className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 active:scale-95"
        onClick={onAdmin}
      >
        🛠 Admin
      </button>
    </div>
  );
}
