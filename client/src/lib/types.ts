export type ItemType = "TEXT" | "STICKY" | "IMAGE";

export interface CanvasItem {
  id: string;
  type: ItemType;
  content: string;
  x: number;
  y: number;
  color: string | null;
  reactions: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  updatedAt: number;
}

export interface CursorPayload {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  updatedAt: number;
}

export interface AdminLogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "ban" | "delete";
  message: string;
}

export interface Identity {
  name: string;
  color: string;
  ip: string;
}

export interface ServerConfig {
  url: string;
}
