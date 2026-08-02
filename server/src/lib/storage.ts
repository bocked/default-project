import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LOCAL_UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

function r2Configured(): boolean {
  return Boolean(config.r2.accountId && config.r2.accessKeyId && config.r2.secretAccessKey);
}

function extFor(mime: string): string {
  return ALLOWED_MIME[mime] ?? "bin";
}

/**
 * Stores uploaded image files. Uses Cloudflare R2 when the credentials are
 * configured, otherwise falls back to the local filesystem (server/uploads).
 * Returns a public URL for the stored object.
 */
class StorageService {
  private client: S3Client | null = null;

  private getClient(): S3Client | null {
    if (!r2Configured()) return null;
    if (!this.client) {
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.r2.accessKeyId,
          secretAccessKey: config.r2.secretAccessKey,
        },
      });
    }
    return this.client;
  }

  async upload(buffer: Buffer, mime: string): Promise<string> {
    const ext = extFor(mime);
    const key = `images/${crypto.randomUUID()}.${ext}`;

    const client = this.getClient();
    if (client) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.r2.bucket,
          Key: key,
          Body: buffer,
          ContentType: mime,
        })
      );
      const base = config.r2.publicUrl.replace(/\/$/, "");
      return `${base}/${key}`;
    }

    // Local fallback
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(path.join(LOCAL_UPLOADS_DIR, path.basename(key)), buffer);
    return `${config.publicBaseUrl}/uploads/${path.basename(key)}`;
  }
}

export const storage = new StorageService();
