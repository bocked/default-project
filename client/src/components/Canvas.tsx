"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasApi } from "@/hooks/useCanvas";
import type { CanvasItem } from "@/lib/types";
import Toolbar from "./Toolbar";
import AdminPanel from "./AdminPanel";
import AuthBar from "./AuthBar";
import RoomSwitcher from "./RoomSwitcher";
import { useAuth } from "./AuthProvider";

type Tool = "MOVE" | "TEXT" | "STICKY" | "IMAGE";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "💯"];

const STICKY_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e2e8f0"];
const TEXT_COLORS = ["#1e293b", "#334155", "#64748b", "#b91c1c", "#0f766e", "#7c3aed"];

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  startWorldX: number;
  startWorldY: number;
}

export default function Canvas({ api }: { api: CanvasApi }) {
  const {
    connected,
    banned,
    identity,
    items,
    cursors,
    online,
    addItem,
    moveItem,
    react,
    updateCursor,
    fetchInitialItems,
    currentRoom,
    hasMore,
    loadingOlder,
    loadOlderItems,
  } = api;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>("MOVE");
  const [color, setColor] = useState(STICKY_COLORS[0]);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [pendingImage, setPendingImage] = useState<{ x: number; y: number } | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<CanvasItem | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [lastDeletedId, setLastDeletedId] = useState<string | null>(null);
  const { user } = useAuth();

  const worldToScreen = useCallback(
    (p: { x: number; y: number }) => ({ x: p.x * zoom + offset.x, y: p.y * zoom + offset.y }),
    [zoom, offset]
  );
  const screenToWorld = useCallback(
    (s: { x: number; y: number }) => ({ x: (s.x - offset.x) / zoom, y: (s.y - offset.y) / zoom }),
    [zoom, offset]
  );

  // Load initial items once connected.
  useEffect(() => {
    if (connected) fetchInitialItems();
  }, [connected, fetchInitialItems]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  // Wheel zoom (non-passive so we can preventDefault).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setZoom((prev) => {
        const next = Math.min(4, Math.max(0.2, prev * Math.exp(-e.deltaY * 0.0015)));
        const world = { x: (px - offset.x) / prev, y: (py - offset.y) / prev };
        setOffset({ x: px - world.x * next, y: py - world.y * next });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [offset]);

  const notify = useCallback((msg: string) => setToast(msg), []);

  // Own cursor position + broadcast.
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const client = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setMouse(client);
      const world = screenToWorld(client);
      updateCursor(world.x, world.y);

      if (panning) {
        setOffset({
          x: panning.originX + (client.x - panning.startX),
          y: panning.originY + (client.y - panning.startY),
        });
      }
      if (drag) {
        const nx = drag.startWorldX + (client.x - drag.startClientX) / zoom;
        const ny = drag.startWorldY + (client.y - drag.startClientY) / zoom;
        moveItem(drag.id, Math.round(nx), Math.round(ny));
      }
    },
    [panning, drag, zoom, screenToWorld, moveItem, updateCursor]
  );

  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const client = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const world = screenToWorld(client);

      if (tool === "TEXT") {
        setPendingText(world);
        return;
      }
      if (tool === "STICKY") {
        addItem("STICKY", "Yangi yozuv", Math.round(world.x), Math.round(world.y), color);
        return;
      }
      if (tool === "IMAGE") {
        setPendingImage(world);
        fileInputRef.current?.click();
        return;
      }
      // MOVE: start panning.
      setPanning({ startX: client.x, startY: client.y, originX: offset.x, originY: offset.y });
    },
    [tool, screenToWorld, offset, color, addItem]
  );

  const endPointer = useCallback(() => {
    setDrag(null);
    setPanning(null);
  }, []);

  const handleItemPointerDown = useCallback(
    (e: React.PointerEvent, item: CanvasItem) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDrag({
        id: item.id,
        startClientX: e.clientX - rect.left,
        startClientY: e.clientY - rect.top,
        startWorldX: item.x,
        startWorldY: item.y,
      });
    },
    []
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (tool !== "MOVE") return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const world = screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      addItem("STICKY", "Yangi yozuv", Math.round(world.x), Math.round(world.y), color);
    },
    [tool, screenToWorld, color, addItem]
  );

  const commitText = useCallback(
    (content: string, cancel: boolean) => {
      if (!pendingText) return;
      if (!cancel && content.trim()) {
        addItem("TEXT", content.trim().slice(0, 4000), Math.round(pendingText.x), Math.round(pendingText.y), TEXT_COLORS[1]);
      }
      setPendingText(null);
    },
    [pendingText, addItem]
  );

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !pendingImage) return;
      try {
        const url = await api.uploadImage(file);
        addItem("IMAGE", url, Math.round(pendingImage.x), Math.round(pendingImage.y));
        notify("Rasm joylandi");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Rasm yuklashda xato");
      } finally {
        setPendingImage(null);
      }
    },
    [pendingImage, api, addItem, notify]
  );

  const isOwner = useCallback(
    (item: CanvasItem) => (item.userId ? user?.id === item.userId : false),
    [user]
  );
  const isStaff = useCallback((u: typeof user) => u?.role === "ADMIN" || u?.role === "MODERATOR", []);

  const handleDelete = useCallback(
    (item: CanvasItem) => {
      api.deleteItem(item.id);
      setLastDeletedId(item.id);
      notify("Element o'chirildi");
    },
    [api, notify]
  );

  const submitReport = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!reportFor) return;
      try {
        await api.reportItem(reportFor.id, reportReason.trim());
        setReportFor(null);
        setReportReason("");
        notify("Hisobot yuborildi");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Hisobot yuborilmadi");
      }
    },
    [reportFor, reportReason, api, notify]
  );

  if (banned) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100">
        <div className="animate-slide-up rounded-xl bg-white p-8 text-center shadow">
          <div className="text-4xl">🚫</div>
          <h1 className="mt-2 text-xl font-semibold text-slate-800">Siz bloklangansiz</h1>
          <p className="mt-1 text-sm text-slate-500">Bu kustav daftariga kirishingiz cheklangan.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`canvas-dot-grid relative h-full w-full touch-none overflow-hidden bg-slate-100 select-none ${
        tool === "MOVE" ? "cursor-grab" : "cursor-crosshair"
      } ${panning ? "cursor-grabbing" : ""} ${drag ? "cursor-grabbing" : ""}`}
      style={{
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${offset.x}px ${offset.y}px`,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={endPointer}
      onPointerDown={handleBackgroundPointerDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* World layer */}
      <div
        className="absolute left-0 top-0"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
      >
        {items.map((item, index) => {
          const pos = { x: item.x, y: item.y };
          const isHovered = hoveredId === item.id;
          return (
            <div key={item.id} className="absolute" style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}>
              <div
                onPointerDown={(e) => handleItemPointerDown(e, item)}
                onPointerEnter={() => setHoveredId(item.id)}
                onPointerLeave={() => setHoveredId(null)}
                className="animate-pop-in group relative cursor-grab active:cursor-grabbing"
                style={{ animationDelay: `${Math.min(index, 24) * 10}ms` }}
              >
                {item.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.content}
                    alt=""
                    className={`pointer-events-none max-h-72 max-w-72 rounded-md shadow-lg transition-shadow duration-200 ${isHovered ? "shadow-2xl" : ""}`}
                    style={{ outline: isHovered ? "2px solid #3b82f6" : "none" }}
                  />
                ) : item.type === "STICKY" ? (
                  <div
                    className={`pointer-events-none min-w-40 max-w-64 rounded p-3 shadow-md transition-shadow duration-200 ${isHovered ? "shadow-xl" : ""}`}
                    style={{
                      backgroundColor: item.color ?? "#fef08a",
                      fontFamily: "var(--font-geist-sans), sans-serif",
                    }}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-5 text-slate-800">{item.content}</p>
                  </div>
                ) : (
                  <div
                    className={`pointer-events-none max-w-64 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-md transition-shadow duration-200 ${isHovered ? "shadow-xl" : ""}`}
                  >
                    <p className="whitespace-pre-wrap text-sm text-slate-800" style={{ color: item.color ?? undefined }}>
                      {item.content}
                    </p>
                  </div>
                )}

                {/* Reaction bubbles */}
                {Object.keys(item.reactions).length > 0 && (
                  <div className="animate-pop-in pointer-events-none absolute -bottom-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-white/90 px-2 py-0.5 text-xs shadow">
                    {Object.entries(item.reactions).map(([emoji, count]) => (
                      <span key={emoji}>
                        {emoji}
                        {count > 1 && <b className="ml-0.5">{count}</b>}
                      </span>
                    ))}
                  </div>
                )}

                {/* Hover reaction bar */}
                {isHovered && (
                  <div className="animate-pop-in absolute -top-8 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-slate-800/90 px-1.5 py-1 shadow">
                    {EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        className="rounded-full px-1 text-sm transition hover:scale-125 active:scale-90"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          react(item.id, emoji);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {/* Hover actions: report + (delete when owned / staff) */}
                {isHovered && (user || isOwner(item)) && (
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      className="rounded-md bg-white/90 px-1.5 py-0.5 text-xs text-slate-600 shadow transition hover:bg-white"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setReportFor(item);
                        setReportReason("");
                      }}
                      title="Hisobot berish"
                    >
                      ⚑
                    </button>
                    {(isOwner(item) || isStaff(user)) && (
                      <button
                        className="rounded-md bg-white/90 px-1.5 py-0.5 text-xs text-red-600 shadow transition hover:bg-white"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          handleDelete(item);
                        }}
                        title="O'chirish"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Pending text input */}
        {pendingText && (
          <div
            className="animate-pop-in absolute"
            style={{ left: pendingText.x, top: pendingText.y, transform: "translate(-50%, -50%)" }}
          >
            <input
              autoFocus
              placeholder="Yozing..."
              className="min-w-56 rounded-md border-2 border-blue-500 bg-white px-3 py-2 text-sm text-slate-800 shadow-lg outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText(e.currentTarget.value, false);
                if (e.key === "Escape") commitText("", true);
              }}
              onBlur={(e) => commitText(e.currentTarget.value, false)}
            />
          </div>
        )}
      </div>

      {/* Remote cursors */}
      {Object.values(cursors).map((c) => {
        const pos = worldToScreen({ x: c.x, y: c.y });
        return (
          <div
            key={c.id}
            className="pointer-events-none absolute z-20"
            style={{ left: pos.x, top: pos.y, transition: "left 90ms linear, top 90ms linear" }}
          >
            <div className="relative">
              <svg width="16" height="16" viewBox="0 0 24 24" fill={c.color}>
                <path d="M5 3l14 7-6.5 1.5L9 19z" />
              </svg>
              <span
                className="absolute left-2 top-3 rounded px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap"
                style={{ backgroundColor: c.color }}
              >
                {c.name}
              </span>
            </div>
          </div>
        );
      })}

      {/* Own cursor label */}
      {identity && mouse && (
        <div className="pointer-events-none absolute z-30" style={{ left: mouse.x, top: mouse.y }}>
          <span
            className="absolute left-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-medium text-white whitespace-nowrap"
            style={{ backgroundColor: identity.color }}
          >
            {identity.name}
          </span>
        </div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {/* Toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center p-3">
        <Toolbar
          tool={tool}
          setTool={setTool}
          color={color}
          setColor={setColor}
          colors={tool === "STICKY" ? STICKY_COLORS : TEXT_COLORS}
          online={online}
          connected={connected}
          identity={identity}
          onAdmin={() => setShowAdmin(true)}
        />
      </div>

      {/* Auth */}
      <div className="absolute right-3 top-3 z-50">
        <AuthBar />
      </div>

      {/* Rooms */}
      <RoomSwitcher api={api} />

      {/* Undo chip after own delete */}
      {lastDeletedId && (
        <div className="animate-fade-in absolute bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-800/90 px-4 py-2 shadow-lg">
          <span className="text-sm text-white">{"Element o'chirildi"}</span>
          <button
            className="rounded-full bg-white/15 px-2.5 py-0.5 text-sm font-medium text-white transition hover:bg-white/25"
            onClick={() => {
              api.undoItem(lastDeletedId);
              setLastDeletedId(null);
              notify("Element tiklandi");
            }}
          >
            Bekor qilish
          </button>
        </div>
      )}

      {/* Zoom controls */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/90 px-2 py-1 shadow">
        <button
          className="pointer-events-auto rounded-full px-2 text-lg text-slate-600 hover:bg-slate-100"
          onClick={() => setZoom((z) => Math.max(0.2, z * 0.85))}
        >
          −
        </button>
        <span className="w-12 text-center text-xs font-medium text-slate-600">{Math.round(zoom * 100)}%</span>
        <button
          className="pointer-events-auto rounded-full px-2 text-lg text-slate-600 hover:bg-slate-100"
          onClick={() => setZoom((z) => Math.min(4, z * 1.18))}
        >
          +
        </button>
      </div>

      {toast && (
        <div className="animate-toast-in absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-800/90 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {showAdmin && <AdminPanel api={api} onClose={() => setShowAdmin(false)} />}

      {reportFor && (
        <div
          className="animate-fade-in absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/40"
          onPointerDown={(e) => {
            e.stopPropagation();
            setReportFor(null);
          }}
        >
          <form
            className="animate-slide-up w-80 rounded-xl bg-white p-4 shadow-xl"
            onSubmit={submitReport}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Hisobot berish</h3>
            <p className="mb-3 text-xs text-slate-400">{"Ushbu element moderatorlar ko'rib chiqishi uchun belgilanadi."}</p>
            <textarea
              autoFocus
              className="mb-2 h-24 w-full resize-none rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              placeholder="Sabab (kamida 3 belgi)"
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              minLength={3}
              maxLength={500}
              required
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md bg-slate-100 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
                onClick={() => setReportFor(null)}
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                className="flex-1 rounded-md bg-red-600 py-1.5 text-sm font-medium text-white transition hover:bg-red-500"
              >
                Yuborish
              </button>
            </div>
          </form>
        </div>
      )}

      {!currentRoom && hasMore && (
        <div className="absolute bottom-6 left-1/2 z-40 -translate-x-1/2" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            disabled={loadingOlder}
            onClick={() => void loadOlderItems()}
            className="rounded-full bg-slate-800/90 px-5 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-slate-700 disabled:opacity-50"
          >
            {loadingOlder ? "Yuklanmoqda..." : "Eski elementlarni ko'rish"}
          </button>
        </div>
      )}
    </div>
  );
}
