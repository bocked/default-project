import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { config } from "../../config.js";
import { processImageUpload, UploadError } from "../upload.js";

async function makePng(width: number, height: number, background: string): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background } as never })
    .png()
    .toBuffer();
}

describe("processImageUpload", () => {
  it("transcodes a PNG to a single WebP frame with a unique name", async () => {
    const input = await makePng(48, 32, "#c81e3c");
    const result = await processImageUpload(input);

    expect(result.fileName).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/);
    expect(result.publicPath).toBe(`/uploads/${result.fileName}`);
    expect(result.url).toBe(`${config.uploadsPublicBase}${result.publicPath}`);
    expect(result.width).toBe(48);
    expect(result.height).toBe(32);
    expect(result.bytes).toBe(result.buffer.length);

    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(48);
    expect(meta.height).toBe(32);
  });

  it("shrinks oversized edges to the cap and never upscales small files", async () => {
    const big = await makePng(4000, 2000, "#123456");
    const result = await processImageUpload(big, { maxDimension: 1280 });
    expect(result.width).toBe(1280);
    expect(result.height).toBe(640);
    expect(result.bytes).toBeLessThan(big.length);

    const small = await makePng(100, 50, "#ffffff");
    const kept = await processImageUpload(small, { maxDimension: 1280 });
    expect(kept.width).toBe(100);
    expect(kept.height).toBe(50);
  });

  it("rejects an empty file with 400", async () => {
    const error = await processImageUpload(Buffer.alloc(0)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).status).toBe(400);
  });

  it("rejects corrupt or non-image bytes with 415", async () => {
    for (const payload of ["not an image", "<svg></svg>", "GIF89a not really", "\u0000\u0001garbage"]) {
      const error = await processImageUpload(Buffer.from(payload)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(UploadError);
      expect((error as UploadError).status).toBe(415);
    }
  });

  it("rejects payloads above the byte cap with 413", async () => {
    const error = await processImageUpload(Buffer.alloc(1024), { maxBytes: 512 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).status).toBe(413);
  });

  it("rejects decompression bombs with 413", async () => {
    // 10000x10000 = 10^8 pixels > 4 * cap^2 used as the pixel budget guard.
    const png = await makePng(10000, 10000, "#000000");
    const error = await processImageUpload(png, { maxDimension: 1280 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).status).toBe(413);
  });
});