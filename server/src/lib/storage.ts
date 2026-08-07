import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LOCAL_UPLOADS_DIR = path.resolve(__dirname, "../../uploads");
// Long-lived immutable cache: uploaded files never change once written.
const R2_CACHE_CONTROL = "public, max-age=31536000, immutable";
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
          CacheControl: R2_CACHE_CONTROL,
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

  /** Extracts the object key from a previously returned upload URL. */
  keyFromUrl(url: string): string | null {
    const match = /\/uploads\/([^/?#]+)$/.exec(url);
    if (match) return `images/${match[1]}`;
    const r2 = /\/images\/[^/?#]+$/.exec(url);
    return r2 ? r2[0].slice(1) : null;
  }

  async delete(urlOrKey: string): Promise<void> {
    const key = urlOrKey.startsWith("images/") ? urlOrKey : this.keyFromUrl(urlOrKey);
    if (!key) return;
    const client = this.getClient();
    if (client) {
      await client.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key: key }));
      return;
    }
    fs.rmSync(path.join(LOCAL_UPLOADS_DIR, path.basename(key)), { force: true });
  }

  async metadata(urlOrKey: string): Promise<{ key: string; size: number; contentType: string | null } | null> {
    const key = urlOrKey.startsWith("images/") ? urlOrKey : this.keyFromUrl(urlOrKey);
    if (!key) return null;
    const client = this.getClient();
    if (client) {
      const head = await client.send(new HeadObjectCommand({ Bucket: config.r2.bucket, Key: key }));
      return { key, size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
    }
    try {
      const st = fs.statSync(path.join(LOCAL_UPLOADS_DIR, path.basename(key)));
      return { key, size: st.size, contentType: null };
    } catch {
      return null;
    }
  }
}

export const storage = new StorageService();
