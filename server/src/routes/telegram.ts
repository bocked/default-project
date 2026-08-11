import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { addLog } from "../lib/logstore.js";
import { answerCallbackQuery, editModerationMessage } from "../lib/telegram.js";

export const telegramRouter = Router();

/**
 * Only Telegram can call this endpoint — it is verified through the secret
 * token exchanged when the webhook is registered (`X-Telegram-Bot-Api-Secret-Token`).
 */
telegramRouter.use((req, res, next) => {
  const secret = req.header("x-telegram-bot-api-secret-token") ?? "";
  if (!config.telegramWebhookSecret || secret !== config.telegramWebhookSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

// POST /api/telegram/webhook
telegramRouter.post("/webhook", async (req, res) => {
  // Always answer 200 quickly so Telegram does not retry the update.
  try {
    const update = req.body as Record<string, any>;
    if (update?.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update?.message?.reply_to_message) {
      await handleReply(update.message);
    }
  } catch (err) {
    logger.error({ err }, "telegram webhook handler failed");
  }
  res.json({ ok: true });
});

const APPROVE_PREFIX = "approve:";
const REJECT_PREFIX = "reject:";

function isAdminChat(chatId: unknown): boolean {
  return config.telegramAdminChatId.length > 0 && Number(chatId) === Number(config.telegramAdminChatId);
}

function approvedText(quote: { text: string; displayAuthor: string }): string {
  return `✅ Tasdiqlandi\n\n${quote.text}\n\n— ${quote.displayAuthor}`;
}

function rejectedText(quote: { text: string; displayAuthor: string }, reason: string): string {
  return `❌ Rad etildi\n\n${quote.text}\n\n— ${quote.displayAuthor}\n\nSabab: ${reason}`;
}

async function handleCallback(cq: Record<string, any>): Promise<void> {
  const data = String(cq.data ?? "");
  const chatId = cq.message?.chat?.id;
  const messageId: number | undefined = cq.message?.message_id;

  if (!isAdminChat(chatId)) {
    await answerCallbackQuery(cq.id, "Ruxsat yo'q");
    return;
  }

  if (data.startsWith(APPROVE_PREFIX)) {
    const quoteId = data.slice(APPROVE_PREFIX.length);
    await answerCallbackQuery(cq.id, "Tasdiqlandi ✓");
    const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote || quote.status !== "PENDING") return;
    await prisma.quote.update({
      where: { id: quoteId },
      data: { status: "APPROVED", awaitingRejection: false, rejectionReason: null },
    });
    if (messageId) await editModerationMessage(chatId, messageId, approvedText(quote), null);
    addLog("info", `Iqtibos tasdiqlandi (Telegram): ${quote.text.slice(0, 40)}...`);
  } else if (data.startsWith(REJECT_PREFIX)) {
    const quoteId = data.slice(REJECT_PREFIX.length);
    await answerCallbackQuery(cq.id, "Rad etish sababini yozing");
    const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote || quote.status !== "PENDING") return;
    await prisma.quote.update({ where: { id: quoteId }, data: { awaitingRejection: true } });
    if (messageId) {
      await editModerationMessage(
        chatId,
        messageId,
        `❌ Rad etilmoqda. Iltimos, sababni shu xabarga reply qilib yozing:\n\n${quote.text}`,
        null
      );
    }
  }
}

async function handleReply(msg: Record<string, any>): Promise<void> {
  if (!isAdminChat(msg.chat?.id)) return;
  const repliedId: number | undefined = msg.reply_to_message?.message_id;
  const reason = String(msg.text ?? "").trim().slice(0, 500);
  if (repliedId === undefined || !reason) return;

  const quote = await prisma.quote.findFirst({ where: { telegramMessageId: repliedId } });
  if (!quote || !quote.awaitingRejection || quote.status !== "PENDING") return;

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "REJECTED", rejectionReason: reason, awaitingRejection: false },
  });
  await editModerationMessage(msg.chat.id, repliedId, rejectedText(quote, reason), null);
  addLog("warn", `Iqtibos rad etildi (Telegram): ${quote.text.slice(0, 40)}...`);
}
