import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getTelegramSettings } from "./telegramSettings.js";
import { sendTelegramMessage } from "./telegram.js";
import { addLog } from "./logstore.js";
import { bus } from "./bus.js";
import { logger } from "./logger.js";

const execFileP = promisify(execFile);

const DISK_THRESHOLD_PERCENT = 80;

// Per-kind rate limiting so flapping errors do not spam the Super Admin chat
// (a single kind is reported at most once inside the window).
const LAST_SENT: Record<string, number> = {};
const RATE_LIMIT_MS: Record<string, number> = {
  server500: 5 * 60 * 1000,
  disk: 60 * 60 * 1000,
};

function withinRateLimit(kind: "server500" | "disk"): boolean {
  const now = Date.now();
  if (now - (LAST_SENT[kind] ?? 0) < RATE_LIMIT_MS[kind]) return true;
  LAST_SENT[kind] = now;
  return false;
}

/** Only sends when the "notifyHealth" toggle is on; the panel log always fires. */
async function sendHealthAlert(text: string): Promise<void> {
  addLog("warn", text);
  try {
    const settings = await getTelegramSettings();
    if (!settings.notifyHealth) return;
    if (!settings.botToken || !settings.superAdminChatId) return;
    const sent = await sendTelegramMessage(settings.superAdminChatId, text);
    if (sent) {
      bus.publish("admin:telegram:status", { kind: "health", text });
    }
  } catch (err) {
    logger.warn({ err }, "health alert not delivered");
  }
}

/** Called from the Express error responder for 5xx. Debounced per kind. */
export function notifyServerError(err: Error, req?: { method?: string; url?: string }): void {
  if (withinRateLimit("server500")) return;
  const requestLine = req?.method && req?.url ? `${req.method} ${req.url}` : "noma'lum so'rov";
  void sendHealthAlert(
    `🚨 Serverda 500 xatolik!\n\n${err.message?.slice(0, 300) ?? "Noma'lum xato"}\n\n${requestLine}`
  );
}

let diskTimer: NodeJS.Timeout | null = null;

/** Starts the periodic disk-usage check (15 min). Best-effort; the `df`
 *  command only exists on Unix hosts so Windows dev machines are a no-op. */
export function startHealthMonitor(): void {
  if (diskTimer) return;
  diskTimer = setInterval(() => void checkDiskUsage(), 15 * 60 * 1000);
  diskTimer.unref?.();
  void checkDiskUsage();
}

async function checkDiskUsage(): Promise<void> {
  try {
    const { stdout } = await execFileP("df", ["-P", "/"]);
    const line = stdout.split("\n")[1];
    const fields = line?.trim().split(/\s+/);
    const percent = fields && fields.length >= 5 ? Number(fields[4]?.replace("%", "")) : NaN;
    if (Number.isNaN(percent)) return;
    if (percent >= DISK_THRESHOLD_PERCENT && !withinRateLimit("disk")) {
      await sendHealthAlert(`💾 Disk bandligi xavotirli!\n\nDisk: ${percent}% band (chegara ${DISK_THRESHOLD_PERCENT}%).\n\nKeraksiz fayllarni tozalashni ko'rib chiqing.`);
    }
  } catch {
    /* df unavailable (e.g. Windows) — skip silently */
  }
}