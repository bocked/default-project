import { Router } from "express";
import { config } from "../config.js";
import { requireSuperAdmin } from "../middleware/adminAuth.js";
import { addLog } from "../lib/logstore.js";
import { recordAudit } from "../lib/audit.js";
import { sendTelegramMessage } from "../lib/telegram.js";
import {
  applyTelegramSettings,
  channelChatIdFor,
  getTelegramSettings,
  reinitBot,
  sanitizeSettings,
} from "../lib/telegramSettings.js";
import { bus } from "../lib/bus.js";
import {
  telegramSettingsUpdateSchema,
  telegramTestSchema,
  validateBody,
  type TelegramSettingsUpdate,
  type TelegramTest,
} from "../schemas.js";

export const adminTelegramRouter = Router();

// Whole module is super-admin only — the panel fields contain the live bot
// token, admin chat and the channel, i.e. production credentials.
adminTelegramRouter.use(requireSuperAdmin);

// GET /api/admin/telegram/settings - always super-admin (mounted with
// requireSuperAdmin); the token is never returned in full.
adminTelegramRouter.get("/settings", async (_req, res) => {
  try {
    const settings = await getTelegramSettings();
    res.json({ settings: sanitizeSettings(settings) });
  } catch {
    res.status(500).json({ error: "Sozlamalarni o'qib bo'lmadi" });
  }
});

// PUT /api/admin/telegram/settings - persist the panel edit; changing the bot
// token re-initialises the connection (setWebhook + getMe) right away.
adminTelegramRouter.put("/settings", validateBody(telegramSettingsUpdateSchema), async (req, res) => {
  const patch = res.locals.body as TelegramSettingsUpdate;
  try {
    const result = await applyTelegramSettings(patch);
    await recordAudit({
      adminId: req.admin?.id ?? null,
      adminEmail: req.admin?.email ?? null,
      action: "telegram.settings",
      targetType: "telegram",
      targetId: "main",
      detail: buildChangeSummary(patch, result.reinitialized),
      ip: null,
    });
    addLog("info", `Telegram sozlamalari yangilandi (${result.reinitialized ? "bot token o'zgardi" : "boshqa maydonlar"})`);
    bus.publish("admin:telegram:status", {
      settings: result.settings,
      reinitialized: result.reinitialized,
      botCheck: result.botCheck ?? null,
    });
    res.json({ settings: result.settings, reinitialized: result.reinitialized });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Sozlamalar saqlanmadi" });
  }
});

// GET /api/admin/telegram/status?refresh=1 - live bot connection state.
adminTelegramRouter.get("/status", async (req, res) => {
  try {
    if (req.query.refresh === "1" || req.query.refresh === "true") {
      await reinitBot();
    }
    const settings = await getTelegramSettings();
    res.json({
      configured: Boolean(settings.botToken && settings.superAdminChatId),
      botStatus: settings.botStatus,
      botUsername: settings.botUsername,
      lastError: settings.lastError,
      lastCheckedAt: settings.lastCheckedAt,
      superAdminChatIdSet: settings.superAdminChatId.length > 0,
      channelChatId: settings.channelChatId,
      channelResolved: channelChatIdFor(settings),
      webhookUrl: config.telegramWebhookUrl ?? null,
      webhookConfigured: Boolean(config.telegramWebhookUrl && config.telegramWebhookSecret),
      notifications: {
        policy: settings.notifyPolicy,
        newFeature: settings.notifyNewFeature,
        health: settings.notifyHealth,
        backup: settings.notifyBackup,
      },
    });
  } catch {
    res.status(500).json({ error: "Holatni tekshirib bo'lmadi" });
  }
});

// POST /api/admin/telegram/test - fire a test message to the super admin chat.
adminTelegramRouter.post("/test", validateBody(telegramTestSchema), async (_req, res) => {
  const { message } = res.locals.body as TelegramTest;
  try {
    const settings = await getTelegramSettings();
    if (!settings.botToken) {
      res.status(400).json({ error: "Bot token kiritilmagan" });
      return;
    }
    if (!settings.superAdminChatId) {
      res.status(400).json({ error: "Super admin chat ID kiritilmagan" });
      return;
    }
    const text = message?.trim() || "✅ Telegram sozlamalari tekshiruvi: bot ulangan va xabar yuborilmoqda.";
    const sent = await sendTelegramMessage(settings.superAdminChatId, text);
    if (!sent) {
      res.status(502).json({ ok: false, error: "Telegram xabarni yuborishga ruxsat bermadi (token yoki chat ID noto'g'ri bomi mumkin)" });
      return;
    }
    addLog("info", "Telegram sinov xabari yuborildi");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Sinov xabari yuborilmadi" });
  }
});

function buildChangeSummary(patch: TelegramSettingsUpdate, tokenChanged: boolean): string {
  const parts: string[] = [];
  if (tokenChanged) parts.push("bot token yangilandi");
  if (patch.superAdminChatId !== undefined) parts.push("super admin chat ID yangilandi");
  if (patch.channelValue !== undefined) parts.push("kanal nuqtai yangilandi");
  if (patch.notifyPolicy !== undefined || patch.notifyNewFeature !== undefined) parts.push("bildirishnomalar (siyosat/yangilik) yangilandi");
  if (patch.notifyHealth !== undefined || patch.notifyBackup !== undefined) parts.push("bildirishnomalar (health/backup) yangilandi");
  return parts.length > 0 ? parts.join(", ") : "ozgarishsiz";
}