import type { Category, Quote, Tag, User } from "@prisma/client";
import { config } from "../config.js";
import { logger } from "./logger.js";
import { channelChatIdFor, getTelegramSettings } from "./telegramSettings.js";

const API_BASE = "https://api.telegram.org";

/** Whether a bot token AND an admin chat are configured (DB settings). */
export async function telegramEnabled(): Promise<boolean> {
  const settings = await getTelegramSettings();
  return settings.botToken.length > 0 && settings.superAdminChatId.length > 0;
}

/** Whether the bot can publish approved quotes to the Telegram channel. */
export async function channelEnabled(): Promise<boolean> {
  const settings = await getTelegramSettings();
  return settings.botToken.length > 0 && Boolean(channelChatIdFor(settings));
}

async function telegramFetch(url: string, body: unknown): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function apiCall<T>(method: string, body: unknown): Promise<T | null> {
  const settings = await getTelegramSettings();
  if (!settings.botToken) return null;
  const res = await telegramFetch(`${API_BASE}/bot${settings.botToken}/${method}`, body);
  if (!res) {
    logger.warn({ method }, "telegram api call failed (network)");
    return null;
  }
  try {
    return (await res.json().catch(() => null)) as T | null;
  } catch (err) {
    logger.warn({ err, method }, "telegram api call failed");
    return null;
  }
}

interface TelegramResult<T> {
  ok: boolean;
  result?: T;
}

export interface TelegramKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>;
}

/** Approve / Reject buttons attached to every pending-quote message. */
export function moderationKeyboard(quoteId: string): TelegramKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Ruxsat berish", callback_data: `approve:${quoteId}` },
        { text: "❌ Rad etish", callback_data: `reject:${quoteId}` },
      ],
    ],
  };
}

export interface ModerationContext {
  quote: Quote;
  author: Pick<User, "email" | "name" | "nickname" | "telegramUsername">;
  category: Category;
  tags: Tag[];
}

/** The message the admin sees in Telegram. Never leaks who posted when the
 *  quote is public, but the real owner's email is shown to the admin. */
export function moderationText(ctx: ModerationContext): string {
  const { quote, author, category, tags } = ctx;
  const tagLine = tags.length > 0 ? `#${tags.map((t) => t.name).join(" #")}` : "—";
  const realName = [author.name, author.nickname].filter(Boolean).join(" / ") || author.email || "Telegram foydalanuvchisi";
  return [
    "🆕 Yangi iqtibos (kutmoqda)",
    "",
    quote.text,
    "",
    `👤 Nashr etiladigan muallif: ${quote.anonymous ? "Anonim" : quote.displayAuthor}`,
    `🔒 Haqiqiy egasi: ${author.email ?? author.telegramUsername ?? "Telegram foydalanuvchisi"}${realName !== (author.email ?? author.telegramUsername ?? "Telegram foydalanuvchisi") ? ` (${realName})` : ""}`,
    `🗂 Bo'lim: ${category.name}`,
    `🏷 Heshteglar: ${tagLine}`,
  ].join("\n");
}

/** Sends a new pending quote to the admin with Approve/Reject buttons.
 *  Returns the Telegram message id (to edit later) or null. */
export async function sendModerationMessage(ctx: ModerationContext): Promise<number | null> {
  if (!(await telegramEnabled())) return null;
  const settings = await getTelegramSettings();
  const json = await apiCall<TelegramResult<{ message_id: number }>>("sendMessage", {
    chat_id: settings.superAdminChatId,
    text: moderationText(ctx),
    reply_markup: moderationKeyboard(ctx.quote.id),
  });
  return json?.result?.message_id ?? null;
}

/** Rewrites an existing moderation message (used after approve/reject). */
export async function editModerationMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup: TelegramKeyboard | null
): Promise<void> {
  await apiCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    // An empty keyboard removes the Approve/Reject buttons.
    reply_markup: replyMarkup ?? { inline_keyboard: [] },
  });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await apiCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text ?? "",
    show_alert: false,
  });
}

// ---------------------------------------------------------------------------
// Policy review (Super Admin workflow) + new-feature alert (dynamic registry)
// ---------------------------------------------------------------------------

/** [Tasdiqlash] / [Taklif kiritish bilan tasdiqlash] / [Rad etish + sabab]. */
export function policyReviewKeyboard(policyId: string): TelegramKeyboard {
  return {
    inline_keyboard: [
      [{ text: "✅ Tasdiqlash", callback_data: `policy:approve:${policyId}` }],
      [{ text: "✍️ Taklif kiritish bilan tasdiqlash", callback_data: `policy:suggest:${policyId}` }],
      [{ text: "❌ Rad etish + sabab", callback_data: `policy:reject:${policyId}` }],
    ],
  };
}

export interface PolicyReviewContext {
  type: "TERMS" | "PRIVACY" | "COOKIES";
  label: string;
  version: string;
  changeSummary: string | null;
}

/** Sends the policy review prompt with the three decision buttons to the admin
 *  chat. Returns the Telegram message id (to edit later) or null.
 *  Gated by the "notifyPolicy" toggle; the admin panel socket push is
 *  independent and always fires. */
export async function sendPolicyReviewMessage(ctx: PolicyReviewContext, policyId: string): Promise<number | null> {
  const settings = await getTelegramSettings();
  if (!settings.notifyPolicy) return null;
  if (!settings.botToken || !settings.superAdminChatId) return null;
  const text = [
    `🧐 ${ctx.label} — ko'rib chiqish kutilmoqda (v${ctx.version})`,
    "",
    ctx.changeSummary ?? "Tasdiqlanmagan loyiha tayyorlandi",
    "",
    "Nima qilamiz?",
  ].join("\n");
  const json = await apiCall<TelegramResult<{ message_id: number }>>("sendMessage", {
    chat_id: settings.superAdminChatId,
    text,
    reply_markup: policyReviewKeyboard(policyId),
  });
  return json?.result?.message_id ?? null;
}

/** "🆕 Yangi modul/funksiya [X] aniqlandi! Adminlar uchun ruxsatlarni
 *  sozlaysizmi?" — push to the admin chat when a runtime module registers.
 *  Gated by the "notifyNewFeature" toggle. */
export async function sendNewFeatureMessage(feature: { label: string; group: string }): Promise<void> {
  const settings = await getTelegramSettings();
  if (!settings.notifyNewFeature) return;
  if (!settings.botToken || !settings.superAdminChatId) return;
  const text = [
    `🆕 Yangi modul/funksiya [${feature.label}] aniqlandi!`,
    "",
    `Guruh: ${feature.group}`,
    "Ushbu imkoniyat adminlar uchun sukut bo'yicha yopiq. Adminlar uchun ruxsatlarni sozlaysizmi?",
    "",
    "Sub-adminlar sahifasida (Admin panel → Sub-adminlar) ruxsatlarni sozlashingiz mumkin.",
  ].join("\n");
  await sendTelegramMessage(settings.superAdminChatId, text);
}

// ---------------------------------------------------------------------------
// Channel posting (approved quotes published to the Telegram channel)
// ---------------------------------------------------------------------------

/** Inline button appended to channel posts — opens the quote on the site. */
export interface ChannelKeyboard {
  inline_keyboard: Array<Array<{ text: string; url: string }>>;
}

export interface ChannelQuote {
  id: string;
  text: string;
  displayAuthor: string;
}

export function channelPostKeyboard(quoteId: string, siteUrl: string): ChannelKeyboard {
  return {
    inline_keyboard: [[{ text: "🔗 Saytda o'qish", url: `${siteUrl}/?quote=${quoteId}` }]],
  };
}

/** The nicely formatted post body shown for an approved quote in the channel. */
export function quoteChannelPostText(quote: ChannelQuote): string {
  return [`💬 Iqtibos`, "", `“${quote.text}”`, "", `— ${quote.displayAuthor}`].join("\n");
}

/**
 * Publishes an approved quote to the configured Telegram channel with a
 * "read on site" inline button. Returns false when the channel is not
 * configured or Telegram rejects the message.
 */
export async function publishQuoteToChannel(quote: ChannelQuote): Promise<boolean> {
  const settings = await getTelegramSettings();
  const chatId = channelChatIdFor(settings);
  if (!settings.botToken || !chatId) return false;
  const json = await apiCall<TelegramResult<{ message_id: number }>>("sendMessage", {
    chat_id: chatId,
    text: quoteChannelPostText(quote),
    reply_markup: channelPostKeyboard(quote.id, config.publicSiteUrl),
  });
  return json?.ok === true;
}

// ---------------------------------------------------------------------------
// Phone verification bot
// ---------------------------------------------------------------------------

/** Reply keyboard with a single "share my phone number" button. */
export interface ReplyKeyboard {
  keyboard: Array<Array<{ text: string; request_contact?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

let cachedBotUsername: string | null | undefined;
let cachedBotUsernameForToken = "";

/** The bot's public @username (no leading @), used to build deep links. */
export async function getBotUsername(): Promise<string | null> {
  const settings = await getTelegramSettings();
  if (!settings.botToken) {
    cachedBotUsername = null;
    cachedBotUsernameForToken = settings.botToken;
    return null;
  }
  if (cachedBotUsername !== undefined && cachedBotUsernameForToken === settings.botToken) {
    return cachedBotUsername;
  }
  const json = await apiCall<TelegramResult<{ username?: string }>>("getMe", {});
  cachedBotUsername = json?.result?.username ?? null;
  cachedBotUsernameForToken = settings.botToken;
  return cachedBotUsername;
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: ReplyKeyboard,
  replyToMessageId?: number
): Promise<boolean> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  if (replyToMessageId !== undefined) body.reply_to_message_id = replyToMessageId;
  const json = await apiCall<TelegramResult<{ message_id: number }>>("sendMessage", body);
  return json?.ok === true;
}

/** Fires a plain notification to the admin chat (no buttons). */
export async function sendAdminNotification(text: string): Promise<void> {
  const settings = await getTelegramSettings();
  if (!settings.botToken || !settings.superAdminChatId) return;
  await sendTelegramMessage(settings.superAdminChatId, text);
}

/** Asks the user for their phone number via a Request Contact button. */
export async function requestContactMessage(chatId: number | string, text: string): Promise<void> {
  await sendTelegramMessage(chatId, text, {
    keyboard: [[{ text: "📱 Telefon raqamni yuborish", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  });
}

/** Sends the 6-digit code in monospace so it is easy to select and copy. */
export async function sendVerificationCodeMessage(chatId: number | string, code: string): Promise<void> {
  await sendTelegramMessage(
    chatId,
    `Sizning tasdiqlash kodingiz:\n\n` + "`" + code + "`" + `\n\nSaytga qayting va botdan olgan kodni kiriting.`
  );
}