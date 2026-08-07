import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import { startTestServer, cleanDatabase, request, unique, onceMatch, type TestServer } from "./helpers.js";

describe("E2E: Socket.IO flows (init, presence, items, reactions, rooms)", () => {
  let ts: TestServer;
  let base: string;
  let socket: Socket;
  let token = "";
  let socketItemId = "";

  const waitEvent = (event: string, predicate: (payload: any) => boolean) =>
    onceMatch((cb) => socket.on(event, cb), predicate);

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();

    const username = unique("e2esock");
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { username, password: "E2eSocketParol123!" },
    });
    token = reg.json.token;
  });

  afterAll(async () => {
    if (socket?.connected) socket.disconnect();
    await ts.close();
  });

  it("connects with a JWT and receives canvas:init", async () => {
    socket = ioClient(base, { transports: ["websocket"], auth: { token }, reconnection: false });
    const init = await waitEvent("canvas:init", () => true);
    expect(typeof init.online).toBe("number");
    expect(init.userId).toBeTruthy();
    expect(socket.connected).toBe(true);
  });

  it("broadcasts a canvas:item-add created over the socket", async () => {
    const echo = waitEvent("canvas:item-add", (p: any) => p.item?.type === "TEXT");
    socket.emit("canvas:item-add", { type: "TEXT", content: "socket yozuv", x: 5, y: 5 });
    const payload = await echo;
    expect(payload.item.content).toBe("socket yozuv");
    socketItemId = payload.item.id;
  });

  it("moves an owned item and receives canvas:item-move", async () => {
    const move = waitEvent("canvas:item-move", (p: any) => p.id === socketItemId && p.x === 50);
    socket.emit("canvas:item-move", { id: socketItemId, x: 50, y: 60 });
    const payload = await move;
    expect(payload.y).toBe(60);
  });

  it("adds a reaction and receives canvas:item-reaction", async () => {
    const reacted = waitEvent("canvas:item-reaction", (p: any) => p.id === socketItemId);
    socket.emit("canvas:reaction", { id: socketItemId, emoji: "❤️" });
    const payload = await reacted;
    expect(payload.reactions?.["❤️"]).toBeGreaterThanOrEqual(1);
  });

  it("soft-deletes an owned item and receives canvas:item-delete", async () => {
    const del = waitEvent("canvas:item-delete", (p: any) => p.id === socketItemId);
    socket.emit("canvas:item-delete", { id: socketItemId });
    await del;
    const list = await request(base, "GET", "/api/items?limit=500");
    expect(list.json.items.some((i: any) => i.id === socketItemId)).toBe(false);
  });

  it("joins a room over the socket and gets room:joined", async () => {
    const room = await request(base, "POST", "/api/rooms", {
      token,
      body: { name: "Socket Xona", isPublic: true },
    });
    const joined = waitEvent("room:joined", (p: any) => p.room?.slug === room.json.room.slug);
    socket.emit("room:join", { slug: room.json.room.slug });
    const payload = await joined;
    expect(payload.room.id).toBe(room.json.room.id);

    const left = waitEvent("room:left", () => true);
    socket.emit("room:leave");
    await left;
  });

  it("broadcasts presence:update when another client connects", async () => {
    const upd = waitEvent("presence:update", () => true);
    const second = ioClient(base, { transports: ["websocket"], auth: { token }, reconnection: false });
    await new Promise<void>((resolve) => second.on("connect", resolve));
    const payload = await upd;
    expect(typeof payload.online).toBe("number");
    second.disconnect();
  });

  it("rejects an invalid token with a connection error", async () => {
    const bad = ioClient(base, { transports: ["websocket"], auth: { token: "bogus" }, reconnection: false });
    const err = await onceMatch((cb) => bad.on("connect_error", cb), () => true);
    expect(err.message).toBeTruthy();
    bad.disconnect();
  });
});
