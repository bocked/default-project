"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { CanvasApi } from "@/hooks/useCanvas";
import { useAuth } from "./AuthProvider";

export default function RoomSwitcher({ api }: { api: CanvasApi }) {
  const { user } = useAuth();
  const { currentRoom, rooms, joinRoom, leaveRoom, createRoom, fetchRooms, roomError } = api;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"list" | "create">("list");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privateFor, setPrivateFor] = useState<{ slug: string; name: string } | null>(null);
  const [privatePassword, setPrivatePassword] = useState("");
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      void fetchRooms();
    }
  }, [open, fetchRooms]);

  const join = useCallback(
    (slug: string, isPrivate: boolean) => {
      if (isPrivate) {
        setPrivateFor({ slug, name: slug });
        return;
      }
      joinRoom(slug);
      setOpen(false);
      setError(null);
    },
    [joinRoom]
  );

  const submitPrivate = (e: FormEvent) => {
    e.preventDefault();
    if (!privateFor) return;
    joinRoom(privateFor.slug, privatePassword);
    setOpen(false);
    setError(null);
    setPrivateFor(null);
    setPrivatePassword("");
  };

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Xona yaratish uchun hisobga kiring");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom({
        name: name.trim(),
        description: description.trim() || undefined,
        isPublic,
        password: isPublic ? undefined : password || undefined,
      });
      setName("");
      setDescription("");
      setPassword("");
      setOpen(false);
      void fetchRooms();
      joinRoom(room.slug, password || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xona yaratilmadi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="pointer-events-auto absolute left-3 top-3 z-50" onPointerDown={(e) => e.stopPropagation()}>
        {currentRoom ? (
          <div className="flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="max-w-40 truncate text-sm font-medium text-slate-700">{currentRoom.name}</span>
            {!currentRoom.isPublic && <span className="text-xs text-slate-400">🔒</span>}
            <button
              className="ml-1 rounded-full px-2 py-0.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() => leaveRoom()}
            >
              Chiqish
            </button>
          </div>
        ) : (
          <button
            className="rounded-full bg-white/95 px-3 py-1.5 text-sm font-medium text-slate-700 shadow transition hover:bg-white active:scale-95"
            onClick={() => setOpen((o) => !o)}
          >
            🚪 Xonalar
          </button>
        )}
      </div>

      {open && (
        <div className="animate-slide-up absolute left-3 top-14 z-50 w-80 rounded-xl bg-white p-4 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
          <div className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              className={`flex-1 rounded-md py-1 text-sm font-medium transition active:scale-[0.98] ${mode === "list" ? "bg-white shadow" : "text-slate-500"}`}
              onClick={() => {
                setMode("list");
                setError(null);
              }}
            >
              Xonalar
            </button>
            <button
              className={`flex-1 rounded-md py-1 text-sm font-medium transition active:scale-[0.98] ${mode === "create" ? "bg-white shadow" : "text-slate-500"}`}
              onClick={() => {
                setMode("create");
                setError(null);
              }}
            >
              {"Yangi xona"}
            </button>
          </div>

          {(error || roomError) && <p className="mb-2 text-xs text-red-600">{error ?? roomError}</p>}

          {mode === "list" ? (
            <div className="max-h-72 space-y-1.5 overflow-y-auto">
              <button
                className="w-full rounded-lg bg-slate-50 px-3 py-1.5 text-left text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                onClick={() => {
                  void fetchRooms();
                }}
              >
                ↻ Yangilash
              </button>
              {rooms.length === 0 && <p className="px-1 py-2 text-sm text-slate-400">{"Hozircha xonalar yo'q."}</p>}
              {rooms.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-slate-800">{r.name}</span>
                      {!r.isPublic && <span className="text-xs">🔒</span>}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {r.itemCount} element
                      {r.description ? ` · ${r.description}` : ""}
                    </div>
                  </div>
                  <button
                    className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-slate-700 active:scale-95"
                    onClick={() => join(r.slug, !r.isPublic)}
                  >
                    Kirish
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <form onSubmit={submitCreate} className="space-y-2">
              <input
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                placeholder="Xona nomi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                required
              />
              <input
                className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                placeholder="Tavsif (ixtiyoriy)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
              />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => setIsPublic(e.target.checked)}
                />
                Ommaviy xona
              </label>
              {!isPublic && (
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                  placeholder="Parol (kamida 4 belgi)"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={4}
                  maxLength={128}
                  required
                />
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-md bg-slate-800 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-50"
              >
                {busy ? "Yaratilmoqda..." : "Yaratish"}
              </button>
            </form>
          )}
        </div>
      )}

      {privateFor && (
        <div
          className="animate-fade-in absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/40"
          onPointerDown={(e) => {
            e.stopPropagation();
            setPrivateFor(null);
            setPrivatePassword("");
          }}
        >
          <form onSubmit={submitPrivate} className="animate-slide-up w-72 rounded-xl bg-white p-4 shadow-xl" onPointerDown={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Maxfiy xona: {privateFor.name}</h3>
            <p className="mb-3 text-xs text-slate-400">Kirish uchun parol kerak.</p>
            <input
              autoFocus
              className="mb-2 w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              placeholder="Parol"
              type="password"
              value={privatePassword}
              onChange={(e) => setPrivatePassword(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-md bg-slate-100 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
                onClick={() => {
                  setPrivateFor(null);
                  setPrivatePassword("");
                }}
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                className="flex-1 rounded-md bg-slate-800 py-1.5 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Kirish
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
