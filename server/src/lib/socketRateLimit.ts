/**
 * Minimal in-memory sliding-window rate limiter keyed by an arbitrary string
 * (socket id, client IP, ...). Used to protect socket event handlers.
 */
export class SocketRateLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number
  ) {}

  /** Returns true when the key is still within the allowed window. */
  allow(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  /** Number of currently tracked keys (useful for tests/cleanup). */
  size(): number {
    return this.hits.size;
  }

  /** Removes entries whose window has fully expired. */
  prune(now = Date.now()): void {
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) this.hits.delete(key);
    }
  }

  clear(): void {
    this.hits.clear();
  }
}
