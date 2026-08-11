import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient, type Socket } from "socket.io-client";
import { startTestServer, cleanDatabase, request, onceMatch, ADMIN_PASSWORD, type TestServer } from "./helpers.js";

describe("E2E: Socket.IO flows (connect, admin auth, bans, logs)", () => {
  let ts: TestServer;
  let base: string;

  const connect = (headers: Record<string, string> = {}): Socket =>
    ioClient(base, { transports: ["websocket"], extraHeaders: headers, reconnection: false });

  const waitEvent = <T>(socket: Socket, event: string, predicate: (payload: T) => boolean): Promise<T> =>
    onceMatch((cb) => socket.on(event, cb), predicate);

  const connectAndAuthAdmin = async (): Promise<Socket> => {
    const admin = connect();
    await waitEvent(admin, "connected", () => true);
    const authed = waitEvent(admin, "admin:authed", (p: any) => p.ok === true);
    admin.emit("admin:auth", { password: ADMIN_PASSWORD });
    await authed;
    return admin;
  };

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();
  });

  afterAll(async () => {
    await ts.close();
  });

  it("connects anonymously and receives connected with online + ip", async () => {
    const sock = connect({ "X-Forwarded-For": "203.0.113.10" });
    const connected = await waitEvent(sock, "connected", () => true);
    expect(typeof connected.online).toBe("number");
    expect(connected.ip).toBe("203.0.113.10");
    expect(sock.connected).toBe(true);
    sock.disconnect();
  });

  it("rejects admin:auth with a wrong password", async () => {
    const sock = connect();
    await waitEvent(sock, "connected", () => true);
    const rejected = waitEvent(sock, "admin:authed", (p: any) => p.ok === false);
    sock.emit("admin:auth", { password: "not-the-password" });
    const payload = await rejected;
    expect(payload.ok).toBe(false);
    sock.disconnect();
  });

  it("accepts admin:auth with the admin password", async () => {
    const sock = await connectAndAuthAdmin();
    sock.disconnect();
  });

  it("disconnects a connected client when its IP is banned", async () => {
    const ip = "203.0.113.42";
    const victim = connect({ "X-Forwarded-For": ip });
    await waitEvent(victim, "connected", () => true);

    const admin = await connectAndAuthAdmin();
    const banned = waitEvent(victim, "banned", () => true);
    admin.emit("admin:ban", { ipAddress: ip, reason: "E2E" });
    const payload = await banned;
    expect(payload.reason).toBeTruthy();

    await new Promise<void>((resolve) => {
      if (victim.disconnected) resolve();
      else victim.once("disconnect", () => resolve());
    });
    admin.disconnect();
  });

  it("rejects a connection from an already-banned IP", async () => {
    const ip = "203.0.113.99";
    const admin = await connectAndAuthAdmin();
    admin.emit("admin:ban", { ipAddress: ip, reason: "E2E" });

    // Wait until the ban is persisted (socket handler is async).
    let found = false;
    for (let i = 0; i < 20 && !found; i += 1) {
      await new Promise((r) => setTimeout(r, 100));
      const list = await request(base, "GET", "/api/admin/bans", { token: ADMIN_PASSWORD });
      found = list.json.bans.some((b: any) => b.ipAddress === ip);
    }
    expect(found).toBe(true);
    admin.disconnect();

    const victim = connect({ "X-Forwarded-For": ip });
    const err = await onceMatch((cb) => victim.on("connect_error", cb), () => true);
    expect(err.message).toBe("Banned");
    victim.disconnect();
  });

  it("forwards admin logs to authenticated admin sockets", async () => {
    const admin = await connectAndAuthAdmin();
    const log = waitEvent(admin, "admin:log", (p: any) => p.level === "ban");
    await request(base, "POST", "/api/admin/bans", {
      token: ADMIN_PASSWORD,
      body: { ipAddress: "203.0.113.200", reason: "E2E" },
    });
    const payload = await log;
    expect(payload.message).toContain("203.0.113.200");
    admin.disconnect();
  });
});
