// Standalone liveness watchdog for the production API. It runs OUTSIDE the
// Express process (via cron / pm2 on the VM) so it can still alert when the API
// itself is down, crashed or being restarted by PM2.
//
// It loads the compiled build (dist/) like the real app, reads the *live*
// Telegram settings from the DB, and only messages the Super Admin when the
// "notifyHealth" toggle is on. Every alert is also written into the AdminLog
// table so it shows up in the panel's audit view.

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Side effect: loads server/.env BEFORE later static imports evaluate, so the
// compiled Prisma client and telegramSettings read the right DATABASE_URL.
import { config } from "../dist/config.js";
import { getTelegramSettings } from "../dist/lib/telegramSettings.js";
import { sendTelegramMessage } from "../dist/lib/telegram.js";
import { prisma } from "../dist/lib/prisma.js";

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(SCRIPTS_DIR, ".telegram-watchdog.state.json");
const LOCK_FILE = path.join(SCRIPTS_DIR, ".telegram-watchdog.lock");
const HEALTH_URL = `http://127.0.0.1:${config.port}/health`;
const PM2_APP_NAME = "yerlikoglon-api";
const DISK_THRESHOLD = 80;
const MINUTE = 60 * 1000;

const RATE_LIMIT: Record<string, number> = {
  apiDown: 60 * MINUTE,
  pm2Down: 60 * MINUTE,
  pm2Restart: 10 * MINUTE,
  disk: 60 * MINUTE,
};

function execFileP(cmd, args, timeout = 20_000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

async function loadState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveState(state) {
  try {
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
  } catch {}
}

function rateLimited(state, kind) {
  const now = Date.now();
  const last = state[kind] ?? 0;
  if (now - last < RATE_LIMIT[kind]) return true;
  state[kind] = now;
  return false;
}

async function acquireLock() {
  try {
    const fh = await fs.open(LOCK_FILE, "wx");
    await fh.writeFile(String(process.pid), "utf8");
    await fh.close();
    return true;
  } catch (err) {
    if (err.code !== "EEXIST") return true;
    try {
      const stat = await fs.stat(LOCK_FILE);
      if (Date.now() - stat.mtimeMs > 15 * MINUTE) {
        // Stale lock from a crashed run — reclaim it.
        await fs.unlink(LOCK_FILE).catch(() => {});
        return acquireLock();
      }
    } catch {}
    return false;
  }
}

async function releaseLock() {
  await fs.unlink(LOCK_FILE).catch(() => {});
}

async function main() {
  if (!(await acquireLock())) {
    process.exit(0);
  }
  try {
    const settings = await getTelegramSettings();
    const chatId = settings.superAdminChatId;
    const canTelegram = Boolean(settings.botToken && chatId && settings.notifyHealth);
    const state = await loadState();
    const alerts = [];

    // 1. API liveness.
    let apiDown = true;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6_000);
      const res = await fetch(HEALTH_URL, { signal: controller.signal });
      clearTimeout(timer);
      apiDown = res.status !== 200;
    } catch {
      apiDown = true;
    }
    if (apiDown) {
      state.lastApiOkAt = undefined;
      if (!rateLimited(state, "apiDown")) {
        alerts.push(`⛔ API ishlamayapti!`, `Manzil: ${HEALTH_URL}\nVaqt: ${new Date().toISOString()}\nXizmat holatini tekshiring (pm2 status ${PM2_APP_NAME}).`);
      }
    } else {
      state.apiDown = undefined;
      state.lastApiOkAt = new Date().toISOString();
    }

    // 2. PM2 process state + restart counter (catches repeated crashes).
    const pm2 = await execFileP("pm2", ["jlist"]);
    let proc = null;
    if (pm2.ok) {
      try {
        const list = JSON.parse(pm2.stdout);
        proc = (list ?? []).find(
          (p) => p.name === PM2_APP_NAME || String(p.pm2_env?.pm_exec_path ?? "").includes("/server/dist/index.js")
        );
      } catch {}
    }
    if (!proc) {
      if (!rateLimited(state, "pm2Down")) {
        alerts.push(`⛔ PM2 jarayoni topilmadi!`, `'${PM2_APP_NAME}' App listda yo'q yoki pm2 juman. Iltimos pm2 list/start tekshiring.`);
      }
    } else {
      const status = proc.pm2_env?.status ?? "unknown";
      const restartTime = proc.pm2_env?.restart_time ?? 0;
      if (status !== "online") {
        if (!rateLimited(state, "pm2Down")) {
          alerts.push(`⛔ PM2 jarayoni ishlamayapti!`, `App: ${PM2_APP_NAME}\nHolat: ${status}\npm2 logs va restart tekshiring.`);
        }
      } else {
        state.pm2Down = undefined;
      }
      if (typeof state.lastRestartCount === "number" && restartTime > state.lastRestartCount && !rateLimited(state, "pm2Restart")) {
        alerts.push(`🔁 PM2 qayta ishga tushdi!`, `App: ${PM2_APP_NAME}\nUmumiy qayta ishga tushirishlar: ${restartTime}\n(Deploy paytida normal holat bo'lishi mumkin.)`);
      }
      state.lastRestartCount = restartTime;
    }

    // 3. Disk usage (only makes sense on Unix hosts).
    const disk = await execFileP("df", ["-P", "/"]);
    if (disk.ok) {
      const fields = disk.stdout.split("\n")[1]?.trim().split(/\s+/);
      const percent = fields && fields.length >= 5 ? Number(fields[4]?.replace("%", "")) : NaN;
      if (!Number.isNaN(percent) && percent >= DISK_THRESHOLD && !rateLimited(state, "disk")) {
        alerts.push(`💾 Disk bandligi xavotirli!`, `Disk: ${percent}% band (chegara ${DISK_THRESHOLD}%).\nKeraksiz fayllarni tozalashni ko'rib chiqing (du -sh /home/* | sort -h).`);
      }
    }

    if (alerts.length > 0) {
      const detail = alerts.join(" | ");
      await prisma.adminLog.create({
        data: {
          adminEmail: "telegram-watchdog",
          action: "health.alert",
          targetType: "system",
          detail,
          createdAt: new Date(),
        },
      });
      if (canTelegram) {
        for (const part of alerts) {
          await sendTelegramMessage(chatId, part);
        }
      }
    }

    await saveState(state);
    if (alerts.length === 0) {
      const healthy = !apiDown && proc?.pm2_env?.status === "online" ? `* ${state.lastApiOkAt}: hammasi joyida.` : "";
      if (process.env.WATCHDOG_VERBOSE) console.log(healthy.trim());
    }
  } finally {
    await releaseLock();
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error("[telegram-watchdog] xato:", err);
  process.exit(1);
});