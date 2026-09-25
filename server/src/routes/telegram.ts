import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { addLog } from "../lib/logstore.js";
import {
  answerCallbackQuery,
  editModerationMessage,
  sendTelegramMessage,
  requestContactMessage,
  sendVerificationCodeMessage,
  publishQuoteToChannel,
} from "../lib/telegram.js";
import {
  hashTelegramVerifyToken,
  generateTelegramVerifyCode,
  hashTelegramVerifyCode,
  telegramCodeExpiry,
  hashQuickLoginSessionId,
} from "../lib/tokens.js";
import { notifyQuoteModeration } from "../lib/notify.js";
import { recordAudit } from "../lib/audit.js";
import { POLICY_LABELS, approvePolicy } from "../lib/policies.js";
import { invalidateCaches, CACHE_PREFIXES } from "../lib/redisCache.js";
import { executeAdminCommand } from "../lib/adminCommands.js";

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
    } else if (update?.message?.contact) {
      // A contact always belongs to the verification flow, even when the client
      // attaches it as a reply to the bot's request message.
      await handleContact(update.message);
    } else if (update?.message?.reply_to_message) {
      await handleReply(update.message);
    } else if (typeof update?.message?.text === "string" && update.message.text.startsWith("/start")) {
      await handleStart(update.message);
    } else if (typeof update?.message?.text === "string" && isAdminChat(update.message.chat?.id)) {
      // Plain admin text messages become actionable prompts (approve, block,
      // VIP, broadcast, …). Non-admin text is intentionally ignored.
      await handleAdminText(update.message);
    } else {
      logger.warn(
        {
          updateId: update?.update_id,
          topKeys: update ? Object.keys(update) : null,
          messageKeys: update?.message ? Object.keys(update.message) : null,
        },
        "telegram update: no handler matched"
      );
    }
  } catch (err) {
    logger.error({ err }, "telegram webhook handler failed");
  }
  res.json({ ok: true });
});

const APPROVE_PREFIX = "approve:";
const REJECT_PREFIX = "reject:";
const POLICY_APPROVE_PREFIX = "policy:approve:";
const POLICY_SUGGEST_PREFIX = "policy:suggest:";
const POLICY_REJECT_PREFIX = "policy:reject:";

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
    void notifyQuoteModeration({ quoteId, decision: "approved" });
    void (async () => {
      try {
        const posted = await publishQuoteToChannel({ id: quote.id, text: quote.text, displayAuthor: quote.displayAuthor });
        if (posted) {
          await prisma.quote.update({ where: { id: quote.id }, data: { telegramPostedAt: new Date() } });
          addLog("info", `Iqtibos Telegram kanalga joylandi: ${quote.text.slice(0, 40)}...`);
        }
      } catch {
        /* channel failures must never break the approval */
      }
    })();
    void invalidateCaches([CACHE_PREFIXES.quoteOfDay, CACHE_PREFIXES.catalog]);
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
  } else if (data.startsWith(POLICY_APPROVE_PREFIX)) {
    const policyId = data.slice(POLICY_APPROVE_PREFIX.length);
    await answerCallbackQuery(cq.id, "Tasdiqlandi ✓");
    await handlePolicyApprove(policyId, chatId, messageId);
  } else if (data.startsWith(POLICY_SUGGEST_PREFIX)) {
    const policyId = data.slice(POLICY_SUGGEST_PREFIX.length);
    await answerCallbackQuery(cq.id, "Taklifingizni reply qilib yozing");
    await handlePolicyReplyAwait(policyId, "SUGGEST", chatId, messageId);
  } else if (data.startsWith(POLICY_REJECT_PREFIX)) {
    const policyId = data.slice(POLICY_REJECT_PREFIX.length);
    await answerCallbackQuery(cq.id, "Rad etish sababini yozing");
    await handlePolicyReplyAwait(policyId, "REJECT", chatId, messageId);
  }
}

/** Publishes a Draft Policy from the Telegram [Tasdiqlash] button. */
async function handlePolicyApprove(policyId: string, chatId: number | undefined, messageId: number | undefined): Promise<void> {
  const draft = await prisma.sitePolicy.findUnique({ where: { id: policyId } });
  if (!draft || draft.isApproved) {
    if (chatId !== undefined && messageId !== undefined) {
      await editModerationMessage(chatId, messageId, "Loyiha topilmadi yoki allaqachon tasdiqlangan.", null);
    }
    return;
  }
  await approvePolicy(draft.id, { id: null, email: "SUPER_ADMIN (Telegram)" });
  if (chatId !== undefined && messageId !== undefined) {
    await editModerationMessage(chatId, messageId, `✅ Tasdiqlandi — ${POLICY_LABELS[draft.type]} v${draft.version} nashr etildi.`, null);
  }
  await recordAudit({
    adminId: null,
    adminEmail: "SUPER_ADMIN (Telegram)",
    action: "policy.approve",
    targetType: "policy",
    targetId: draft.id,
    detail: `${draft.type} v${draft.version} Telegram orqali nashr etildi`,
    ip: null,
  });
  addLog("info", `${POLICY_LABELS[draft.type]} v${draft.version} Telegram orqali nashr etildi`);
}

/** Marks a Draft Policy as awaiting the admin's reply text (SUGGEST or REJECT). */
async function handlePolicyReplyAwait(policyId: string, mode: "SUGGEST" | "REJECT", chatId: number | undefined, messageId: number | undefined): Promise<void> {
  const draft = await prisma.sitePolicy.findUnique({ where: { id: policyId } });
  if (!draft || draft.isApproved) {
    if (chatId !== undefined && messageId !== undefined) {
      await editModerationMessage(chatId, messageId, "Loyiha topilmadi yoki allaqachon tasdiqlangan.", null);
    }
    return;
  }
  if (draft.awaitingTelegramReply) {
    if (chatId !== undefined && messageId !== undefined) {
      await editModerationMessage(chatId, messageId, "Bu loyihaga javob allaqachon kutilmoqda.", null);
    }
    return;
  }
  await prisma.sitePolicy.update({
    where: { id: draft.id },
    data: { awaitingTelegramReply: mode, telegramMessageId: messageId ?? null },
  });
  if (chatId !== undefined && messageId !== undefined) {
    const prompt =
      mode === "SUGGEST"
        ? `✍️ ${POLICY_LABELS[draft.type]} v${draft.version} — taklifingizni shu xabarga reply qilib yozing.`
        : `❌ ${POLICY_LABELS[draft.type]} v${draft.version} — rad etish sababini shu xabarga reply qilib yozing.`;
    await editModerationMessage(chatId, messageId, prompt, null);
  }
}

async function handleReply(msg: Record<string, any>): Promise<void> {
  if (!isAdminChat(msg.chat?.id)) return;
  const repliedId: number | undefined = msg.reply_to_message?.message_id;
  const reason = String(msg.text ?? "").trim().slice(0, 500);
  if (repliedId === undefined || !reason) return;

  const quote = await prisma.quote.findFirst({ where: { telegramMessageId: repliedId } });
  if (quote && quote.awaitingRejection && quote.status === "PENDING") {
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: "REJECTED", rejectionReason: reason, awaitingRejection: false },
    });
    await editModerationMessage(msg.chat.id, repliedId, rejectedText(quote, reason), null);
    void notifyQuoteModeration({ quoteId: quote.id, decision: "rejected", reason });
    void invalidateCaches([CACHE_PREFIXES.quoteOfDay, CACHE_PREFIXES.catalog]);
    addLog("warn", `Iqtibos rad etildi (Telegram): ${quote.text.slice(0, 40)}...`);
    return;
  }

  // Draft Policy reply flow: [Taklif kiritish bilan tasdiqlash] or [Rad etish
  // + sabab] — the admin's reply text becomes the comment/reason.
  const policy = await prisma.sitePolicy.findFirst({
    where: { telegramMessageId: repliedId, isApproved: false },
  });
  if (!policy || !policy.awaitingTelegramReply) return;

  if (policy.awaitingTelegramReply === "SUGGEST") {
    await prisma.sitePolicy.update({
      where: { id: policy.id },
      data: { awaitingTelegramReply: null, changeReason: reason },
    });
    await approvePolicy(policy.id, { id: null, email: "SUPER_ADMIN (Telegram)" });
    await editModerationMessage(
      msg.chat.id,
      repliedId,
      `✅ Tasdiqlandi (taklif bilan) — ${POLICY_LABELS[policy.type]} v${policy.version} nashr etildi.\n\nIzoh: ${reason}`,
      null
    );
    await recordAudit({
      adminId: null,
      adminEmail: "SUPER_ADMIN (Telegram)",
      action: "policy.approve",
      targetType: "policy",
      targetId: policy.id,
      detail: `${policy.type} v${policy.version} taklif bilan tasdiqlandi: ${reason}`,
      ip: null,
    });
    addLog("info", `${POLICY_LABELS[policy.type]} v${policy.version} taklif bilan tasdiqlandi (Telegram)`);
  } else if (policy.awaitingTelegramReply === "REJECT") {
    await prisma.sitePolicy.delete({ where: { id: policy.id } });
    await editModerationMessage(
      msg.chat.id,
      repliedId,
      `❌ Rad etildi — ${POLICY_LABELS[policy.type]} v${policy.version}\n\nSabab: ${reason}`,
      null
    );
    await recordAudit({
      adminId: null,
      adminEmail: "SUPER_ADMIN (Telegram)",
      action: "policy.reject-draft",
      targetType: "policy",
      targetId: policy.id,
      detail: `${policy.type} v${policy.version} rad etildi: ${reason}`,
      ip: null,
    });
    addLog("warn", `${POLICY_LABELS[policy.type]} v${policy.version} rad etildi (Telegram): ${reason.slice(0, 60)}`);
  }
}

/**
 * Admin prompt executor. Any plain text the admin sends (not a reply, not
 * /start) is treated as a command — the bot runs it and confirms with a
 * "✓ Topshiriq bajarildi: …" reply describing what was done.
 */
async function handleAdminText(msg: Record<string, any>): Promise<void> {
  if (!isAdminChat(msg.chat?.id)) return;
  const chatId: number | undefined = msg.chat?.id;
  const text = String(msg.text ?? "").trim().slice(0, 2000);
  if (chatId === undefined || !text) return;

  const reply = await executeAdminCommand(text);
  const sent = await sendTelegramMessage(chatId, reply, undefined, msg.message_id);
  if (!sent) logger.warn({ chatId }, "admin command reply not delivered");
}

// ---------------------------------------------------------------------------
// Phone verification: /start verify_<token> then a shared contact.
// ---------------------------------------------------------------------------

async function handleStart(msg: Record<string, any>): Promise<void> {
  const chatId: number | undefined = msg.chat?.id;
  const text = String(msg.text ?? "");
  if (chatId === undefined) return;

  // One-tap login from t.me/<bot>?start=quick_<sessionId>.
  if (text.match(/^\/start\s+quick_([0-9a-f]+)$/i)) {
    await handleQuickStart(msg, chatId, text.match(/^\/start\s+quick_([0-9a-f]+)$/i)![1]);
    return;
  }

  const match = text.match(/^\/start\s+verify_([0-9a-f]+)$/i);
  if (!match) {
    // Telegram drops oversized/malformed deep-link payloads, so a user can end
    // up here with a bare /start. Point them back to the site instead of
    // silently ignoring the message.
    await sendTelegramMessage(
      chatId,
      "Bu bot orqali profilni tasdiqlash uchun saytdagi profil sahifasida «Telegram orqali tasdiqlash» tugmasini bosing va botga yuborilgan unikal havolani oching."
    );
    return;
  }

  const digest = hashTelegramVerifyToken(match[1]);
  const user = await prisma.user.findFirst({ where: { telegramVerifyToken: digest } });
  if (!user || !user.telegramVerifyExpiresAt || user.telegramVerifyExpiresAt < new Date()) {
    await sendTelegramMessage(chatId, "Havola yaroqsiz yoki muddati o'tgan. Saytda qayta urinib ko'ring.");
    return;
  }

  // Remember which Telegram chat is completing this session so the shared
  // contact can be linked back to the correct user.
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramVerifyChatId: String(chatId) },
  });
  await requestContactMessage(chatId, "Telefon raqamingizni yuborish uchun quyidagi tugmani bosing:");
}

// ---------------------------------------------------------------------------
// One-tap quick login: /start quick_<sessionId>.
// ---------------------------------------------------------------------------

async function handleQuickStart(msg: Record<string, any>, chatId: number, sessionId: string): Promise<void> {
  const session = await prisma.telegramQuickSession.findUnique({
    where: { tokenHash: hashQuickLoginSessionId(sessionId) },
  });
  if (!session) {
    await sendTelegramMessage(chatId, "Havola yaroqsiz. Saytda «Telegram orqali tezkor kirish» tugmasini qayta bosib ko'ring.");
    return;
  }
  if (session.expiresAt < new Date() || session.status === "EXPIRED") {
    if (session.status !== "EXPIRED") {
      await prisma.telegramQuickSession.update({ where: { id: session.id }, data: { status: "EXPIRED" } });
    }
    await sendTelegramMessage(chatId, "Havola muddati o'tgan. Saytda «Telegram orqali tezkor kirish» tugmasini qayta bosib ko'ring.");
    return;
  }
  if (session.status !== "PENDING") {
    await sendTelegramMessage(chatId, "Bu havola allaqachon ishlatilgan. Saytda qayta urinib ko'ring.");
    return;
  }

  const from = msg.from ?? {};
  const telegramId = String(chatId);
  const firstName = String(from.first_name ?? "").slice(0, 100) || null;
  const lastName = String(from.last_name ?? "").slice(0, 100) || null;
  const username = String(from.username ?? "").slice(0, 64) || null;

  // Reuse an existing profile linked to this Telegram account so repeated
  // logins keep the same identity; otherwise create a like-only quick account.
  let user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: null,
        passwordHash: null,
        nickname: username ?? firstName,
        telegramId,
        telegramUsername: username,
        telegramFirstName: firstName,
        telegramLastName: lastName,
        quickLogin: true,
      },
    });
  }

  await prisma.telegramQuickSession.update({
    where: { id: session.id },
    data: { status: "COMPLETE", userId: user.id, chatId: String(chatId), completedAt: new Date() },
  });

  const suffix = user.quickLogin
    ? "\n\nEslatma: to'liq huquqlar (iqtibos joylash) uchun saytda profil sahifasida ro'yxatdan o'tishni yakunlang."
    : "";
  await sendTelegramMessage(chatId, `✅ Kirish tasdiqlandi, ${user.nickname ?? user.telegramUsername ?? "foydalanuvchi"}! Saytga qayting — sahifa avtomatik yangilanadi.${suffix}`);
  addLog("info", `Tezkor Telegram kirish: ${user.id} (${user.email ?? user.telegramUsername ?? telegramId})`);
}

async function handleContact(msg: Record<string, any>): Promise<void> {
  const chatId: number | undefined = msg.chat?.id;
  const contact: Record<string, any> | undefined = msg.contact;
  if (chatId === undefined || !contact?.phone_number) {
    logger.warn(
      {
        chatId,
        contactKeys: contact ? Object.keys(contact) : null,
        phoneNumber: contact?.phone_number,
      },
      "telegram contact ignored: chat or phone missing"
    );
    return;
  }
  // In a private chat only the chat owner can send us messages, so a shared
  // contact belongs to the verification session regardless of whether Telegram
  // includes a user_id (it is absent for manually attached contacts).
  if (contact.user_id !== undefined && String(contact.user_id) !== String(chatId)) {
    logger.warn({ chatId, contactUserId: contact.user_id }, "telegram contact: user_id differs from chat id");
  }

  const user = await prisma.user.findFirst({ where: { telegramVerifyChatId: String(chatId) } });
  if (!user || !user.telegramVerifyExpiresAt || user.telegramVerifyExpiresAt < new Date()) {
    await sendTelegramMessage(
      chatId,
      "Tasdiqlash sessiyasi topilmadi yoki muddati o'tgan. Saytda qayta urinib ko'ring."
    );
    return;
  }

  // One Telegram account can only be linked to one profile.
  const linked = await prisma.user.findFirst({ where: { telegramId: String(chatId) } });
  if (linked && linked.id !== user.id) {
    await sendTelegramMessage(
      chatId,
      "Bu Telegram akkaunt boshqa profilga bog'langan. Saytda email orqali tasdiqlang yoki yangi profil yarating."
    );
    return;
  }

  const phone = String(contact.phone_number).replace(/[^\d+]/g, "");
  const code = generateTelegramVerifyCode();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      telegramId: String(chatId),
      phoneNumber: phone,
      telegramVerifyCode: hashTelegramVerifyCode(code),
      telegramVerifyCodeExpiresAt: telegramCodeExpiry(),
      telegramVerifyChatId: null,
    },
  });
  await sendVerificationCodeMessage(chatId, code);
  addLog("info", `Telegram orqali telefon raqam bog'landi: ${phone.slice(0, 5)}...`);
}
