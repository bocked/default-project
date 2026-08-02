import { Redis } from "ioredis";
import { config } from "../config.js";

/**
 * Thin wrapper around ioredis. When REDIS_URL is not configured (or the
 * connection fails) the server keeps working in "memory mode" so local
 * development does not hard-require Redis.
 */
class RedisClient {
  readonly url: string;
  private _client: Redis | null = null;
  private _ready = false;

  constructor(url: string) {
    this.url = url;
  }

  get available(): boolean {
    return this._ready && this._client !== null;
  }

  get client(): Redis | null {
    return this._client;
  }

  async connect(): Promise<void> {
    if (!this.url) {
      console.warn("[redis] REDIS_URL not set - running in memory mode");
      return;
    }
    try {
      const client = new Redis(this.url, {
        maxRetriesPerRequest: 2,
        lazyConnect: true,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
      });
      client.on("error", () => {
        this._ready = false;
      });
      await client.connect();
      this._client = client;
      this._ready = true;
      console.info("[redis] connected");
    } catch (err) {
      console.warn("[redis] connection failed, falling back to memory mode:", err);
      this._client = null;
      this._ready = false;
    }
  }

  async ping(): Promise<boolean> {
    if (!this.available) return false;
    try {
      return (await this._client!.ping()) === "PONG";
    } catch {
      return false;
    }
  }
}

export const redis = new RedisClient(config.redisUrl);
