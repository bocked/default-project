"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { config } from "@/lib/config";
import type {
  AdminLogEntry,
  CanvasItem,
  CursorPayload,
  Identity,
  ItemType,
  PresenceUser,
} from "@/lib/types";

const CURSOR_TTL_MS = 6000;

export function useCanvas() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [banned, setBanned] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorPayload>>({});
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [online, setOnline] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLogs, setAdminLogs] = useState<AdminLogEntry[]>([]);

  useEffect(() => {
    const socket = io(config.url, {
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("banned", () => setBanned(true));

    socket.on("canvas:init", (data: { online: number; ip: string; name: string; color: string }) => {
      setIdentity({ ip: data.ip, name: data.name, color: data.color });
      setOnline(data.online);
    });

    socket.on("canvas:item-add", (payload: { item: CanvasItem }) => {
      setItems((prev) => (prev.some((i) => i.id === payload.item.id) ? prev : [...prev, payload.item]));
    });

    socket.on("canvas:item-move", (payload: { id: string; x: number; y: number }) => {
      setItems((prev) => prev.map((i) => (i.id === payload.id ? { ...i, x: payload.x, y: payload.y } : i)));
    });

    socket.on("canvas:item-delete", (payload: { id: string }) => {
      setItems((prev) => prev.filter((i) => i.id !== payload.id));
    });

    socket.on("canvas:item-reaction", (payload: { id: string; reactions: Record<string, number> }) => {
      setItems((prev) => prev.map((i) => (i.id === payload.id ? { ...i, reactions: payload.reactions } : i)));
    });

    socket.on("canvas:clear", () => setItems([]));

    socket.on("cursor:move", (payload: CursorPayload) => {
      const now = Date.now();
      setCursors((prev) => {
        const next: Record<string, CursorPayload> = {};
        for (const [id, c] of Object.entries(prev)) {
          if (now - c.updatedAt < CURSOR_TTL_MS) next[id] = c;
        }
        next[payload.id] = { ...payload, updatedAt: now };
        return next;
      });
    });

    socket.on("presence:update", (payload: { users: PresenceUser[]; online: number }) => {
      setPresence(payload.users);
      setOnline(payload.online);
    });

    socket.on("admin:authed", (payload: { ok: boolean }) => {
      setIsAdmin(payload.ok);
    });

    socket.on("admin:log", (entry: AdminLogEntry) => {
      setAdminLogs((prev) => [...prev.slice(-199), entry]);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Prune stale cursors periodically.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCursors((prev) => {
        const stale = Object.values(prev).some((c) => now - c.updatedAt >= CURSOR_TTL_MS);
        if (!stale) return prev;
        const next: Record<string, CursorPayload> = {};
        for (const [id, c] of Object.entries(prev)) {
          if (now - c.updatedAt < CURSOR_TTL_MS) next[id] = c;
        }
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const send = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const addItem = useCallback(
    (type: ItemType, content: string, x: number, y: number, color?: string) => {
      send("canvas:item-add", { type, content, x, y, color });
    },
    [send]
  );

  const moveItem = useCallback(
    (id: string, x: number, y: number) => {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, x, y } : i)));
      send("canvas:item-move", { id, x, y });
    },
    [send]
  );

  const deleteItem = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      send("canvas:item-delete", { id });
    },
    [send]
  );

  const react = useCallback(
    (id: string, emoji: string) => {
      send("canvas:reaction", { id, emoji });
    },
    [send]
  );

  const updateCursor = useCallback(
    (x: number, y: number) => {
      send("cursor:move", { x, y });
    },
    [send]
  );

  const adminAuth = useCallback(
    (password: string) => {
      send("admin:auth", { password });
    },
    [send]
  );

  const adminBan = useCallback(
    (ipAddress: string, reason?: string) => {
      send("admin:ban", { ipAddress, reason });
    },
    [send]
  );

  const adminUnban = useCallback(
    (ipAddress: string) => {
      send("admin:unban", { ipAddress });
    },
    [send]
  );

  const adminDeleteItem = useCallback(
    (id: string) => {
      send("admin:delete", { id });
    },
    [send]
  );

  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${config.url}/api/upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Upload failed");
    }
    const data = (await res.json()) as { url: string };
    return data.url;
  }, []);

  const fetchInitialItems = useCallback(async () => {
    try {
      const res = await fetch(`${config.url}/api/items`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: CanvasItem[] };
      setItems(data.items);
    } catch {
      /* server unreachable - socket will keep retrying */
    }
  }, []);

  return {
    connected,
    banned,
    identity,
    items,
    cursors,
    presence,
    online,
    isAdmin,
    adminLogs,
    addItem,
    moveItem,
    deleteItem,
    react,
    updateCursor,
    adminAuth,
    adminBan,
    adminUnban,
    adminDeleteItem,
    uploadImage,
    fetchInitialItems,
  };
}

export type CanvasApi = ReturnType<typeof useCanvas>;
