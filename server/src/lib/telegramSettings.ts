import { config } from "../config.js";
import { prisma } from "./prisma.js";

export interface TelegramRuntimeSettings {
  id: string;
  botToken: string;
  superAdminChatId: string;
  channelValue: string;
  channelChatId: string;
  notifyPolicy: boolean;
  notifyNewFeature: boolean;
  notifyHealth: boolean;
  notifyBackup: boolean;
  botStatus: string;
  botUsername: string | null;
  lastError: string | null;
  lastCheckedAt: Date | null;
  updatedAt: Date;
}

/** Options accepted by the Admin Panel's PUT /settings endpoint. */
export interface TelegramSettingsPatch {
  botToken?: string;
  superAdminChatId?: string;
  channelValue?: string;
  notifyPolicy?: boolean;
  notifyNewFeature?: boolean;
  notifyHealth?: boolean;
  notifyBackup?: boolean;
}

const TELEGRAM_API_BASE = "https://api.telegram.org";
const CACHE_TTL_MS = 5_000;

let cache: TelegramRuntimeSettings | null = null;
let cacheUntil = 0;

export function invalidateTelegramSettingsCache(): void {
  cache = null;
  cacheUntil = 0;
}

/**
 * Returns the single settings row. When the row is missing entirely (e.g. a
 * fresh database) it is created from the .env values so a first deploy keeps
 * working before the admin has touched the panel.
 */
export async function getTelegramSettings(): Promise<TelegramRuntimeSettings> {
  if (cache && Date.now() < cacheUntil) return cache;

  let row = await prisma.telegramSettings.findUnique({ where: { id: "main" } });
  if (!row) {
    row = await prisma.telegramSettings.upsert({
      where: { id: "main" },
      update: {},
      create: {
        id: "main",
        botToken: config.telegramBotToken,
        superAdminChatId: config.telegramAdminChatId,
        channelValue: config.telegramChannelId,
      },
    });
  }

  cache = row;
  cacheUntil = Date.now() + CACHE_TTL_MS;
  return row;
}

/**
 * Boot helper: copies the .env Telegram values into the DB row the first time
 * only. After the admin edits the panel, the DB becomes the source of truth
 * and env values are never re-applied.
 */
export async function ensureTelegramSettings(): Promise<void> {
  const existing = await prisma.telegramSettings.findUnique({ where: { id: "main" } });
  if (!existing) {
    await prisma.telegramSettings.create({
      data: {
        id: "main",
        botToken: config.telegramBotToken,
        superAdminChatId: config.telegramAdminChatId,
        channelValue: config.telegramChannelId,
      },
    });
  } else {
    const patch: Partial<TelegramRuntimeSettings> = {};
    if (!existing.botToken && config.telegramBotToken) patch.botToken = config.telegramBotToken;
    if (!existing.superAdminChatId && config.telegramAdminChatId)
      patch.superAdminChatId = config.telegramAdminChatId;
    if (!existing.channelValue && config.telegramChannelId) patch.channelValue = config.telegramChannelId;
    if (Object.keys(patch).length > 0) {
      await prisma.telegramSettings.update({ where: { id: "main" }, data: patch });
    }
  }
  invalidateTelegramSettingsCache();
}

/** Stores a numeric channel id captured by the webhook. Returns true when changed. */
export async function captureChannelChatId(chatId: number | string): Promise<boolean> {
  const id = String(chatId).trim();
  if (!id) return false;
  const current = await getTelegramSettings();
  if (current.channelChatId === id) return false;
  await prisma.telegramSettings.update({ where: { id: "main" }, data: { channelChatId: id } });
  invalidateTelegramSettingsCache();
  return true;
}

async function telegramFetch(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    return await fetch(url, { ...(init ?? {}), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface BotCheckResult {
  ok: boolean;
  username?: string;
  error?: string;
}

/** Calls getMe with the given token and reports the connection state. */
export async function checkBotToken(token: string): Promise<BotCheckResult> {
  if (!token.trim()) return { ok: false, error: "Bot token kiritilmagan" };
  try {
    const res = await telegramFetch(`${TELEGRAM_API_BASE}/bot${token.trim()}/getMe`);
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      result?: { username?: string };
      description?: string;
    } | null;
    if (res.ok && json?.ok && typeof json.result?.username === "string") {
      return { ok: true, username: json.result.username };
    }
    if (res.status === 401) return { ok: false, error: "Yaroqsiz bot token (401 Unauthorized)" };
    return { ok: false, error: String(json?.description ?? `HTTP ${res.status}`) };
  } catch {
    return { ok: false, error: "Telegram API'ga ulanib bo'lmadi (tarmoq xatosi)" };
  }
}

const WEBHOOK_ALLOWED_UPDATES = ["message", "callback_query", "channel_post", "my_chat_member", "chat_join_request"];

/** Registers/unregisters the webhook, only when the env provides a URL. */
export async function registerWebhook(token: string): Promise<void> {
  if (!config.telegramWebhookUrl || !config.telegramWebhookSecret) return;
  await telegramFetch(`${TELEGRAM_API_BASE}/bot${token.trim()}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: config.telegramWebhookUrl,
      secret_token: config.telegramWebhookSecret,
      allowed_updates: WEBHOOK_ALLOWED_UPDATES,
    }),
  });
}

/**
 * Re-initialises the bot connection after a token change: verifies the token
 * via getMe, registers the webhook on success, and persists the status.
 */
export async function reinitBot(): Promise<BotCheckResult> {
  const settings = await getTelegramSettings();
  if (!settings.botToken) {
    await prisma.telegramSettings.update({
      where: { id: "main" },
      data: { botStatus: "disabled", botUsername: null, lastError: null, lastCheckedAt: new Date() },
    });
    invalidateTelegramSettingsCache();
    return { ok: false, error: "Bot token kiritilmagan" };
  }

  const check = await checkBotToken(settings.botToken);
  if (check.ok) {
    try {
      await registerWebhook(settings.botToken);
    } catch {
      /* webhook registration is best-effort */
    }
    await prisma.telegramSettings.update({
      where: { id: "main" },
      data: { botStatus: "ok", botUsername: check.username ?? null, lastError: null, lastCheckedAt: new Date() },
    });
  } else {
    await prisma.telegramSettings.update({
      where: { id: "main" },
      data: { botStatus: "error", lastError: check.error ?? "Noma'lum xato", lastCheckedAt: new Date() },
    });
  }
  invalidateTelegramSettingsCache();
  return check;
}

export interface SanitizedTelegramSettings {
  botTokenSet: boolean;
  botTokenMasked: string;
  superAdminChatId: string;
  channelValue: string;
  channelChatId: string;
  notifyPolicy: boolean;
  notifyNewFeature: boolean;
  notifyHealth: boolean;
  notifyBackup: boolean;
  botStatus: string;
  botUsername: string | null;
  lastError: string | null;
  lastCheckedAt: Date | null;
  updatedAt: Date;
}

export function sanitizeSettings(settings: TelegramRuntimeSettings): SanitizedTelegramSettings {
  return {
    botTokenSet: settings.botToken.length > 0,
    botTokenMasked: settings.botToken.length > 0 ? `${settings.botToken.slice(0, 6)}…${settings.botToken.slice(-4)}` : "",
    superAdminChatId: settings.superAdminChatId,
    channelValue: settings.channelValue,
    channelChatId: settings.channelChatId,
    notifyPolicy: settings.notifyPolicy,
    notifyNewFeature: settings.notifyNewFeature,
    notifyHealth: settings.notifyHealth,
    notifyBackup: settings.notifyBackup,
    botStatus: settings.botStatus,
    botUsername: settings.botUsername,
    lastError: settings.lastError,
    lastCheckedAt: settings.lastCheckedAt,
    updatedAt: settings.updatedAt,
  };
}

/**
 * Persists a panel edit. When the bot token actually changed the connection is
 * re-initialised (getMe + webhook) and the fresh status is returned.
 */
export async function applyTelegramSettings(patch: TelegramSettingsPatch): Promise<{
  settings: SanitizedTelegramSettings;
  reinitialized: boolean;
  botCheck?: BotCheckResult;
}> {
  const current = await getTelegramSettings();

  const data: TelegramSettingsPatch = { ...patch };
  if ("botToken" in data && data.botToken === current.botToken) delete data.botToken;
  if (data.botToken !== undefined) data.botToken = data.botToken.trim();

  const tokenChanged = data.botToken !== undefined && data.botToken !== current.botToken;

  await prisma.telegramSettings.upsert({
    where: { id: "main" },
    update: data as any,
    create: { id: "main", ...(data as any) },
  });
  invalidateTelegramSettingsCache();

  let botCheck: BotCheckResult | undefined;
  if (tokenChanged) {
    botCheck = await reinitBot();
  }

  const fresh = await getTelegramSettings();
  return { settings: sanitizeSettings(fresh), reinitialized: tokenChanged, botCheck };
}

export { parseChannelValue, channelChatIdFor, maskToken } from "./telegramFormat.js";