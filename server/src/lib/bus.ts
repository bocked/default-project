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
      this.emitter.emit(channel, payload);
    }
  }

  subscribe(channel: string, handler: Handler): void {
    this.emitter.on(channel, handler);
    if (redis.available) {
      this.ensureRedisSubscriber(channel);
    }
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
