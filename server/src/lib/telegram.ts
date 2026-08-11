import type { Category, Quote, Tag, User } from "@prisma/client";
import { config } from "../config.js";
import { logger } from "./logger.js";

const API_BASE = "https://api.telegram.org";

export function telegramEnabled(): boolean {
  return config.telegramBotToken.length > 0 && config.telegramAdminChatId.length > 0;
}

async function apiCall<T>(method: string, body: unknown): Promise<T | null> {
  if (!config.telegramBotToken) return null;
  try {
    const res = await fetch(`${API_BASE}/bot${config.telegramBotToken}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
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
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
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
  author: Pick<User, "email" | "name" | "nickname">;
  category: Category;
  tags: Tag[];
}

/** The message the admin sees in Telegram. Never leaks who posted when the
 *  quote is public, but the real owner's email is shown to the admin. */
export function moderationText(ctx: ModerationContext): string {
  const { quote, author, category, tags } = ctx;
  const tagLine = tags.length > 0 ? `#${tags.map((t) => t.name).join(" #")}` : "—";
  const realName = [author.name, author.nickname].filter(Boolean).join(" / ") || author.email;
  return [
    "🆕 Yangi iqtibos (kutmoqda)",
    "",
    quote.text,
    "",
    `👤 Nashr etiladigan muallif: ${quote.anonymous ? "Anonim" : quote.displayAuthor}`,
    `🔒 Haqiqiy egasi: ${author.email}${realName !== author.email ? ` (${realName})` : ""}`,
    `🗂 Bo'lim: ${category.name}`,
    `🏷 Heshteglar: ${tagLine}`,
  ].join("\n");
}

/** Sends a new pending quote to the admin with Approve/Reject buttons.
 *  Returns the Telegram message id (to edit later) or null. */
export async function sendModerationMessage(ctx: ModerationContext): Promise<number | null> {
  if (!telegramEnabled()) return null;
  const json = await apiCall<TelegramResult<{ message_id: number }>>("sendMessage", {
    chat_id: config.telegramAdminChatId,
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
// Phone verification bot
// ---------------------------------------------------------------------------

/** Reply keyboard with a single "share my phone number" button. */
export interface ReplyKeyboard {
  keyboard: Array<Array<{ text: string; request_contact?: boolean }>>;
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

/** Cached `getMe` result so the bot username is resolved once. */
let cachedBotUsername: string | null | undefined;

/** The bot's public @username (no leading @), used to build deep links. */
export async function getBotUsername(): Promise<string | null> {
  if (cachedBotUsername !== undefined) return cachedBotUsername;
  if (!config.telegramBotToken) {
    cachedBotUsername = null;
    return null;
  }
  const json = await apiCall<TelegramResult<{ username?: string }>>("getMe", {});
  cachedBotUsername = json?.result?.username ?? null;
  return cachedBotUsername;
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: ReplyKeyboard
): Promise<void> {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await apiCall("sendMessage", body);
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
