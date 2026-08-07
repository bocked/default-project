import { describe, expect, it } from "vitest";
import { Cooldown } from "../cooldown.js";

describe("Cooldown", () => {
  it("allows the first call", () => {
    const c = new Cooldown(100);
    expect(c.check("a", 0)).toBe(true);
  });

  it("blocks calls within the window", () => {
    const c = new Cooldown(100);
    c.check("a", 0);
    expect(c.check("a", 50)).toBe(false);
  });

  it("allows calls after the window", () => {
    const c = new Cooldown(100);
    c.check("a", 0);
    expect(c.check("a", 100)).toBe(true);
  });

  it("tracks keys independently", () => {
    const c = new Cooldown(100);
    expect(c.check("a", 0)).toBe(true);
    expect(c.check("b", 0)).toBe(true);
  });

  it("releases a key on remove()", () => {
    const c = new Cooldown(1000);
    c.check("a", 0);
    c.remove("a");
    expect(c.check("a", 10)).toBe(true);
  });
});
