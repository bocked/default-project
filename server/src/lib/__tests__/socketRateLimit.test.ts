import { describe, expect, it } from "vitest";
import { SocketRateLimiter } from "../socketRateLimit.js";

describe("SocketRateLimiter", () => {
  it("allows up to max calls in the window", () => {
    const limiter = new SocketRateLimiter(1000, 3);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 1)).toBe(true);
    expect(limiter.allow("ip", 2)).toBe(true);
    expect(limiter.allow("ip", 3)).toBe(false);
  });

  it("resets after the window", () => {
    const limiter = new SocketRateLimiter(1000, 1);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 500)).toBe(false);
    expect(limiter.allow("ip", 1000)).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = new SocketRateLimiter(1000, 1);
    expect(limiter.allow("a", 0)).toBe(true);
    expect(limiter.allow("b", 0)).toBe(true);
    expect(limiter.allow("a", 1)).toBe(false);
  });

  it("prune() removes expired entries", () => {
    const limiter = new SocketRateLimiter(1000, 1);
    limiter.allow("a", 0);
    expect(limiter.size()).toBe(1);
    limiter.prune(2000);
    expect(limiter.size()).toBe(0);
  });
});
