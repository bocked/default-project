import { describe, expect, it, beforeEach } from "vitest";
import { TTLCache } from "../cache.js";

describe("TTLCache", () => {
  let cache: TTLCache;

  beforeEach(() => {
    cache = new TTLCache(1000);
  });

  it("stores and returns values", () => {
    cache.set("a", { n: 1 });
    expect(cache.get("a")).toEqual({ n: 1 });
    expect(cache.has("a")).toBe(true);
  });

  it("expires entries after the default TTL", async () => {
    cache.set("a", 1, 50);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get("a")).toBeUndefined();
    expect(cache.has("a")).toBe(false);
  });

  it("honours a per-set TTL", async () => {
    cache.set("a", 1, 20_000);
    await new Promise((r) => setTimeout(r, 80));
    expect(cache.get("a")).toBe(1);
  });

  it("deletes keys", () => {
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.delete("a")).toBe(false);
  });

  it("clears everything", () => {
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("tracks size and prunes expired entries lazily", async () => {
    cache.set("a", 1, 20);
    cache.set("b", 2, 20_000);
    await new Promise((r) => setTimeout(r, 40));
    expect(cache.size).toBe(2);
    cache.get("a");
    expect(cache.size).toBe(1);
  });
});
