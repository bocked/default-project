export type ItemType = "TEXT" | "STICKY" | "IMAGE";

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

export type UserRole = "USER" | "MODERATOR" | "ADMIN";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  displayName: string;
  color: string;
  createdAt: string;
}

export interface CanvasItem {
  id: string;
  type: ItemType;
  content: string;
  x: number;
  y: number;
  color: string | null;
  width: number | null;
  height: number | null;
  reactions: Record<string, number>;
  userId: string | null;
  authorName: string | null;
  roomId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRoom {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  itemCount: number;
  createdAt: string;
}

export interface ActivityEntry {
  id: string;
  action: "create" | "move" | "update" | "delete" | "undo";
  itemId: string;
  itemType: ItemType;
  preview: string;
  actorName: string | null;
  at: string;
  roomId: string | null;
}
