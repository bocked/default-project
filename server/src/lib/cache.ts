/**
 * In-memory TTL cache.
 *
 * Sits in front of hot Prisma queries (banned-IP checks, room lists, the first
 * page of canvas items). It is intentionally small, dependency-free and
 * synchronous so it can be used inside hot middleware paths.
 *
 * Cross-instance consistency: caches hold data for a few seconds at most and
 * are invalidated through the Redis-backed event bus (`bus.publish`), which
 * every instance receives. Values are always safe to recompute.
 */
export class TTLCache {
  private store = new Map<string, { value: unknown; expires: number }>();

  constructor(private defaultTtlMs = 5000) {}

  private valid(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expires <= Date.now()) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  get<T>(key: string): T | undefined {
    return this.valid(key) ? (this.store.get(key)!.value as T) : undefined;
  }

  has(key: string): boolean {
    return this.valid(key);
  }

  set(key: string, value: unknown, ttlMs?: number): void {
    this.store.set(key, { value, expires: Date.now() + (ttlMs ?? this.defaultTtlMs) });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Deletes every key starting with the given prefix (e.g. "items:first:"). */
  deletePrefix(prefix: string): void {
    if (!prefix) return;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** Shared default cache instance (fine for a single-process server). */
export const cache = new TTLCache();

// Short, pragmatic TTLs for the hot paths.
export const CACHE_TTL = {
  /** Banned-IP lookup result, seconds. Bans are invalidated via bus anyway. */
  banned: 30_000,
  /** Public room list + room metadata. */
  rooms: 15_000,
  /** First page of the main canvas (invalidated on every write via bus). */
  itemsFirstPage: 1_500,
  /** Room item snapshots served by POST /api/rooms/:slug/items. */
  roomItems: 3_000,
};
