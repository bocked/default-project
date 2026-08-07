/**
 * Per-key cooldown gate. Returns `false` when the key was used within `ms`.
 * Replaces the inline `socket.data.last*` checks so the behaviour is testable.
 */
export class Cooldown {
  private last = new Map<string, number>();

  constructor(private readonly ms: number) {}

  /** Returns true when the key is NOT in cooldown (caller may proceed). */
  check(key: string, now = Date.now()): boolean {
    const last = this.last.get(key);
    if (last !== undefined && now - last < this.ms) return false;
    this.last.set(key, now);
    return true;
  }

  /** Drops a key (call on socket disconnect so memory is reclaimed). */
  remove(key: string): void {
    this.last.delete(key);
  }
}
