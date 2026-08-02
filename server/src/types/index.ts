export type ItemType = "TEXT" | "STICKY" | "IMAGE";

export interface CanvasItem {
  id: string;
  type: ItemType;
  content: string;
  x: number;
  y: number;
  color?: string | null;
  ipAddress: string;
  reactions: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export interface BannedIpRecord {
  id: string;
  ipAddress: string;
  reason?: string | null;
  createdAt: string;
}

export interface PresenceUser {
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
