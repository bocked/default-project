import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Metadata, OutputInfo } from "sharp";
import { config } from "../config.js";

/** HTTP-respondable upload error (415 unsupported file, 400 corrupt image). */
export class UploadError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export interface ProcessedImage {
  /** Server-side stored file name: `<uuid>.webp` (unique, no user input). */
  fileName: string;
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
  /** Absolute URL clients may embed directly, e.g. `https://api.yerlikoglon.uz/uploads/x.webp`. */
  url: string;
  /** Relative web path served by the API, e.g. `/uploads/x.webp`. */
  publicPath: string;
}

/** Raster image formats accepted as *input* (then transcoded to WebP). */
const ALLOWED_INPUT_FORMATS = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff", "heif"]);

/**
 * Decodes an uploaded image, auto-rotates it, shrinks large edge lengths to the
 * configured cap (never upscaling), and transcodes everything to a single WebP
 * frame. Decoding failures (corrupt bytes, oversized dimensions) raise a
 * 415/400 UploadError instead of crashing the request.
 */
export async function processImageUpload(
  input: Buffer,
  options: { maxBytes?: number; maxDimension?: number } = {}
): Promise<ProcessedImage> {
  const maxBytes = options.maxBytes ?? config.maxUploadBytes;
  const maxDimension = options.maxDimension ?? config.maxUploadDimension;

  if (input.length === 0) throw new UploadError(400, "Fayl bo'sh");
  if (input.length > maxBytes) throw new UploadError(413, "Fayl juda katta");

  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    // failOn:"error" rejects corrupt headers — treat as a non-image.
    throw new UploadError(415, "Yaroqsiz rasm fayli");
  }

  if (!meta.format || !ALLOWED_INPUT_FORMATS.has(meta.format) || !meta.width || !meta.height) {
    throw new UploadError(415, "Yaroqsiz rasm fayli");
  }

  // Guard against decompression bombs: cap the pixel work sharp will do. The
// multiplier lets regular camera photos (e.g. 4000x3000) still be resized
// down while absurd dimensions (100M+ pixels) fail fast before decoding.
  if ((meta.width ?? 0) * (meta.height ?? 0) > maxDimension * maxDimension * 16) {
    throw new UploadError(413, "Rasm o'lchami juda katta");
  }

  let optimized: { data: Buffer; info: OutputInfo };
  try {
    // A valid header but truncated/corrupt pixel data (e.g. a cut-off GIF or
    // damaged JPEG) fails here — treat it like any other invalid image.
    optimized = await sharp(input, { failOn: "error", animated: false })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80, alphaQuality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new UploadError(415, "Yaroqsiz rasm fayli");
  }

  const fileName = `${randomUUID()}.webp`;
  const publicPath = `/uploads/${fileName}`;
  return {
    fileName,
    buffer: optimized.data,
    width: optimized.info.width,
    height: optimized.info.height,
    bytes: optimized.data.length,
    url: `${config.uploadsPublicBase}${publicPath}`,
    publicPath,
  };
}