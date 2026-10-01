import { describe, it, expect } from "vitest";
import { bus } from "../bus.js";
import { redis } from "../redis.js";

// The bus is a module-level singleton, so a listener that is registered and
// never released outlives the server that created it. These tests pin the
// disposer contract that `initSocket` relies on: each `subscribe` returns a
// disposer that removes exactly its own listener, and calling it twice is safe.
describe("EventBus subscribe/dispose", () => {
  // The local EventEmitter path is only used when Redis is absent; with Redis
  // the publish goes over pub/sub and delivery is asynchronous, which would
  // make these assertions timing-dependent.
  const localOnly = { skip: redis.available };

  it("stops delivering to a disposed listener", localOnly, async () => {
    let calls = 0;
    const dispose = bus.subscribe("test:dispose", () => {
      calls++;
    });

    await bus.publish("test:dispose", {});
    expect(calls).toBe(1);

    dispose();
    await bus.publish("test:dispose", {});
    expect(calls).toBe(1);
  });

  it("removes only its own listener when several share a channel", localOnly, async () => {
    const seen: string[] = [];
    const disposeA = bus.subscribe("test:shared", () => seen.push("a"));
    const disposeB = bus.subscribe("test:shared", () => seen.push("b"));

    await bus.publish("test:shared", {});
    expect(seen).toEqual(["a", "b"]);

    disposeA();
    await bus.publish("test:shared", {});
    expect(seen).toEqual(["a", "b", "b"]);

    disposeB();
    await bus.publish("test:shared", {});
    expect(seen).toEqual(["a", "b", "b"]);
  });

  it("is idempotent, so double teardown cannot remove a later registration", localOnly, async () => {
    let first = 0;
    let second = 0;
    const dispose = bus.subscribe("test:idempotent", () => first++);

    // A later registration of the same function reference must survive an
    // already-consumed disposer rather than being silently dropped.
    const again = bus.subscribe("test:idempotent", () => second++);
    dispose();
    dispose();

    await bus.publish("test:idempotent", {});
    expect(first).toBe(0);
    expect(second).toBe(1);
    again();
  });
});