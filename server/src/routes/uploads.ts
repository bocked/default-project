import { Router } from "express";
import { writeFile } from "node:fs/promises";
import multer from "multer";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadsLimiter } from "../lib/rateLimit.js";
import { processImageUpload, UploadError } from "../lib/upload.js";
import { addLog } from "../lib/logstore.js";

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) return cb(null, true);
    cb(new UploadError(415, "Foydalanuvchi faqat rasm yuklay oladi"));
  },
});

// POST /api/uploads — authenticated clients upload a single image, get back a
// WebP-optimised URL that is ready to embed (see lib/upload.ts for details).
uploadsRouter.post(
  "/",
  requireAuth,
  uploadsLimiter,
  (req, res, next) => {
    // Map Multer/UploadFile errors to proper statuses:
    // LIMIT_FILE_SIZE -> 413, non-image MIME -> 415, anything else -> 400.
    upload.single("file")(req, res, (err) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof UploadError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "Fayl juda katta" });
          return;
        }
        res.status(400).json({ error: "Fayl yuklashda xatolik" });
        return;
      }
      res.status(400).json({ error: "Fayl yuklashda xatolik" });
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Fayl yuborilmadi" });
      return;
    }

    let processed;
    try {
      processed = await processImageUpload(req.file.buffer);
    } catch (err) {
      if (err instanceof UploadError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      addLog("warn", `Rasm qayta ishlanmadi: ${err instanceof Error ? err.message : String(err)}`);
      res.status(500).json({ error: "Rasm qayta ishlanmadi" });
      return;
    }

    try {
      await writeFile(`${config.uploadDir}/${processed.fileName}`, processed.buffer);
    } catch {
      addLog("warn", `Rasm saqlanmadi: ${processed.fileName}`);
      res.status(500).json({ error: "Rasm saqlanmadi" });
      return;
    }

    addLog(
      "info",
      `Rasm yuklandi: ${processed.fileName} (${processed.width}x${processed.height}, ${processed.bytes} bayt)`
    );
    res.status(201).json({
      ok: true,
      url: processed.url,
      publicPath: processed.publicPath,
      width: processed.width,
      height: processed.height,
      bytes: processed.bytes,
    });
  }
);