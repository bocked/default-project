import { describe, expect, it } from "vitest";
import { presence, randomGuestName, randomCursorColor } from "../../socket/presence.js";

describe("presence", () => {
  it("joins and counts users", () => {
    presence.clear();
    presence.join("s1", "1.1.1.1", "Alice", "#fff");
    presence.join("s2", "1.1.1.1", "Bob", "#000");
    presence.join("s3", "2.2.2.2", "Carol", "#111");
    expect(presence.count()).toBe(3);
  });

  it("counts connections per ip", () => {
    expect(presence.countByIp("1.1.1.1")).toBe(2);
    expect(presence.countByIp("2.2.2.2")).toBe(1);
    expect(presence.countByIp("9.9.9.9")).toBe(0);
  });

  it("touches cursor position", () => {
    presence.touch("s1", 123, 456);
    expect(presence.get("s1")?.x).toBe(123);
    expect(presence.get("s1")?.y).toBe(456);
  });

  it("sweeps stale users", () => {
    presence.clear();
    presence.join("s1", "1.1.1.1", "Alice", "#fff", undefined, null, 0);
    presence.join("s2", "1.1.1.1", "Bob", "#000", undefined, null, 0);
    presence.touch("s1", 1, 1, 39_500); // fresh relative to now=40_000
    presence.sweep(30_000, 40_000);
    expect(presence.get("s1")).toBeDefined();
    expect(presence.get("s2")).toBeUndefined();
  });

  it("tracks users per room", () => {
    presence.clear();
    presence.join("s1", "1.1.1.1", "Alice", "#fff", undefined, "room-a");
    presence.join("s2", "1.1.1.1", "Bob", "#000", undefined, null);
    presence.join("s3", "2.2.2.2", "Carol", "#111", undefined, "room-a");
    expect(presence.countByRoom("room-a")).toBe(2);
    expect(presence.countByRoom(null)).toBe(1);
    expect(presence.snapshotForRoom("room-a").map((u) => u.id)).toEqual(["s1", "s3"]);
    expect(presence.rooms().sort()).toEqual(["room-a", null].sort());

    presence.setRoom("s3", "room-b");
    expect(presence.roomOf("s3")).toBe("room-b");
    expect(presence.countByRoom("room-a")).toBe(1);
  });

  it("snapshot excludes the ip field", () => {
    const snapshot = presence.snapshot();
    for (const user of snapshot) {
      expect(user).not.toHaveProperty("ip");
      expect(typeof user.id).toBe("string");
    }
  });

  it("leaves users on disconnect", () => {
    presence.clear();
    presence.join("s1", "1.1.1.1", "Alice", "#fff");
    presence.join("s2", "1.1.1.1", "Bob", "#000");
    presence.join("s3", "2.2.2.2", "Carol", "#111");
    presence.leave("s3");
    expect(presence.count()).toBe(2);
    presence.clear();
    expect(presence.count()).toBe(0);
  });

  it("generates guest names and colors", () => {
    expect(randomGuestName()).toMatch(/^[\w']+ [\w']+ \d{3}$/);
    expect(randomCursorColor()).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
