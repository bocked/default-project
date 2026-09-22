import { cache } from "./cache.js";
import { redis } from "./redis.js";

/**
 * Redis-backed read cache with an in-memory fallback.
 *
 * Public, slowly-changing data (categories, tags, quote of the day) is cached
 * here to take load off Postgres — especially important on the free tier.
 * When Redis is not available the same values are kept in the in-memory
 * `TTLCache`, so local development works with zero setup.
 *
 * Values are stored as JSON strings under `catalog:...` style keys. Every key
 * we write is tracked so `invalidateCaches(prefixes)` can evict exactly the
 * affected entries from both Redis and memory without a full flush.
 */

const KEY_SEP = ":";

const keyRegistry = new Set<string>();

export const CACHE_PREFIXES = {
  /** /api/categories and /api/tags responses. */
  catalog: "catalog",
  /** Quote of the day payloads (keyed by date). */
  quoteOfDay: "qotd",
  /** Admin analytics aggregates (visitor history charts). */
  analytics: "analytics",
} as const;

function withPrefix(prefix: string, name: string): string {
  return `${prefix}${KEY_SEP}${name}`;
}

function track(key: string): void {
  keyRegistry.add(key);
}

/**
 * Returns the cached value for `prefix:name`, or computes it via `fetcher`
 * and stores it for `ttlMs`. Failures while reading/writing Redis are never
 * fatal — the DB query is always the safe fallback.
 */
export async function cachedGet<T>(
  prefix: string,
  name: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const key = withPrefix(prefix, name);

  const mem = cache.get<T>(key);
  if (mem !== undefined) return mem;

  if (redis.available) {
    try {
      const raw = await redis.client!.get(key);
      if (raw !== null) {
        const parsed = JSON.parse(raw) as T;
        cache.set(key, parsed, ttlMs);
        return parsed;
      }
    } catch {
      /* fall through to the fetcher */
    }
  }

  const value = await fetcher();
  track(key);
  cache.set(key, value, ttlMs);

  if (redis.available) {
    try {
      await redis.client!.set(key, JSON.stringify(value), "PX", ttlMs);
    } catch {
      /* non-fatal */
    }
  }

  return value;
}

/**
 * Evicts every cached entry whose key starts with any of the given prefixes.
 * Safe to call on every mutation that changes the underlying data.
 */
export async function invalidateCaches(prefixes: readonly string[]): Promise<void> {
  const unmatched: string[] = [];
  for (const key of [...keyRegistry]) {
    if (prefixes.some((p) => key.startsWith(`${p}${KEY_SEP}`))) {
      unmatched.push(key);
      keyRegistry.delete(key);
      cache.delete(key);
    }
  }
  if (redis.available && unmatched.length > 0) {
    try {
      await redis.client!.del(...unmatched);
    } catch {
      /* non-fatal */
    }
  }
}