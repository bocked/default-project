"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { config } from "@/lib/config";
import { useAuth } from "@/components/AuthProvider";
import type {
  AdminLogEntry,
  CanvasItem,
  CursorPayload,
  Identity,
  ItemType,
  PresenceUser,
  PublicRoom,
} from "@/lib/types";

const CURSOR_TTL_MS = 6000;

export function useCanvas() {
  const socketRef = useRef<Socket | null>(null);
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const [banned, setBanned] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [cursors, setCursors] = useState<Record<string, CursorPayload>>({});
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [online, setOnline] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLogs, setAdminLogs] = useState<AdminLogEntry[]>([]);
  const [currentRoom, setCurrentRoom] = useState<PublicRoom | null>(null);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Mirrors the current room id for use inside socket listeners.
  const roomIdRef = useRef<string | null>(null);
  const roomPasswordRef = useRef<string | null>(null);

  const fetchMainItems = useCallback(async () => {
    try {
      const res = await fetch(`${config.url}/api/items?limit=2000`);
      if (!res.ok) return;
      const data = (await res.json()) as { items: CanvasItem[] };
      setItems(data.items);
    } catch {
      /* server unreachable - socket will keep retrying */
    }
  }, []);

  const fetchRoomItems = useCallback(async (slug: string, password?: string) => {
    try {
      const res = await fetch(`${config.url}/api/rooms/${slug}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { items: CanvasItem[] };
      setItems(data.items);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const socket = io(config.url, {
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 5000,
      auth: token ? { token } : undefined,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      // Fresh connection always starts on the public canvas.
      setCurrentRoom(null);
      roomIdRef.current = null;
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("connect_error", () => {
      // Invalid/expired token - drop the session so the next render reconnects
      // as a guest.
      if (token) {
        window.localStorage.removeItem("canvas_token");
      }
    });

    socket.on("banned", () => setBanned(true));

    socket.on("canvas:init", (data: { online: number; ip: string; name: string; color: string; userId?: string | null }) => {
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

    socket.on("presence:update", (payload: { roomId?: string | null; users: PresenceUser[]; online: number }) => {
      // Only apply presence matching the room we are currently in.
      if ((payload.roomId ?? null) !== roomIdRef.current) return;
      setPresence(payload.users);
      setOnline(payload.online);
    });

    socket.on("admin:authed", (payload: { ok: boolean }) => {
      setIsAdmin(payload.ok);
    });

    socket.on("admin:log", (entry: AdminLogEntry) => {
      setAdminLogs((prev) => [...prev.slice(-199), entry]);
    });

    socket.on("room:joined", (payload: { room: PublicRoom }) => {
      setCurrentRoom(payload.room);
      roomIdRef.current = payload.room.id;
      setRoomError(null);
      setItems([]);
      void fetchRoomItems(payload.room.slug, roomPasswordRef.current ?? undefined).then(() => {
        roomPasswordRef.current = null;
      });
    });

    socket.on("room:left", () => {
      setCurrentRoom(null);
      roomIdRef.current = null;
      setItems([]);
      void fetchMainItems();
    });

    socket.on("room:error", (payload: { error: string }) => {
      roomPasswordRef.current = null;
      setRoomError(payload.error);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, fetchMainItems, fetchRoomItems]);

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

  const undoItem = useCallback(
    (id: string) => {
      send("canvas:item-undo", { id });
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
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Upload failed");
    }
    const data = (await res.json()) as { url: string };
    return data.url;
  }, [token]);

  const fetchInitialItems = useCallback(() => {
    void fetchMainItems();
  }, [fetchMainItems]);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`${config.url}/api/rooms`);
      if (!res.ok) return;
      const data = (await res.json()) as { rooms: PublicRoom[] };
      setRooms(data.rooms);
    } catch {
      /* server unreachable */
    }
  }, []);

  const joinRoom = useCallback(
    (slug: string, password?: string) => {
      roomPasswordRef.current = password ?? null;
      setRoomError(null);
      send("room:join", { slug, password });
    },
    [send]
  );

  const leaveRoom = useCallback(() => {
    send("room:leave");
  }, [send]);

  const createRoom = useCallback(
    async (input: { name: string; description?: string; isPublic?: boolean; password?: string }) => {
      if (!token) throw new Error("Xona yaratish uchun hisobga kiring");
      const res = await fetch(`${config.url}/api/rooms`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      const data = (await res.json().catch(() => ({}))) as { room?: PublicRoom; error?: string };
      if (!res.ok || !data.room) throw new Error(data.error ?? "Xona yaratilmadi");
      return data.room;
    },
    [token]
  );

  const reportItem = useCallback(
    async (itemId: string, reason: string) => {
      const res = await fetch(`${config.url}/api/report`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ itemId, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Hisobot yuborilmadi");
    },
    [token]
  );

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
    currentRoom,
    rooms,
    roomError,
    addItem,
    moveItem,
    deleteItem,
    undoItem,
    react,
    updateCursor,
    adminAuth,
    adminBan,
    adminUnban,
    adminDeleteItem,
    uploadImage,
    fetchInitialItems,
    fetchRooms,
    joinRoom,
    leaveRoom,
    createRoom,
    reportItem,
  };
}

export type CanvasApi = ReturnType<typeof useCanvas>;
