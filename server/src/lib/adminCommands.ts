import { prisma } from "./prisma.js";
import { config } from "../config.js";
import { addLog } from "./logstore.js";
import { recordAudit } from "./audit.js";
import { invalidateCaches, CACHE_PREFIXES } from "./redisCache.js";
import { editModerationMessage, sendTelegramMessage, telegramEnabled, publishQuoteToChannel } from "./telegram.js";
import { notifyQuoteModeration } from "./notify.js";
import { bus } from "./bus.js";
import { logger } from "./logger.js";

const DAY = 24 * 60 * 60 * 1000;

/** Actor label written into the audit trail for actions done from the bot. */
const TELEGRAM_ACTOR = "Telegram bot";

// ---------------------------------------------------------------------------
// Command shapes
// ---------------------------------------------------------------------------

export type AdminCommand =
  | { kind: "help" }
  | { kind: "stats" }
  | { kind: "pending" }
  | { kind: "users" }
  | { kind: "quoteInfo"; quoteId: string }
  | { kind: "approve"; quoteId: string }
  | { kind: "verify"; email: string }
  | { kind: "unverify"; email: string }
  | { kind: "reject"; quoteId: string; reason: string }
  | { kind: "block"; email: string }
  | { kind: "unblock"; email: string }
  | { kind: "vip"; email: string; days: number | "lifetime" | null }
  | { kind: "vipOff"; email: string }
  | { kind: "ban"; ip: string; reason: string | null }
  | { kind: "unban"; ip: string }
  | { kind: "announce"; title: string; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "unknown" };

/**
 * Parses a free-form admin prompt into a structured command. Keywords work in
 * Uzbek and English (case-insensitive, optional leading `/`):
 *
 *   help / yordam · stats · pending / kutmoqda · users
 *   approve / tasdiqla <id|email> · rad et <id> <sabab>
 *   blokla <email> / och <email> · vip <email> [kun|umrbod] · vip off <email>
 *   verify <email> / unverify <email> · ban <ip> / unban <ip>
 *   elon <matn> | elon <sarlavha> | <matn>
 *
 * `approve`/`tasdiqla` dispatches by target: an email verifies the user, a
 * quote id approves the quote.
 */
export function parseAdminCommand(input: string): AdminCommand {
  const raw = input.trim();
  if (!raw) return { kind: "unknown" };

  const withoutSlash = raw.replace(/^\/+/, "");
  const match = withoutSlash.match(/^(\S+)\s*([\s\S]*)$/);
  const head = (match ? match[1] : withoutSlash).toLowerCase();
  let rest = match ? match[2].trim() : "";

  // "rad et <id> <sabab>" — drop the bridging "et" word.
  if (head === "rad") {
    const withEt = rest.match(/^et\b\s*([\s\S]*)$/i);
    if (withEt) rest = withEt[1];
  }

  const tokens = rest ? rest.split(/\s+/) : [];

  if (HELP.has(head)) return { kind: "help" };
  if (STATS.has(head)) return { kind: "stats" };
  if (PENDING.has(head)) return { kind: "pending" };
  if (USERS.has(head)) return { kind: "users" };
  if (QUOTE.has(head)) return tokens[0] ? { kind: "quoteInfo", quoteId: tokens[0] } : { kind: "invalid", message: "Iqtibos ID kiriting: iqtibos <id>" };

  if (APPROVE.has(head)) {
    const target = tokens[0] ?? "";
    if (!target) return { kind: "invalid", message: "Iqtibos ID yoki email kiriting: tasdiqla <id|email>" };
    if (isEmail(target)) return { kind: "verify", email: target.toLowerCase() };
    return { kind: "approve", quoteId: target };
  }

  if (REJECT.has(head)) {
    const quoteId = tokens[0] ?? "";
    if (!quoteId) return { kind: "invalid", message: "Iqtibos ID kiriting: rad et <id> <sabab>" };
    const reason = rest.replace(/^\S+\s*/, "").trim();
    if (!reason) return { kind: "invalid", message: `Sabab yozish shart: rad et ${quoteId} <sabab>` };
    return { kind: "reject", quoteId, reason: reason.slice(0, 500) };
  }

  if (BLOCK.has(head)) {
    const email = (tokens[0] ?? "").toLowerCase();
    if (!isEmail(email)) return { kind: "invalid", message: "Email kiriting: blokla <email>" };
    return { kind: "block", email };
  }

  if (UNBLOCK.has(head)) {
    const email = (tokens[0] ?? "").toLowerCase();
    if (!isEmail(email)) return { kind: "invalid", message: "Email kiriting: och <email>" };
    return { kind: "unblock", email };
  }

  if (VIP.has(head)) {
    const a = tokens[0] ?? "";
    if (!a) return { kind: "invalid", message: "Email kiriting: vip <email> [kun] — masalan: vip user@mail.com 30" };
    if (REVOKE.has(a.toLowerCase())) {
      const email = (tokens[1] ?? "").toLowerCase();
      if (!isEmail(email)) return { kind: "invalid", message: "Email kiriting: vip off <email>" };
      return { kind: "vipOff", email };
    }
    if (!isEmail(a)) return { kind: "invalid", message: `Email tan olinmadi: ${a}. Masalan: vip user@mail.com 30` };
    const d = tokens[1];
    if (d === undefined) return { kind: "vip", email: a.toLowerCase(), days: null };
    if (LIFETIME.has(d.toLowerCase())) return { kind: "vip", email: a.toLowerCase(), days: "lifetime" };
    if (/^\d{1,5}$/.test(d)) return { kind: "vip", email: a.toLowerCase(), days: Math.max(1, Math.min(3650, parseInt(d, 10))) };
    return { kind: "invalid", message: `Kun soni noto'g'ri: ${d}. Masalan: vip user@mail.com 30 yoki vip user@mail.com umrbod` };
  }

  if (VERIFY.has(head)) {
    const a = tokens[0] ?? "";
    if (!a) return { kind: "invalid", message: "Email kiriting: verify <email>" };
    if (REVOKE.has(a.toLowerCase())) {
      const email = (tokens[1] ?? "").toLowerCase();
      if (!isEmail(email)) return { kind: "invalid", message: "Email kiriting: verify off <email>" };
      return { kind: "unverify", email };
    }
    if (!isEmail(a)) return { kind: "invalid", message: `Email tan olinmadi: ${a}` };
    return { kind: "verify", email: a.toLowerCase() };
  }

  if (UNVERIFY.has(head)) {
    const email = (tokens[0] ?? "").toLowerCase();
    if (!isEmail(email)) return { kind: "invalid", message: "Email kiriting: unverify <email>" };
    return { kind: "unverify", email };
  }

  if (BAN.has(head)) {
    const ip = tokens[0] ?? "";
    if (!isIpLike(ip)) return { kind: "invalid", message: `IP manzil noto'g'ri: ${ip || "(yo'q)"}. Masalan: ban 192.168.1.5` };
    const reason = rest.replace(/^\S+\s*/, "").trim() || null;
    return { kind: "ban", ip, reason: reason ? reason.slice(0, 200) : null };
  }

  if (UNBAN.has(head)) {
    const ip = tokens[0] ?? "";
    if (!isIpLike(ip)) return { kind: "invalid", message: `IP manzil noto'g'ri: ${ip || "(yo'q)"}. Masalan: unban 192.168.1.5` };
    return { kind: "unban", ip };
  }

  if (ANNOUNCE.has(head)) {
    if (!rest) return { kind: "invalid", message: "E'lon matni yo'q: elon <matn>" };
    const sepIndex = rest.indexOf(" | ");
    if (sepIndex >= 0) {
      const title = rest.slice(0, sepIndex).trim().slice(0, 100);
      const message = rest.slice(sepIndex + 3).trim().slice(0, 4000);
      if (!title || !message) return { kind: "invalid", message: "elon <sarlavha> | <matn> formatidan foydalaning" };
      return { kind: "announce", title, message };
    }
    return { kind: "announce", title: "Telegram e'lon", message: rest.slice(0, 4000) };
  }

  return { kind: "unknown" };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Runs a parsed command and returns the Telegram reply text. Successful admin
 * actions are confirmed with a "✓ Topshiriq bajarildi: …" summary.
 */
export async function executeAdminCommand(input: string): Promise<string> {
  const cmd = parseAdminCommand(input);
  try {
    switch (cmd.kind) {
      case "help":
        return HELP_TEXT;
      case "stats":
        return await statsText();
      case "pending":
        return await pendingText();
      case "users":
        return await usersText();
      case "quoteInfo":
        return await quoteInfoText(cmd.quoteId);
      case "approve":
        return await approveQuote(cmd.quoteId);
      case "verify":
        return await verifyUser(cmd.email);
      case "unverify":
        return await unverifyUser(cmd.email);
      case "reject":
        return await rejectQuote(cmd.quoteId, cmd.reason);
      case "block":
        return await blockUser(cmd.email);
      case "unblock":
        return await unblockUser(cmd.email);
      case "vip":
        return await grantVip(cmd.email, cmd.days);
      case "vipOff":
        return await revokeVip(cmd.email);
      case "ban":
        return await banIp(cmd.ip, cmd.reason);
      case "unban":
        return await unbanIp(cmd.ip);
      case "announce":
        return await announce(cmd.title, cmd.message);
      case "invalid":
        return `✗ ${cmd.message}`;
      default:
        return UNKNOWN_TEXT;
    }
  } catch (err) {
    logger.error({ err }, "admin command failed");
    return "✗ Buyruq bajarilmadi: tizim xatosi. Qayta urinib ko'ring yoki /yordam yozing.";
  }
}

// ---------------------------------------------------------------------------
// Queries (no side effects)
// ---------------------------------------------------------------------------

async function statsText(): Promise<string> {
  const now = new Date();
  const [pending, approved, rejected, users, vip, blocked, bans] = await Promise.all([
    prisma.quote.count({ where: { status: "PENDING", deletedAt: null } }),
    prisma.quote.count({ where: { status: "APPROVED", deletedAt: null } }),
    prisma.quote.count({ where: { status: "REJECTED", deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({
      where: { isPremium: true, deletedAt: null, OR: [{ premiumExpiresAt: null }, { premiumExpiresAt: { gt: now } }] },
    }),
    prisma.user.count({ where: { blocked: true, deletedAt: null } }),
    prisma.bannedIp.count(),
  ]);
  return [
    "📊 Statistika",
    "",
    `• Iqtiboslar: ${pending} kutmoqda · ${approved} tasdiqlangan · ${rejected} rad etilgan`,
    `• Foydalanuvchilar: ${users} (VIP ${vip}, bloklangan ${blocked})`,
    `• IP banlar: ${bans}`,
    "",
    "To'liq ro'yxat uchun: pending · users · yordam",
  ].join("\n");
}

async function pendingText(): Promise<string> {
  const list = await prisma.quote.findMany({
    where: { status: "PENDING", deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 12,
    select: { id: true, text: true, displayAuthor: true, createdAt: true },
  });
  if (list.length === 0) return "✅ Kutayotgan iqtiboslar yo'q";
  const lines = list.map((q, i) => `${i + 1}. #${q.id.slice(0, 8)} — ${snippet(q.text, 60)}\n   (${q.displayAuthor}, ${fmtDate(q.createdAt)})`);
  return [
    `🕐 Kutayotgan iqtiboslar (${list.length})`,
    "",
    ...lines,
    "",
    "Tasdiqlash: approve <id> · Rad etish: reject <id> <sabab>",
  ].join("\n");
}

async function usersText(): Promise<string> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [total, today, vip, blocked] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { createdAt: { gte: startOfDay }, deletedAt: null } }),
    prisma.user.count({ where: { isPremium: true, deletedAt: null, OR: [{ premiumExpiresAt: null }, { premiumExpiresAt: { gt: new Date() } }] } }),
    prisma.user.count({ where: { blocked: true, deletedAt: null } }),
  ]);
  return `👥 Foydalanuvchilar\n\n• Jami: ${total}\n• Bugun ro'yxatdan o'tgan: ${today}\n• VIP: ${vip}\n• Bloklangan: ${blocked}`;
}

async function quoteInfoText(quoteId: string): Promise<string> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { category: true, tags: true, _count: { select: { likes: true } } },
  });
  if (!quote) return `✗ Iqtibos topilmadi: ${quoteId}`;
  const status = quote.status === "APPROVED" ? "✅ Tasdiqlangan" : quote.status === "REJECTED" ? "❌ Rad etilgan" : "🕐 Kutmoqda";
  const reason = quote.rejectionReason ? `\nSabab: ${quote.rejectionReason}` : "";
  const tags = quote.tags.map((t) => t.name).join(", ") || "—";
  const owner = await prisma.user.findUnique({ where: { id: quote.userId }, select: { email: true, nickname: true } });
  return [
    `📄 Iqtibos #${quote.id.slice(0, 8)}`,
    `Holat: ${status}${reason}`,
    `Muallif (nashr): ${quote.anonymous ? "Anonim" : quote.displayAuthor}`,
    `Egasi: ${owner?.email ?? owner?.nickname ?? "unknown"}`,
    `Bo'lim: ${quote.category.name}`,
    `Heshteglar: ${tags}`,
    `Ko'rishlar: ${quote.views} · Yoqtirishlar: ${quote._count.likes}`,
    `Yaratilgan: ${fmtDate(quote.createdAt)}`,
    "",
    `“${snippet(quote.text, 160)}”`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Quote moderation
// ---------------------------------------------------------------------------

async function approveQuote(quoteId: string): Promise<string> {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) return `✗ Iqtibos topilmadi: ${quoteId}`;
  if (quote.status !== "PENDING") return `✗ Bajarilmadi: iqtibos hozir ${quote.status} holatda`;

  const wasPending = quote.status === "PENDING";
  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "APPROVED", awaitingRejection: false, rejectionReason: null },
  });
  if (quote.telegramMessageId !== null && config.telegramAdminChatId) {
    await editModerationMessage(
      config.telegramAdminChatId,
      quote.telegramMessageId,
      `✅ Tasdiqlandi\n\n${quote.text}\n\n— ${quote.displayAuthor}`,
      null
    );
  }
  if (wasPending) void notifyQuoteModeration({ quoteId: quote.id, decision: "approved" });
  if (!quote.telegramPostedAt) {
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
  }
  void invalidateCaches([CACHE_PREFIXES.quoteOfDay, CACHE_PREFIXES.catalog]);
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "quote.approve",
    targetType: "quote",
    targetId: quote.id,
    detail: quote.text.slice(0, 60),
    ip: null,
  });
  addLog("info", `Iqtibos tasdiqlandi (Telegram buyruq): ${quote.text.slice(0, 40)}...`);
  return `✓ Topshiriq bajarildi: #${quote.id.slice(0, 8)} iqtibosni tasdiqlash\n\n“${snippet(quote.text, 140)}”\n\n— ${quote.displayAuthor}`;
}

async function rejectQuote(quoteId: string, reason: string): Promise<string> {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId } });
  if (!quote) return `✗ Iqtibos topilmadi: ${quoteId}`;
  if (quote.status !== "PENDING") return `✗ Bajarilmadi: iqtibos hozir ${quote.status} holatda`;

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: "REJECTED", rejectionReason: reason, awaitingRejection: false },
  });
  if (quote.telegramMessageId !== null && config.telegramAdminChatId) {
    await editModerationMessage(
      config.telegramAdminChatId,
      quote.telegramMessageId,
      `❌ Rad etildi\n\n${quote.text}\n\n— ${quote.displayAuthor}\n\nSabab: ${reason}`,
      null
    );
  }
  void notifyQuoteModeration({ quoteId: quote.id, decision: "rejected", reason });
  void invalidateCaches([CACHE_PREFIXES.quoteOfDay, CACHE_PREFIXES.catalog]);
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "quote.reject",
    targetType: "quote",
    targetId: quote.id,
    detail: `${quote.text.slice(0, 60)} (sabab: ${reason})`,
    ip: null,
  });
  addLog("warn", `Iqtibos rad etildi (Telegram buyruq): ${quote.text.slice(0, 40)}...`);
  return `✓ Topshiriq bajarildi: #${quote.id.slice(0, 8)} iqtibosni rad etish (sabab: ${snippet(reason, 80)})`;
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function blockUser(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return `✗ Foydalanuvchi topilmadi: ${email}`;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return "✗ Admin hisobini bloklash mumkin emas";
  await prisma.user.update({ where: { id: user.id }, data: { blocked: true, blockedAt: new Date() } });
  void bus.publish("admin:user-block", { userId: user.id });
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "user.block",
    targetType: "user",
    targetId: user.id,
    detail: email,
    ip: null,
  });
  return `✓ Topshiriq bajarildi: ${email} foydalanuvchini bloklash`;
}

async function unblockUser(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return `✗ Foydalanuvchi topilmadi: ${email}`;
  await prisma.user.update({ where: { id: user.id }, data: { blocked: false, blockedAt: null } });
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "user.unblock",
    targetType: "user",
    targetId: user.id,
    detail: email,
    ip: null,
  });
  return `✓ Topshiriq bajarildi: ${email} foydalanuvchini blokdan chiqarish`;
}

async function grantVip(email: string, days: number | "lifetime" | null): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return `✗ Foydalanuvchi topilmadi: ${email}`;
  const expiresAt = days === "lifetime" || days === null ? null : new Date(Date.now() + days * DAY);
  await prisma.user.update({
    where: { id: user.id },
    data: { isPremium: true, premiumExpiresAt: expiresAt },
  });
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "user.premium",
    targetType: "user",
    targetId: user.id,
    detail: `VIP berildi (${expiresAt ? expiresAt.toISOString() : "umrbod"})`,
    ip: null,
  });
  const when = expiresAt ? `gacha (${expiresAt.toISOString().slice(0, 10)})` : "umrbod";
  return `✓ Topshiriq bajarildi: ${email} uchun VIP ${when}`;
}

async function revokeVip(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return `✗ Foydalanuvchi topilmadi: ${email}`;
  await prisma.user.update({ where: { id: user.id }, data: { isPremium: false, premiumExpiresAt: null } });
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "user.premium",
    targetType: "user",
    targetId: user.id,
    detail: "VIP olib tashlandi",
    ip: null,
  });
  return `✓ Topshiriq bajarildi: ${email} uchun VIP olib tashlandi`;
}

async function verifyUser(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return `✗ Foydalanuvchi topilmadi: ${email}`;
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") return "✗ Admin hisobini qo'lda tasdiqlash shart emas";
  await prisma.user.update({
    where: { id: user.id },
    data: { isSuperApproved: true, superApprovedAt: new Date() },
  });
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "user.super-approve",
    targetType: "user",
    targetId: user.id,
    detail: email,
    ip: null,
  });
  return `✓ Topshiriq bajarildi: ${email} foydalanuvchini qo'lda tasdiqlash (iqtibos joylash huquqi berildi)`;
}

async function unverifyUser(email: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return `✗ Foydalanuvchi topilmadi: ${email}`;
  await prisma.user.update({
    where: { id: user.id },
    data: { isSuperApproved: false, superApprovedAt: null },
  });
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "user.super-unapprove",
    targetType: "user",
    targetId: user.id,
    detail: email,
    ip: null,
  });
  return `✓ Topshiriq bajarildi: ${email} uchun qo'lda tasdiqlash bekor qilindi`;
}

// ---------------------------------------------------------------------------
// IP bans
// ---------------------------------------------------------------------------

async function banIp(ip: string, reason: string | null): Promise<string> {
  const ban = await prisma.bannedIp.upsert({
    where: { ipAddress: ip },
    update: { reason: reason ?? null },
    create: { ipAddress: ip, reason: reason ?? null },
  });
  void bus.publish("admin:ban", { ipAddress: ban.ipAddress, reason: ban.reason });
  addLog("ban", `IP ${ban.ipAddress} banned (Telegram buyruq)`);
  return `✓ Topshiriq bajarildi: ${ban.ipAddress} IP manzilni bloklash${reason ? ` (sabab: ${reason})` : ""}`;
}

async function unbanIp(ip: string): Promise<string> {
  try {
    await prisma.bannedIp.delete({ where: { ipAddress: ip } });
  } catch {
    return `✗ Ban topilmadi: ${ip}`;
  }
  void bus.publish("admin:unban", { ipAddress: ip });
  addLog("info", `IP ${ip} unbanned (Telegram buyruq)`);
  return `✓ Topshiriq bajarildi: ${ip} IP manzildan blokni olib tashlash`;
}

// ---------------------------------------------------------------------------
// Broadcast / announcements
// ---------------------------------------------------------------------------

async function announce(title: string, message: string): Promise<string> {
  const announcement = await prisma.announcement.create({
    data: { title, message, channel: "TELEGRAM", status: "ACTIVE", createdById: null },
  });
  await recordAudit({
    adminId: null,
    adminEmail: TELEGRAM_ACTOR,
    action: "announcement.create",
    targetType: "announcement",
    targetId: announcement.id,
    detail: title,
    ip: null,
  });
  const sent = await broadcastTelegramText(title, message);
  return `✓ Topshiriq bajarildi: e'lon yuborish (${sent} ta Telegram foydalanuvchiga)`;
}

async function broadcastTelegramText(title: string, message: string): Promise<number> {
  if (!telegramEnabled()) return 0;
  const users = await prisma.user.findMany({
    where: { telegramId: { not: null }, deletedAt: null, blocked: false },
    select: { telegramId: true },
  });
  const text = `📢 ${title}\n\n${message}`;
  let sent = 0;
  for (const u of users) {
    if (u.telegramId) {
      const ok = await sendTelegramMessage(u.telegramId, text);
      if (ok) sent += 1;
    }
  }
  addLog("info", `Telegram e'lon (bot buyruq): ${title} -> ${sent}/${users.length} foydalanuvchi`);
  return sent;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isIpLike(value: string): boolean {
  return value.length >= 3 && value.length <= 45 && /^[0-9a-f.:]+$/i.test(value);
}

function snippet(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max).trimEnd()}…` : clean;
}

function fmtDate(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

// ---------------------------------------------------------------------------
// Keyword sets
// ---------------------------------------------------------------------------

const HELP = new Set(["help", "yordam", "buyruqlar", "h"]);
const STATS = new Set(["stats", "statistika", "holat", "dashboard"]);
const PENDING = new Set(["pending", "kutmoqda", "kutayotgan", "navbat"]);
const USERS = new Set(["users", "foydalanuvchilar"]);
const QUOTE = new Set(["quote", "sitata", "iqtibos"]);
const APPROVE = new Set(["approve", "tasdiqla"]);
const REJECT = new Set(["reject", "rad", "radet"]);
const BLOCK = new Set(["block", "blokla", "blok"]);
const UNBLOCK = new Set(["unblock", "och", "blokdan"]);
const VIP = new Set(["vip", "premium"]);
const VERIFY = new Set(["verify", "verifyemail"]);
const UNVERIFY = new Set(["unverify", "unapprove"]);
const BAN = new Set(["ban", "ipban"]);
const UNBAN = new Set(["unban", "ipoch"]);
const ANNOUNCE = new Set(["announce", "elon", "e'lon", "e`lon", "xabar"]);
const REVOKE = new Set(["off", "stop", "remove", "ochir", "ochirish", "bekor", "olib", "ol", "revoke"]);
const LIFETIME = new Set(["umrbod", "lifetime", "forever", "cheksiz", "0"]);

const HELP_TEXT = [
  "📖 Bot buyruqlari (admin)",
  "",
  "yorDam — bu ro'yxat",
  "stats — statistika",
  "pending — kutayotgan iqtiboslar",
  "users — foydalanuvchilar",
  "iqtibos <id> — bitta iqtibos tafsiloti",
  "tasdiqla <id> — iqtibosni tasdiqlash",
  "rad et <id> <sabab> — iqtibosni rad etish",
  "tasdiqla <email> / verify <email> — foydalanuvchini qo'lda tasdiqlash",
  "verify off <email> — tasdiqlashni bekor qilish",
  "blokla <email> / och <email> — foydalanuvchini bloklash / ochish",
  "vip <email> [kun|umrbod] — VIP berish (standart 30 kun)",
  "vip off <email> — VIP olib tashlash",
  "ban <ip> [sabab] / unban <ip> — IP bloklash / ochish",
  "elon <matn> — barcha Telegram foydalanuvchilariga e'lon yuborish",
  "elon <sarlavha> | <matn> — sarlavhali e'lon",
  "",
  "Barcha buyruqlar faqat admin chatdan ishlaydi.",
].join("\n");

const UNKNOWN_TEXT = [
  "Buyruq tan olinmadi.",
  "",
  "Misollar: stats · pending · tasdiqla <id> · rad et <id> <sabab> · blokla <email> · vip <email> 30 · ban <ip> · elon <matn>",
  "",
  "To'liq ro'yxat: yordam",
].join("\n");