import { EventEmitter } from "node:events";
import { Redis } from "ioredis";
import { redis } from "./redis.js";

type Handler = (payload: unknown) => void;

/**
 * Cross-instance event bus.
 *
 * When Redis is available every event published locally is also pushed through
 * Redis Pub/Sub so that all server instances receive it. When Redis is not
 * available the bus degrades to a single-process EventEmitter, which is
 * sufficient for local development.
 */
class EventBus {
  private emitter = new EventEmitter();
  private subscribedChannels = new Set<string>();
  private subscriber: Redis | null = null;

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  async publish(channel: string, payload: unknown): Promise<void> {
    if (redis.available) {
      // Delivered back to us (and other instances) through the subscriber,
      // avoiding duplicate local delivery.
      try {
        await redis.client!.publish(channel, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    } else {
      // A listener that throws would otherwise propagate out of the synchronous
      // `emit`, turning this async method into a rejected promise. One bad
      // subscriber must never be able to take the server down or silently
      // swallow the deliveries of every other subscriber on this channel.
      try {
        this.emitter.emit(channel, payload);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Registers a local handler and returns its disposer.
   *
   * The bus is a module-level singleton, so a handler that is registered and
   * never removed keeps its closure - and everything that closure captures, such
   * as a socket.io `Server` - alive for the life of the process. Any caller that
   * owns a resource with a lifetime (a server, a client) must keep the returned
   * disposer and call it when that resource goes away, otherwise repeated
   * init/teardown cycles stack duplicate listeners that all fire on every event.
   *
   * Only the local listener is removed. The Redis channel subscription stays:
   * it is shared by every handler on that channel via `subscribedChannels`, and
   * dropping it while another handler still wants it would silently stop
   * cross-instance delivery for that channel.
   */
  subscribe(channel: string, handler: Handler): () => void {
    this.emitter.on(channel, handler);
    if (redis.available) {
      this.ensureRedisSubscriber(channel);
    }
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      this.emitter.off(channel, handler);
    };
  }

  private ensureRedisSubscriber(channel: string): void {
    if (this.subscribedChannels.has(channel)) return;
    this.subscribedChannels.add(channel);

    if (!this.subscriber) {
      this.subscriber = redis.client!.duplicate();
      this.subscriber.on("message", (ch, message) => {
        try {
          this.emitter.emit(ch, JSON.parse(message));
        } catch {
          /* ignore malformed messages */
        }
      });
      this.subscriber.connect().catch(() => {});
    }

    this.subscriber.subscribe(channel).catch(() => {});
  }
}

export const bus = new EventBus();
