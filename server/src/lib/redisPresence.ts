import { redis } from "./redis.js";

/**
 * Redis-backed presence aggregation for true multi-instance online counts.
 *
 * Every instance keeps its own in-memory `presence` table (for low-latency
 * cursor rendering) and periodically syncs it here. `count(room)` then reads
 * the aggregate across all instances. When Redis is unavailable every method
 * is a no-op and callers fall back to the local presence table.
 */

const PRESENCE_TTL_MS = 30_000;

function keyFor(roomId: string | null): string {
  return `presence:${roomId ?? "main"}`;
}

/** Replace the local snapshot for a room with fresh Redis members. */
export async function syncRoom(roomId: string | null, members: { id: string; x: number; y: number }[]): Promise<void> {
  if (!redis.available) return;
  const key = keyFor(roomId);
  try {
    const now = Date.now();
    const client = redis.client!;
    const pipe = client.pipeline();
    pipe.del(key);
    if (members.length > 0) {
      const args: Array<string | number> = [];
      for (const m of members) args.push(now, m.id);
      pipe.zadd(key, ...args);
      pipe.pexpire(key, PRESENCE_TTL_MS);
    }
    await pipe.exec();
  } catch {
    /* Redis may be flaky - fall back to local counts */
  }
}

/** Remove a single socket (e.g. on disconnect). */
export async function removeMember(roomId: string | null, socketId: string): Promise<void> {
  if (!redis.available) return;
  try {
    await redis.client!.zrem(keyFor(roomId), socketId);
  } catch {
    /* ignore */
  }
}

/** Aggregate online count for a room, pruning stale members first. */
export async function count(roomId: string | null): Promise<number | null> {
  if (!redis.available) return null;
  const key = keyFor(roomId);
  try {
    const client = redis.client!;
    await client.zremrangebyscore(key, 0, Date.now() - PRESENCE_TTL_MS);
    return await client.zcard(key);
  } catch {
    return null;
  }
}
