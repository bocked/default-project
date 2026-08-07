import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import { startTestServer, cleanDatabase, request, unique, onceMatch, type TestServer } from "./helpers.js";
import { prisma } from "../../src/lib/prisma.js";

describe("E2E: Socket.IO flows (init, presence, items, reactions, rooms)", () => {
  let ts: TestServer;
  let base: string;
  let socket: Socket;
  let token = "";
  let socketItemId = "";
  let userId = "";

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
    userId = init.userId;
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

  it("lets a guest set a custom name and color via identity:update", async () => {
    const guest = ioClient(base, { transports: ["websocket"], reconnection: false });
    const guestInit = onceMatch((cb) => guest.on("canvas:init", cb), () => true);
    await new Promise<void>((resolve) => guest.on("connect", resolve));
    await guestInit;
    const updated = onceMatch(
      (cb) => guest.on("identity:updated", cb),
      (p: any) => p.name === "Mehmon 007" && p.color === "#22c55e"
    );
    guest.emit("identity:update", { name: "  Mehmon 007  ", color: "#22c55e" });
    const payload = await updated;
    expect(payload).toEqual({ name: "Mehmon 007", color: "#22c55e" });
    guest.disconnect();
  });

  it("keeps an authenticated user's account name on identity:update", async () => {
    const upd = waitEvent("identity:updated", (p: any) => p.color === "#8b5cf6");
    socket.emit("identity:update", { name: "Qalbaki Ism", color: "#8b5cf6" });
    const payload = await upd;
    expect(payload.color).toBe("#8b5cf6");
    expect(payload.name).not.toBe("Qalbaki Ism");
  });

  it("updates an owned item's content and color via canvas:item-update", async () => {
    const item = await prisma.canvasItem.create({
      data: {
        type: "STICKY",
        content: "tahrirlash uchun",
        x: 7,
        y: 8,
        color: "#fef08a",
        ipAddress: "127.0.0.1",
        userId,
      },
    });
    const upd = waitEvent(
      "canvas:item-update",
      (p: any) => p.id === item.id && p.content === "yangi matn" && p.color === "#ef4444"
    );
    socket.emit("canvas:item-update", { id: item.id, content: "yangi matn", color: "#ef4444" });
    const payload = await upd;
    expect(payload.roomId).toBeNull();
    const list = await request(base, "GET", "/api/items?limit=500");
    const found = list.json.items.find((i: any) => i.id === item.id);
    expect(found.content).toBe("yangi matn");
    expect(found.color).toBe("#ef4444");
  });

  it("rejects edits to items the socket does not own", async () => {
    const item = await prisma.canvasItem.create({
      data: {
        type: "TEXT",
        content: "himoyalangan",
        x: 9,
        y: 9,
        ipAddress: "127.0.0.1",
        userId,
      },
    });

    const intruder = ioClient(base, { transports: ["websocket"], reconnection: false });
    const intruderInit = onceMatch((cb) => intruder.on("canvas:init", cb), () => true);
    await new Promise<void>((resolve) => intruder.on("connect", resolve));
    await intruderInit;
    const updated = onceMatch(
      (cb) => intruder.on("canvas:item-update", cb),
      (p: any) => p.id === item.id,
      700
    ).catch(() => null);
    intruder.emit("canvas:item-update", { id: item.id, content: "o'zgartirildi" });
    expect(await updated).toBeNull();

    const persisted = await prisma.canvasItem.findUnique({ where: { id: item.id } });
    expect(persisted?.content).toBe("himoyalangan");
    intruder.disconnect();
  });

  it("resizes an image item via canvas:item-update", async () => {
    const item = await prisma.canvasItem.create({
      data: {
        type: "IMAGE",
        content: "https://example.com/pic.png",
        x: 10,
        y: 10,
        ipAddress: "127.0.0.1",
        userId,
      },
    });
    const upd = waitEvent("canvas:item-update", (p: any) => p.id === item.id && p.width === 400 && p.height === 300);
    socket.emit("canvas:item-update", { id: item.id, width: 400, height: 300 });
    const payload = await upd;
    expect(payload.width).toBe(400);
    const found = await prisma.canvasItem.findUnique({ where: { id: item.id } });
    expect(found?.width).toBe(400);
    expect(found?.height).toBe(300);
  });

  it("broadcasts canvas:activity on item changes and exposes GET /api/activity", async () => {
    const item = await prisma.canvasItem.create({
      data: {
        type: "STICKY",
        content: "faoliyat logi",
        x: 12,
        y: 13,
        color: "#fef08a",
        ipAddress: "127.0.0.1",
        userId,
      },
    });

    const updated = waitEvent(
      "canvas:activity",
      (p: any) => p.itemId === item.id && p.action === "update"
    );
    socket.emit("canvas:item-update", { id: item.id, content: "faoliyat yangilandi" });
    const payload = await updated;
    expect(payload.itemType).toBe("STICKY");
    expect(payload.preview).toBe("faoliyat yangilandi");
    expect(payload.actorName).toBeTruthy();
    expect(payload.roomId).toBeNull();

    const res = await request(base, "GET", "/api/activity?limit=50");
    const matches = res.json.activity.filter((a: any) => a.itemId === item.id);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].action).toBe("update");
  });

  it("does not broadcast canvas:activity for item moves", async () => {
    const item = await prisma.canvasItem.create({
      data: {
        type: "TEXT",
        content: "siljuvchi",
        x: 20,
        y: 20,
        ipAddress: "127.0.0.1",
        userId,
      },
    });
    const moved = onceMatch(
      (cb) => socket.on("canvas:activity", cb),
      (p: any) => p.itemId === item.id,
      700
    ).catch(() => null);
    socket.emit("canvas:item-move", { id: item.id, x: 30, y: 30 });
    expect(await moved).toBeNull();
  });
});
