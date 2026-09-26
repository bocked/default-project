import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sharp from "sharp";
import { startTestServer, cleanDatabase, request, unique, type TestServer } from "./helpers.js";

async function pngBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 40, channels: 3, background: "#2f5dbe" } })
    .png()
    .toBuffer();
}

function postFile(base: string, path: string, body: FormData, token?: string): Promise<Response> {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
}

describe("E2E: Image uploads (WebP optimisation + static serving)", () => {
  let ts: TestServer;
  let base: string;
  let token: string;

  beforeAll(async () => {
    ts = await startTestServer();
    base = ts.base;
    await cleanDatabase();

    const email = `${unique("upl")}@example.com`;
    const reg = await request(base, "POST", "/api/auth/register", {
      body: { email, password: "s3cret-password" },
    });
    expect(reg.status).toBe(201);
    const login = await request(base, "POST", "/api/auth/login", { body: { email, password: "s3cret-password" } });
    expect(login.status).toBe(200);
    token = login.json.token;
  });

  afterAll(async () => {
    await ts.close();
  });

  it("transcodes an uploaded PNG to WebP and serves it statically", async () => {
    const png = await pngBuffer();
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "avatar.png");

    const res = await postFile(base, "/api/uploads", form, token);
    expect(res.status).toBe(201);
    const json = (await res.json()) as {
      ok: boolean;
      url: string;
      publicPath: string;
      width: number;
      height: number;
      bytes: number;
    };
    expect(json.ok).toBe(true);
    expect(json.publicPath).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);
    expect(json.url).toBe(`https://api.yerlikoglon.uz${json.publicPath}`);
    expect(json.width).toBe(64);
    expect(json.height).toBe(40);

    const served = await fetch(`${base}${json.publicPath}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toMatch(/^image\/webp/);
    const bytes = await served.arrayBuffer();
    const meta = await sharp(Buffer.from(bytes)).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(40);
  });

  it("also converts a JPEG input into WebP", async () => {
    const jpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#123456" } })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "photo.jpg");

    const res = await postFile(base, "/api/uploads", form, token);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { publicPath: string };
    const served = await fetch(`${base}${json.publicPath}`);
    expect(served.headers.get("content-type")).toMatch(/^image\/webp/);
  });

  it("requires an authenticated user", async () => {
    const png = await pngBuffer();
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "avatar.png");
    const res = await postFile(base, "/api/uploads", form);
    expect(res.status).toBe(401);
  });

  it("rejects non-image files with 415", async () => {
    const form = new FormData();
    form.append("file", new Blob(["hello world"], { type: "text/plain" }), "notes.txt");
    const res = await postFile(base, "/api/uploads", form, token);
    expect(res.status).toBe(415);
  });

  it("rejects files above the 5MB cap with 413", async () => {
    const big = Buffer.alloc(6 * 1024 * 1024);
    const form = new FormData();
    form.append("file", new Blob([big], { type: "image/png" }), "big.png");
    const res = await postFile(base, "/api/uploads", form, token);
    expect(res.status).toBe(413);
  });

  it("rejects corrupt image bytes with 415", async () => {
    const form = new FormData();
    form.append("file", new Blob(["this is not an image at all"], { type: "image/png" }), "fake.png");
    const res = await postFile(base, "/api/uploads", form, token);
    expect(res.status).toBe(415);
  });

  it("serves 404 for missing files and never escapes the uploads root", async () => {
    const missing = await fetch(`${base}/uploads/no-such-file.webp`);
    expect(missing.status).toBe(404);

    const traversal = await fetch(`${base}/uploads/..%2Fpackage.json`);
    expect([403, 404]).toContain(traversal.status);
  });
});