import type { PresenceUser } from "../types/index.js";

const ADJECTIVES = ["Tez", "Yorqin", "Kichik", "Buyuk", "Sirli", "Quvnoq", "Jasur", "Samimiy", "Zerikmas", "Ko'k"];
const NOUNS = ["Tulki", "Lo'chin", "Mushuk", "Sher", "Kapalak", "Burgut", "Yulduz", "Dengiz", "Olov", "Shamol"];

export function randomGuestName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${a} ${n} ${suffix}`;
}

export const CURSOR_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function randomCursorColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

interface InternalUser extends PresenceUser {
  ip: string;
  userId?: string;
  roomId: string | null;
}

/**
 * Per-instance presence store. Tracks connected users, their cursor position,
 * the room they are in and the client IP (used to disconnect banned users).
 * A `roomId` of `null` means the public "main" canvas.
 */
class PresenceStore {
  private users = new Map<string, InternalUser>();

  join(
    socketId: string,
    ip: string,
    name: string,
    color: string,
    userId?: string,
    roomId: string | null = null,
    now = Date.now()
  ): void {
    this.users.set(socketId, {
      id: socketId,
      ip,
      name,
      color,
      x: 0,
      y: 0,
      updatedAt: now,
      userId,
      roomId,
    });
  }

  /** Moves a connected user into another room (or back to main with `null`). */
  setRoom(socketId: string, roomId: string | null): void {
    const user = this.users.get(socketId);
    if (user) user.roomId = roomId;
  }

  /** Updates a connected user's display identity (guest name / cursor color). */
  setIdentity(socketId: string, name: string, color: string): void {
    const user = this.users.get(socketId);
    if (!user) return;
    user.name = name;
    user.color = color;
  }

  roomOf(socketId: string): string | null | undefined {
    return this.users.get(socketId)?.roomId;
  }

  leave(socketId: string): void {
    this.users.delete(socketId);
  }

  touch(socketId: string, x: number, y: number, now = Date.now()): void {
    const user = this.users.get(socketId);
    if (!user) return;
    user.x = x;
    user.y = y;
    user.updatedAt = now;
  }

  get(socketId: string): InternalUser | undefined {
    return this.users.get(socketId);
  }

  ipOf(socketId: string): string | undefined {
    return this.users.get(socketId)?.ip;
  }

  count(): number {
    return this.users.size;
  }

  /** Number of connections currently held by a single IP. */
  countByIp(ip: string): number {
    let n = 0;
    for (const user of this.users.values()) {
      if (user.ip === ip) n += 1;
    }
    return n;
  }

  private toPublic(user: InternalUser): PresenceUser {
    const { ip: _ip, roomId: _roomId, ...pub } = user;
    return pub;
  }

  snapshot(): PresenceUser[] {
    return [...this.users.values()].map((u) => this.toPublic(u));
  }

  /** Users currently inside a single room (`null` = main canvas). */
  snapshotForRoom(roomId: string | null): PresenceUser[] {
    return [...this.users.values()]
      .filter((u) => (u.roomId ?? null) === roomId)
      .map((u) => this.toPublic(u));
  }

  /** Number of users inside a single room (`null` = main canvas). */
  countByRoom(roomId: string | null): number {
    let n = 0;
    for (const user of this.users.values()) {
      if ((user.roomId ?? null) === roomId) n += 1;
    }
    return n;
  }

  /** Distinct room ids currently occupied (including main as `null`). */
  rooms(): (string | null)[] {
    const set = new Set<string | null>();
    for (const user of this.users.values()) set.add(user.roomId ?? null);
    return [...set];
  }

  /** Removes users that have not sent a heartbeat for `staleMs`. */
  sweep(staleMs: number, now = Date.now()): void {
    for (const [id, user] of this.users) {
      if (now - user.updatedAt > staleMs) this.users.delete(id);
    }
  }

  /** Empties the store (used by tests). */
  clear(): void {
    this.users.clear();
  }
}

export const presence = new PresenceStore();
