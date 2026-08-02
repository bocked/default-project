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
}

/**
 * Per-instance presence store. Tracks connected users, their cursor position
 * and the client IP (used to disconnect banned users).
 */
class PresenceStore {
  private users = new Map<string, InternalUser>();

  join(socketId: string, ip: string, name: string, color: string): void {
    this.users.set(socketId, {
      id: socketId,
      ip,
      name,
      color,
      x: 0,
      y: 0,
      updatedAt: Date.now(),
    });
  }

  leave(socketId: string): void {
    this.users.delete(socketId);
  }

  touch(socketId: string, x: number, y: number): void {
    const user = this.users.get(socketId);
    if (!user) return;
    user.x = x;
    user.y = y;
    user.updatedAt = Date.now();
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

  snapshot(): PresenceUser[] {
    return [...this.users.values()].map(({ ip: _ip, ...user }) => user);
  }

  /** Removes users that have not sent a heartbeat for `staleMs`. */
  sweep(staleMs: number): void {
    const now = Date.now();
    for (const [id, user] of this.users) {
      if (now - user.updatedAt > staleMs) this.users.delete(id);
    }
  }
}

export const presence = new PresenceStore();
