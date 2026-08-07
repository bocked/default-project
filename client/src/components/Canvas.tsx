"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasApi } from "@/hooks/useCanvas";
import type { CanvasItem, ItemType } from "@/lib/types";
import { exportPng, exportSvg, toExportItems, type ExportFormat } from "@/lib/export";
import { captureException } from "@/lib/sentry";
import Toolbar from "./Toolbar";
import AdminPanel from "./AdminPanel";
import AuthBar from "./AuthBar";
import RoomSwitcher from "./RoomSwitcher";
import CollaborationPanel from "./CollaborationPanel";
import ActivityPanel from "./ActivityPanel";
import { useAuth } from "./AuthProvider";

type Tool = "MOVE" | "TEXT" | "STICKY" | "IMAGE";
type SearchFilter = "ALL" | "STICKY" | "TEXT" | "IMAGE";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "💯"];

const STICKY_COLORS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e2e8f0"];
const TEXT_COLORS = ["#1e293b", "#334155", "#64748b", "#b91c1c", "#0f766e", "#7c3aed"];

interface Template {
  key: string;
  type: "STICKY" | "TEXT";
  label: string;
  icon: string;
  content: string;
  color: string;
}

const TEMPLATES: Template[] = [
  { key: "todo", type: "STICKY", label: "TODO", icon: "☑️", content: "TODO:\n- [ ] vazifa", color: "#fef08a" },
  { key: "eslatma", type: "STICKY", label: "Eslatma", icon: "📌", content: "Eslatma:", color: "#bbf7d0" },
  { key: "muhim", type: "STICKY", label: "Muhim", icon: "⭐", content: "Muhim!", color: "#fbcfe8" },
  { key: "savol", type: "STICKY", label: "Savol", icon: "❓", content: "Savol:", color: "#bfdbfe" },
  { key: "tayyor", type: "STICKY", label: "Tayyor", icon: "✅", content: "✅ Tayyor", color: "#bbf7d0" },
  { key: "sarlavha", type: "TEXT", label: "Sarlavha", icon: "🅷", content: "Sarlavha", color: "#1e293b" },
  { key: "xulosa", type: "TEXT", label: "Xulosa", icon: "🏁", content: "Xulosa:", color: "#334155" },
];

interface DragState {
  id: string;
  startClientX: number;
  startClientY: number;
  startWorldX: number;
  startWorldY: number;
}

interface EditState {
  id: string;
  text: string;
  color: string;
}

interface ResizeState {
  id: string;
  startClientX: number;
  startClientY: number;
  startW: number;
  startH: number;
}

interface EditAction {
  kind: "create" | "move" | "update" | "delete";
  id: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

const IMAGE_DEFAULT = 288;

export default function Canvas({ api }: { api: CanvasApi }) {
  const {
    connected,
    banned,
    identity,
    items,
    cursors,
    online,
    moveItem,
    updateItem,
    resizeItem,
    patchItemLocal,
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
  const [template, setTemplate] = useState<Template | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [panning, setPanning] = useState<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const resizeSendRef = useRef<{ last: number } | null>(null);
  const touchPointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ prevDist: number } | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number } | null>(null);
  const [pendingImage, setPendingImage] = useState<{ x: number; y: number } | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [reportFor, setReportFor] = useState<CanvasItem | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [lastDeletedId, setLastDeletedId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<SearchFilter>("ALL");
  const [activeMatch, setActiveMatch] = useState(0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [undoStack, setUndoStack] = useState<EditAction[]>([]);
  const [redoStack, setRedoStack] = useState<EditAction[]>([]);
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

  const zoomBy = useCallback(
    (factor: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const world = screenToWorld({ x: cx, y: cy });
      const next = Math.min(4, Math.max(0.2, zoom * factor));
      setOffset({ x: cx - world.x * next, y: cy - world.y * next });
      setZoom(next);
    },
    [zoom, screenToWorld]
  );

  const zoomReset = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setZoom(1);
    setOffset({ x: rect.width / 2, y: rect.height / 2 });
  }, []);

  const pushAction = useCallback((action: EditAction) => {
    setUndoStack((prev) => [...prev.slice(-49), action]);
    setRedoStack([]);
  }, []);

  const createItem = useCallback(
    (type: ItemType, content: string, x: number, y: number, color?: string) => {
      api.addItem(type, content, x, y, color);
      pushAction({ kind: "create", id: null, before: {}, after: { type, content, x, y, color: color ?? null } });
    },
    [api, pushAction]
  );

  const undoAction = useCallback(() => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, action]);
    if (action.kind === "create") {
      const a = action.after as { type: ItemType; content: string; x: number; y: number };
      const id =
        items.find((i) => i.type === a.type && i.content === a.content && i.x === a.x && i.y === a.y)?.id ??
        action.id;
      if (id) api.deleteItem(id);
    } else if (action.kind === "move") {
      const b = action.before as { x: number; y: number };
      if (action.id) api.moveItem(action.id, b.x, b.y);
    } else if (action.kind === "update") {
      const b = action.before as { content?: string; color?: string; width?: number; height?: number };
      if (action.id) api.updateItem(action.id, b);
    } else if (action.kind === "delete") {
      if (action.id) {
        api.undoItem(action.id);
        setLastDeletedId((prev) => (prev === action.id ? null : prev));
      }
    }
  }, [undoStack, items, api]);

  const redoAction = useCallback(() => {
    const action = redoStack[redoStack.length - 1];
    if (!action) return;
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, action]);
    if (action.kind === "create") {
      const a = action.after as { type: ItemType; content: string; x: number; y: number; color?: string | null };
      api.addItem(a.type, a.content, a.x, a.y, a.color ?? undefined);
    } else if (action.kind === "move") {
      const a = action.after as { x: number; y: number };
      if (action.id) api.moveItem(action.id, a.x, a.y);
    } else if (action.kind === "update") {
      const a = action.after as { content?: string; color?: string; width?: number; height?: number };
      if (action.id) api.updateItem(action.id, a);
    } else if (action.kind === "delete") {
      if (action.id) api.deleteItem(action.id);
    }
  }, [redoStack, api]);


  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const name = currentRoom?.slug ?? "canvas";
      try {
        if (format === "png") {
          await exportPng(toExportItems(items), name);
          notify("PNG saqlandi ✓");
        } else {
          await exportSvg(toExportItems(items), name);
          notify("SVG saqlandi ✓");
        }
      } catch (err) {
        captureException(err, { context: "export" });
        notify("Eksport amalga oshmadi");
      }
    },
    [items, currentRoom, notify]
  );

  // Search: match loaded items by content (and optional type filter).
  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items
      .filter((i) => {
        if (searchFilter !== "ALL" && i.type !== searchFilter) return false;
        if (!q) return true;
        if (i.type === "IMAGE") return false;
        return i.content.toLowerCase().includes(q);
      })
      .map((i) => i.id);
  }, [items, searchQuery, searchFilter]);

  // "/" opens search; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && e.target === document.body) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
        setSearchFilter("ALL");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undoAction();
      } else if (e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        redoAction();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoAction();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoAction, redoAction]);

  const flyTo = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!item || !rect) return;
      const z = Math.max(zoom, 1);
      setZoom(z);
      setOffset({ x: rect.width / 2 - item.x * z, y: rect.height / 2 - item.y * z });
    },
    [items, zoom]
  );

  const stepMatch = useCallback(
    (dir: 1 | -1) => {
      if (matches.length === 0) return;
      const next = (activeMatch + dir + matches.length) % matches.length;
      setActiveMatch(next);
      flyTo(matches[next]);
    },
    [matches, activeMatch, flyTo]
  );

  // Own cursor position + broadcast.
  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const client = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      // Pinch zoom (two-finger touch).
      if (touchPointers.current.size >= 2 && e.pointerType === "touch") {
        touchPointers.current.set(e.pointerId, client);
        const pts = [...touchPointers.current.values()];
        if (pts.length >= 2) {
          const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
          if (pinchRef.current && pinchRef.current.prevDist > 0) {
            const next = Math.min(4, Math.max(0.2, zoom * (dist / pinchRef.current.prevDist)));
            const world = screenToWorld(mid);
            setOffset({ x: mid.x - world.x * next, y: mid.y - world.y * next });
            setZoom(next);
          }
          pinchRef.current = { prevDist: dist };
        }
        return;
      }

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
      if (resize) {
        const dx = (client.x - resize.startClientX) / zoom;
        const dy = (client.y - resize.startClientY) / zoom;
        const w = Math.round(Math.max(24, resize.startW + dx));
        const h = Math.round(Math.max(24, resize.startH + dy));
        // Optimistic local resize every frame; only send to the server at most
        // every 120ms (final size is flushed on pointer release).
        const now = Date.now();
        const last = resizeSendRef.current;
        if (!last || now - last.last >= 120) {
          resizeSendRef.current = { last: now };
          resizeItem(resize.id, w, h);
        } else {
          patchItemLocal(resize.id, { width: w, height: h });
        }
      }
    },
    [panning, drag, resize, zoom, screenToWorld, moveItem, updateCursor, resizeItem, patchItemLocal]
  );

  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const client = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const world = screenToWorld(client);

      // Track touch pointers; the second finger switches to pinch zoom.
      if (e.pointerType === "touch") {
        touchPointers.current.set(e.pointerId, client);
        if (touchPointers.current.size >= 2) {
          const pts = [...touchPointers.current.values()];
          pinchRef.current = { prevDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
          setPanning(null);
          return;
        }
      }

      if (template) {
        createItem(template.type, template.content, Math.round(world.x), Math.round(world.y), template.color);
        setTemplate(null);
        return;
      }
      if (tool === "TEXT") {
        setPendingText(world);
        return;
      }
      if (tool === "STICKY") {
        createItem("STICKY", "Yangi yozuv", Math.round(world.x), Math.round(world.y), color);
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
    [tool, template, screenToWorld, offset, color, createItem]
  );

  const endPointer = useCallback(() => {
    if (drag) {
      const item = items.find((i) => i.id === drag.id);
      if (item && (item.x !== drag.startWorldX || item.y !== drag.startWorldY)) {
        pushAction({
          kind: "move",
          id: drag.id,
          before: { x: drag.startWorldX, y: drag.startWorldY },
          after: { x: item.x, y: item.y },
        });
      }
    }
    if (resize) {
      const item = items.find((i) => i.id === resize.id);
      if (item) {
        const w = item.width ?? IMAGE_DEFAULT;
        const h = item.height ?? IMAGE_DEFAULT;
        if (w !== resize.startW || h !== resize.startH) {
          pushAction({
            kind: "update",
            id: resize.id,
            before: { width: resize.startW, height: resize.startH },
            after: { width: w, height: h },
          });
        }
        resizeItem(resize.id, w, h);
      }
      setResize(null);
      resizeSendRef.current = null;
    }
    setDrag(null);
    setPanning(null);
  }, [drag, resize, items, resizeItem, pushAction]);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      touchPointers.current.delete(e.pointerId);
      if (touchPointers.current.size < 2) pinchRef.current = null;
      endPointer();
    },
    [endPointer]
  );

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
      createItem("STICKY", "Yangi yozuv", Math.round(world.x), Math.round(world.y), color);
    },
    [tool, screenToWorld, color, createItem]
  );

  const commitText = useCallback(
    (content: string, cancel: boolean) => {
      if (!pendingText) return;
      if (!cancel && content.trim()) {
        createItem("TEXT", content.trim().slice(0, 4000), Math.round(pendingText.x), Math.round(pendingText.y), TEXT_COLORS[1]);
      }
      setPendingText(null);
    },
    [pendingText, createItem]
  );

  const commitEdit = useCallback(
    (cancel: boolean) => {
      if (!editing) return;
      const text = editing.text.trim();
      if (!cancel && text) {
        const item = items.find((i) => i.id === editing.id);
        pushAction({
          kind: "update",
          id: editing.id,
          before: { content: item?.content, color: item?.color ?? null },
          after: { content: text.slice(0, 4000), color: editing.color },
        });
        updateItem(editing.id, { content: text.slice(0, 4000), color: editing.color });
      }
      setEditing(null);
    },
    [editing, items, updateItem, pushAction]
  );

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !pendingImage) return;
      try {
        const url = await api.uploadImage(file);
        createItem("IMAGE", url, Math.round(pendingImage.x), Math.round(pendingImage.y));
        notify("Rasm joylandi");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Rasm yuklashda xato");
      } finally {
        setPendingImage(null);
      }
    },
    [pendingImage, api, createItem, notify]
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
      pushAction({ kind: "delete", id: item.id, before: {}, after: {} });
      notify("Element o'chirildi");
    },
    [api, pushAction, notify]
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
        tool === "MOVE" && !template ? "cursor-grab" : "cursor-crosshair"
      } ${panning ? "cursor-grabbing" : ""} ${drag ? "cursor-grabbing" : ""}`}
      style={{
        backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
        backgroundPosition: `${offset.x}px ${offset.y}px`,
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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
          const isMatch = matches.length > 0 && matches.includes(item.id);
          const isActiveMatch = isMatch && matches[activeMatch] === item.id;
          const matchStyle = isActiveMatch
            ? { outline: "3px solid #2563eb", outlineOffset: "3px", borderRadius: "6px" }
            : isMatch
              ? { outline: "2px solid #f59e0b", outlineOffset: "2px", borderRadius: "6px" }
              : undefined;
          if (editing?.id === item.id) return null;
          return (
            <div key={item.id} className="absolute" style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -50%)" }}>
              <div
                onPointerDown={(e) => handleItemPointerDown(e, item)}
                onPointerEnter={() => setHoveredId(item.id)}
                onPointerLeave={() => setHoveredId(null)}
                onClick={(e) => {
                  if (!window.matchMedia("(pointer: coarse)").matches) return;
                  if ((e.target as HTMLElement).closest("button")) return;
                  e.stopPropagation();
                  setHoveredId((prev) => (prev === item.id ? null : item.id));
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if ((item.type === "TEXT" || item.type === "STICKY") && (isOwner(item) || isStaff(user))) {
                    setEditing({
                      id: item.id,
                      text: item.content,
                      color: item.color ?? (item.type === "STICKY" ? STICKY_COLORS[0] : TEXT_COLORS[1]),
                    });
                  } else {
                    flyTo(item.id);
                  }
                }}
                className="animate-pop-in group relative cursor-grab active:cursor-grabbing"
                style={{ animationDelay: `${Math.min(index, 24) * 10}ms`, ...matchStyle }}
              >
                {item.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.content}
                    alt=""
                    className="pointer-events-none rounded-md bg-white shadow-lg transition-shadow duration-200"
                    style={{
                      width: item.width ?? IMAGE_DEFAULT,
                      height: item.height ?? IMAGE_DEFAULT,
                      objectFit: "contain",
                      outline: isHovered ? "2px solid #3b82f6" : "none",
                    }}
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

                {/* Image resize handle */}
                {isHovered && item.type === "IMAGE" && (isOwner(item) || isStaff(user)) && (
                  <div
                    className="absolute right-1 bottom-1 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-white bg-blue-500 shadow"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const rect = containerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      setResize({
                        id: item.id,
                        startClientX: e.clientX - rect.left,
                        startClientY: e.clientY - rect.top,
                        startW: item.width ?? IMAGE_DEFAULT,
                        startH: item.height ?? IMAGE_DEFAULT,
                      });
                    }}
                    title="O'lchamini o'zgartirish"
                  />
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

        {/* Inline item editor */}
        {editing && items.find((i) => i.id === editing.id) && (
          <div
            className="animate-pop-in absolute z-20"
            style={{
              left: items.find((i) => i.id === editing.id)!.x,
              top: items.find((i) => i.id === editing.id)!.y,
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="w-64 rounded-lg bg-white p-2 shadow-xl ring-2 ring-blue-400">
              <textarea
                autoFocus
                value={editing.text}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    commitEdit(false);
                  }
                  if (e.key === "Escape") commitEdit(true);
                }}
                className="mb-1.5 h-24 w-full resize-none rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-blue-400"
                placeholder="Tahrirlash..."
              />
              <div className="flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  {items
                    .find((i) => i.id === editing.id)
                    ?.type === "STICKY"
                    ? STICKY_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditing({ ...editing, color: c })}
                          className={`h-4 w-4 rounded-full transition ${editing.color === c ? "ring-2 ring-blue-500" : ""}`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))
                    : TEXT_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setEditing({ ...editing, color: c })}
                          className={`h-4 w-4 rounded-full transition ${editing.color === c ? "ring-2 ring-blue-500" : ""}`}
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => commitEdit(true)}
                    className="rounded-md px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100"
                  >
                    Bekor
                  </button>
                  <button
                    onClick={() => commitEdit(false)}
                    className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-blue-500"
                  >
                    Saqlash
                  </button>
                </div>
              </div>
            </div>
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
          templates={TEMPLATES}
          activeTemplateKey={template?.key ?? null}
          onPickTemplate={(key) => setTemplate(key ? (TEMPLATES.find((t) => t.key === key) ?? null) : null)}
          onAdmin={() => setShowAdmin(true)}
          onExport={handleExport}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onUndo={undoAction}
          onRedo={redoAction}
        />
      </div>

      {/* Search */}
      <div className="pointer-events-none absolute inset-x-0 top-16 z-40 flex flex-col items-center gap-1.5 p-3">
        <button
          onClick={() => setSearchOpen((o) => !o)}
          className={`pointer-events-auto flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-600 shadow transition hover:bg-white active:scale-95 ${
            searchOpen ? "opacity-0" : ""
          }`}
          title="Qidirish (/)"
        >
          🔍 Qidirish
        </button>
        {searchOpen && (
          <div className="animate-slide-up pointer-events-auto flex w-full max-w-md flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2">
              <input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    stepMatch(e.shiftKey ? -1 : 1);
                  }
                }}
                placeholder="Elementlardan qidirish..."
                className="flex-1 rounded-lg bg-slate-50 px-3 py-1.5 text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                  setSearchFilter("ALL");
                }}
                className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                title="Yopish (Esc)"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1 px-0.5">
              {(["ALL", "STICKY", "TEXT", "IMAGE"] as SearchFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setSearchFilter(f)}
                  className={`rounded-md px-2 py-0.5 text-xs font-medium transition active:scale-95 ${
                    searchFilter === f ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {f === "ALL" ? "Hammasi" : f === "STICKY" ? "Yozuv" : f === "TEXT" ? "Matn" : "Rasm"}
                </button>
              ))}
            </div>
            <div className="px-1 text-xs text-slate-400">
              {matches.length > 0
                ? `${matches.length} ta — Enter keyingi, Shift+Enter oldingi`
                : searchQuery.trim() || searchFilter !== "ALL"
                  ? "Hech narsa topilmadi"
                  : 'Qidirish uchun yozing (yoki "/")'}
            </div>
          </div>
        )}
      </div>

      {/* Auth */}
      <div className="absolute right-3 top-3 z-50">
        <AuthBar />
      </div>

      {/* Rooms */}
      <RoomSwitcher api={api} />

      {/* Online users + guest identity */}
      <CollaborationPanel api={api} />

      {/* Activity feed */}
      <ActivityPanel api={api} />

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
      <div className="pointer-events-auto absolute right-3 bottom-4 z-40 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 shadow">
        <button
          className="rounded-full px-2 text-lg text-slate-600 hover:bg-slate-100"
          onClick={() => zoomBy(0.8)}
          title="Kichraytirish"
        >
          −
        </button>
        <span className="w-12 text-center text-xs font-medium text-slate-600">{Math.round(zoom * 100)}%</span>
        <button
          className="rounded-full px-2 text-lg text-slate-600 hover:bg-slate-100"
          onClick={() => zoomBy(1.25)}
          title="Kattalashtirish"
        >
          +
        </button>
        <button
          className="rounded-full px-2 text-sm text-slate-600 hover:bg-slate-100"
          onClick={zoomReset}
          title="100% ga qaytarish"
        >
          ⤢
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
