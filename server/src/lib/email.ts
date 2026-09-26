import { Resend } from "resend";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { EmailStatus, EmailType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { config } from "../config.js";
import { logger } from "./logger.js";
import { sendAdminNotification } from "./telegram.js";

export interface EmailRecord {
  to: string;
  subject: string;
  html: string;
  text: string;
  at: string;
  type: EmailType;
}

/**
 * In-memory transcript of every email "sent" while Resend is not configured or
 * during the E2E suite (NODE_ENV=test). Tests use this to read the raw
 * verification link/OTP instead of actually delivering mail.
 */
export const emailTranscript: EmailRecord[] = [];

// Hard wall-clock cap for every outbound Resend call (send / API probe). The
// send-otp / forgot-password routes rely on this so a stalled provider never
// leaves the client's "Yuborilmoqda..." button hanging.
export const EMAIL_SEND_TIMEOUT_MS = 8000;

/** Raised when a send is blocked by Resend sandbox mode (unverified domain) and
 *  the recipient is not the project owner. Routes surface this as a 400 with
 *  the actionable Uzbek message instead of a generic 500. */
export class EmailSandboxError extends Error {
  constructor() {
    super("Test rejimida faqat administrator emailiga xat yuboriladi");
    this.name = "EmailSandboxError";
  }
}

/** True when `to` may receive mail right now. Transcript/dev mode (no real
 *  Resend API key, NODE_ENV=test) is never blocked so the e2e suite and local
 *  development can keep reading the in-memory transcript. Only an actually
 *  configured Resend sandbox (unverified @resend.dev sender) enforces the
 *  owner-only rule. */
export function resendSandboxRecipientAllowed(to: string): boolean {
  if (!config.resendSandbox) return true;
  if (!config.resendApiKey || process.env.NODE_ENV === "test") return true;
  return to.trim().toLowerCase() === config.resendSandboxTo.trim().toLowerCase();
}

/** Fire-and-forget Telegram ping to the admin chat when a real Resend send
 *  hard-fails or bounces. Never allowed to break the request that produced the
 *  email. */
function notifyDeliveryFailure(to: string, type: EmailType, error: string): void {
  void sendAdminNotification(`❌ Email yuborilmadi (${type})\nKimga: ${to}\nXato: ${error.slice(0, 300)}`).catch((err) => {
    logger.warn({ err }, "telegram delivery-failure notification failed");
  });
}

/** Rejects when `promise` does not settle within `ms`. `message` is thrown as-is
 *  so routes can surface a user-facing reason ("Resend API javob bermadi
 *  (Timeout)") before the client's loading state gets stuck. */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

let resendClient: Resend | null = null;

/** Singleton Resend client. Returns null in test mode or when RESEND_API_KEY is
 *  unset, so those environments fall back to the in-memory transcript. */
function getResend(): Resend | null {
  if (config.resendApiKey && process.env.NODE_ENV !== "test") {
    if (!resendClient) resendClient = new Resend(config.resendApiKey);
    return resendClient;
  }
  return null;
}

/** Active email provider: SMTP when configured, otherwise Resend when a key is
 *  present, otherwise the offline in-memory transcript. Test mode never wires a
 *  real transport so the e2e suite keeps reading the transcript. */
export function emailMode(): "smtp" | "resend" | "offline" {
  if (config.smtpConfigured && process.env.NODE_ENV !== "test") return "smtp";
  if (config.resendApiKey && process.env.NODE_ENV !== "test") return "resend";
  return "offline";
}

let smtpTransporter: Transporter | null = null;

/** Singleton nodemailer SMTP transport. Lazily built only when SMTP_* env vars
 *  are configured (never in test mode). */
function getSmtp(): Transporter | null {
  if (!config.smtpConfigured || process.env.NODE_ENV === "test") return null;
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }
  return smtpTransporter;
}

/** Best-effort persistence of an EmailLog row; failures here must never break
 *  the request that produced the mail. */
async function recordLog(entry: {
  type: EmailType;
  to: string;
  subject: string;
  status: EmailStatus;
  messageId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    await prisma.emailLog.create({
      data: {
        type: entry.type,
        to: entry.to,
        subject: entry.subject,
        status: entry.status,
        messageId: entry.messageId ?? null,
        error: entry.error ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, to: entry.to }, "failed to persist email log row");
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Outcome of a Resend dispatch. Carries the provider's error message so the
 *  calling route can answer a human-readable 400 instead of a blind 500. */
export interface EmailSendResult {
  ok: boolean;
  messageId?: string | null;
  error?: string | null;
}

/**
 * Sends a transactional email through the active provider (SMTP > Resend) and
 * records the outcome in EmailLog so the Super Admin dashboard can show
 * delivery history. Never throws: delivery problems are logged and reported as
 * `ok:false` so routes can answer a 400 instead of hanging. The full provider
 * response (or error object) is printed to the console so a failed delivery is
 * always diagnosable at a glance. Without any configured provider the mail is
 * only kept in the in-memory transcript (dev/test mode).
 */
export async function sendEmail(input: SendEmailInput, type: EmailType = EmailType.ANNOUNCEMENT): Promise<EmailSendResult> {
  const record: EmailRecord = { ...input, at: new Date().toISOString(), type };
  const mode = emailMode();
  if (mode === "offline") {
    // No provider configured: log + keep a transcript for tests/dev.
    emailTranscript.push(record);
    const link = input.text.match(/https?:\/\/\S+/)?.[0];
    logger.info({ to: input.to, subject: input.subject, link }, "email (not sent: email provider not configured)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SUCCESS });
    return { ok: true, messageId: null, error: null };
  }
  if (mode === "smtp") return sendViaSmtp(input, type);

  // Resend path.
  const client = getResend();
  if (!client) {
    // Defensive: emailMode() said resend but the singleton refused (test mode).
    emailTranscript.push(record);
    const link = input.text.match(/https?:\/\/\S+/)?.[0];
    logger.info({ to: input.to, subject: input.subject, link }, "email (not sent: resend client unavailable)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SUCCESS });
    return { ok: true, messageId: null, error: null };
  }
  if (!resendSandboxRecipientAllowed(input.to)) {
    // Resend sandbox (unverified @resend.dev sender) rejects every recipient
    // except the account owner. Record it as a FAILED delivery so the dashboard
    // shows exactly why the mail never left, and hand the route a 400 reason.
    const message = "Test rejimida faqat administrator emailiga xat yuboriladi";
    console.error("❌ RESEND SANDBOX RESTRICTION:", {
      to: input.to,
      allowed: config.resendSandboxTo,
      from: config.sendFrom,
    });
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: message });
    notifyDeliveryFailure(input.to, type, message);
    return { ok: false, error: message };
  }
  try {
    const result = await withTimeout(
      client.emails.send({
        from: config.sendFrom,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      EMAIL_SEND_TIMEOUT_MS,
      "Resend API javob bermadi (Timeout)",
    );
    if (result.error) {
      const message = result.error.message ?? "Resend xatosi";
      // Full provider response first, so a copy-paste into a bug report shows
      // the status code, name and message exactly as Resend sent it.
      console.error("❌ RESEND DELIVERY ERROR:", result.error);
      // Detailed, structure-first log: one glance at the console must reveal
      // the provider status code, error name, exactly what we tried and who
      // the failed recipient was.
      console.error("❌ RESEND API ERROR:", {
        statusCode: result.error.statusCode ?? null,
        name: result.error.name ?? null,
        message,
        to: input.to,
        from: config.sendFrom,
        subject: input.subject,
        type,
      });
      logger.error({ err: result.error, to: input.to, subject: input.subject, type }, "failed to send email (resend api)");
      await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: message.slice(0, 500) });
      notifyDeliveryFailure(input.to, type, message);
      return { ok: false, error: message };
    }
    const messageId = result.data?.id ?? null;
    console.log("✅ EMAIL DELIVERED SUCCESSFULLY:", result.data);
    logger.info({ to: input.to, subject: input.subject, messageId }, "email sent (resend api)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SENT, messageId });
    return { ok: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ RESEND EMAIL ERROR:", err);
    console.error("❌ RESEND DELIVERY ERROR:", {
      error: message,
      to: input.to,
      from: config.sendFrom,
      subject: input.subject,
      type,
    });
    logger.error({ err, to: input.to, subject: input.subject }, "failed to send email (resend api)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: message.slice(0, 500) });
    notifyDeliveryFailure(input.to, type, message);
    return { ok: false, error: message };
  }
}

/** Dispatches through the nodemailer SMTP transport (8s hard cap) and logs the
 *  outcome exactly like the Resend path so the dashboard stays consistent. */
async function sendViaSmtp(input: SendEmailInput, type: EmailType): Promise<EmailSendResult> {
  const transport = getSmtp();
  if (!transport) {
    // Smtp mode is on but the singleton refused to build (should not happen).
    logger.warn({ to: input.to, subject: input.subject }, "email (not sent: smtp transport unavailable)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: "SMTP transport unavailable" });
    return { ok: false, error: "SMTP transport unavailable" };
  }
  try {
    const info = await withTimeout(
      transport.sendMail({
        from: config.sendFrom,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      EMAIL_SEND_TIMEOUT_MS,
      "SMTP server javob bermadi (Timeout)",
    );
    const messageId = info.messageId ?? null;
    console.log("✅ EMAIL DELIVERED SUCCESSFULLY (SMTP):", { messageId, to: input.to, subject: input.subject });
    logger.info({ to: input.to, subject: input.subject, messageId }, "email sent (smtp)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SENT, messageId });
    return { ok: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ SMTP EMAIL ERROR:", err);
    console.error("❌ SMTP DELIVERY ERROR:", {
      error: message,
      to: input.to,
      from: config.sendFrom,
      subject: input.subject,
      type,
    });
    logger.error({ err, to: input.to, subject: input.subject }, "failed to send email (smtp)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: message.slice(0, 500) });
    notifyDeliveryFailure(input.to, type, message);
    return { ok: false, error: message };
  }
}

/** Startup self-test: verifies the SMTP transport (transporter.verify()) so a
 *  bad App Password or unreachable relay surfaces the moment the server boots,
 *  not on the first user's send-otp click. Returns true when the transport is
 *  ready (or deliberately skipped in transcript/test mode). */
export async function verifySmtpAtStartup(): Promise<boolean> {
  const transport = getSmtp();
  if (!transport) {
    console.log("SMTP transport faol emas — Resend / offline transcript rejimi (SMTP_HOST sozlanmagan)");
    return false;
  }
  try {
    await withTimeout(transport.verify(), EMAIL_SEND_TIMEOUT_MS, "SMTP server javob bermadi (Timeout)");
    console.log(`✅ SMTP tayyor! (${config.smtpHost}:${config.smtpPort})`);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ SMTP Ulanishda XATOLIK:", message);
    return false;
  }
}

/** Startup self-test: probes the Resend API with the configured key so a wrong
 *  key or unreachable endpoint surfaces the moment the Express server boots,
 *  not on the first user's send-otp click. Returns true when the API is ready
 *  (or deliberately skipped in transcript/test mode). */
export async function verifyResendAtStartup(): Promise<boolean> {
  const client = getResend();
  if (!client) {
    console.log("Resend API faol emas — offline transcript rejimi (RESEND_API_KEY sozlanmagan yoki test rejimida)");
    return false;
  }
  try {
    // Lightweight auth probe: listing domains validates the key without burning
    // one of the free-tier sends. Bounded by EMAIL_SEND_TIMEOUT_MS. A
    // send-only/restricted key lacks management scopes but can still deliver —
    // report it as ready instead of a scary 401.
    const probe = await withTimeout(client.domains.list(), EMAIL_SEND_TIMEOUT_MS, "Resend API javob bermadi (Timeout)");
    if (probe.error) {
      if (probe.error.name === "restricted_api_key") {
        console.log("✅ Resend API tayyor! (kalit send-only — domains boshqaruvi cheklangan)");
        return true;
      }
      throw new Error(probe.error.message ?? "Resend API xatosi");
    }
    console.log("✅ Resend API tayyor!");
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ Resend Ulanishda XATOLIK:", message);
    return false;
  }
}

/** Delivery result for the Super Admin dashboard test card. */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; messageId?: string | null; error?: string | null }> {
  const subject = "yerlikoglon.uz — email xizmati sinov xati";
  const text = [
    "yerlikoglon.uz — email xizmati sinov xati",
    "",
    "Agar bu xatni olgan bo'lsangiz, email xizmati to'g'ri ishlayapti.",
    "",
    "— yerlikoglon.uz tizimi",
  ].join("\n");
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">yerlikoglon.uz</h2>
    <p style="color:#16a34a;font-weight:bold">Email xizmati ishlayapti!</p>
    <p style="color:#334155;line-height:1.6">Bu email super admin "Pochta boshqaruvi" panelidan yuborilgan sinov xati.</p>
  </div>`;

  const sent = await sendEmail({ to, subject, text, html }, EmailType.TEST);
  if (sent.ok) return { ok: true, messageId: sent.messageId ?? null };
  return { ok: false, error: sent.error ?? "Noma'lum xatolik" };
}

function verificationUrl(token: string): string {
  return `${config.appUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}

/** Rendered content of the registration/verification email (link + OTP). Also
 *  used by the dashboard template preview with sample data. */
export function buildVerificationEmail(token: string, code?: string): { subject: string; text: string; html: string } {
  const link = verificationUrl(token);
  const otpMinutes = config.emailOtpMinutes;
  const codeBlock = code ? ["", `Yoki email kodini quyida kiriting (muddat: ${otpMinutes} daqiqa):`, code] : [];
  const text = [
    "yerlikoglon.uz saytiga xush kelibsiz!",
    "",
    "Email manzilingizni tasdiqlash uchun quyidagi havolani oching:",
    link,
    ...codeBlock,
    "",
    "Agar siz ro'yxatdan o'tmagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.",
  ].join("\n");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">yerlikoglon.uz</h2>
    <p style="color:#334155;line-height:1.6">Email manzilingizni tasdiqlash uchun quyidagi tugmani bosing:</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Emailni tasdiqlash</a>
    </p>
    ${code ? `
    <p style="color:#334155;line-height:1.6">Yoki ushbu 6 xonali kodni saytda kiriting (muddat: ${otpMinutes} daqiqa):</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#0f172a;background:#f1f5f9;padding:12px 16px;border-radius:10px;text-align:center;margin:16px 0">${escapeHtml(code)}</p>` : ""}
    <p style="font-size:13px;color:#94a3b8">Agar tugma ishlamasa, ushbu havolani oching: ${link}</p>
  </div>`;

  return { subject: "yerlikoglon.uz — emailni tasdiqlang", text, html };
}

export function sendVerificationEmail(to: string, token: string, code?: string): Promise<EmailSendResult> {
  const { subject, text, html } = buildVerificationEmail(token, code);
  return sendEmail({ to, subject, text, html }, EmailType.VERIFICATION);
}

function resetPasswordUrl(token: string): string {
  return `${config.appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Rendered content of the password reset email (also used for previews). The
 *  mail leads with the 6-digit OTP code and carries a fallback link so either
 *  method can be redeemed at /reset-password. */
export function buildPasswordResetEmail(token: string, code?: string): { subject: string; text: string; html: string } {
  const link = resetPasswordUrl(token);
  const text = [
    "yerlikoglon.uz — parolni tiklash",
    "",
    `Parolni tiklash uchun tasdiqlash kodi: ${code ?? ""}`.trim(),
    "",
    "Ushbu kod 15 daqiqa davomida amal qiladi. Agar buni siz so'ramagan bo'lsangiz, xabarga e'tibor bermang.",
    "",
    "Yoki quyidagi havola orqali ham tiklash mumkin:",
    link,
  ].join("\n");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">yerlikoglon.uz</h2>
    <h3 style="color:#0f172a">Parolni tiklash uchun tasdiqlash kodi: <strong style="color:#2563eb;letter-spacing:4px">${escapeHtml(code ?? "")}</strong></h3>
    <p style="color:#334155;line-height:1.6">Ushbu kod 15 daqiqa davomida amal qiladi. Agar buni siz so'ramagan bo'lsangiz, xabarga e'tibor bermang.</p>
    <p style="font-size:13px;color:#94a3b8">Yoki quyidagi havola orqali ham tiklash mumkin:</p>
    <p style="margin:16px 0">
      <a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Parolni tiklash</a>
    </p>
    <p style="font-size:13px;color:#94a3b8">Bu havola vaqtinchalik bo'lib, bir marta ishlatiladi. Agar siz parol tiklashni so'ramagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.</p>
  </div>`;

  return { subject: "yerlikoglon.uz — Parolni tiklash kodi", text, html };
}

export function sendPasswordResetEmail(to: string, token: string, code?: string): Promise<EmailSendResult> {
  const { subject, text, html } = buildPasswordResetEmail(token, code);
  return sendEmail({ to, subject, text, html }, EmailType.PASSWORD_RESET);
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Tells the author whether their submitted quote was approved or rejected. */
export function sendQuoteModerationEmail(
  to: string,
  info: { decision: "approved" | "rejected"; reason?: string; text: string; displayAuthor: string }
): Promise<EmailSendResult> {
  const approved = info.decision === "approved";
  const subject = approved ? "Iqtibosim — iqtibosingiz tasdiqlandi ✅" : "Iqtibosim — iqtibosingiz rad etildi";
  const text = [
    approved
      ? "Iqtibosingiz tasdiqlandi! Endi u saytda hammaga ko'rinadi."
      : `Iqtibosingiz rad etildi.` + (info.reason ? ` Sabab: ${info.reason}` : ""),
    "",
    `“${info.text}”`,
    "",
    `— ${info.displayAuthor}`,
    "",
    `yerlikoglon.uz sahifasida ko'ring: ${config.appUrl.replace(/\/$/, "")}`,
  ].join("\n");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">Iqtibosim</h2>
    <p style="color:#334155;line-height:1.6">
      ${approved ? "<strong style='color:#16a34a'>Iqtibosingiz tasdiqlandi!</strong> Endi u saytda hammaga ko'rinadi."
        : `<strong style='color:#dc2626'>Iqtibosingiz rad etildi.</strong>` + (info.reason ? ` Sabab: ${escapeHtml(info.reason)}` : "")}
    </p>
    <blockquote style="border-left:3px solid #2563eb;padding:8px 16px;margin:20px 0;color:#334155;background:#f8fafc;border-radius:0 6px 6px 0">
      “${escapeHtml(info.text)}”
    </blockquote>
    <p style="color:#64748b">— ${escapeHtml(info.displayAuthor)}</p>
    <p style="margin-top:20px">
      <a href="${config.appUrl.replace(/\/$/, "")}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Saytga o'tish</a>
    </p>
  </div>`;

  return sendEmail({ to, subject, text, html }, EmailType.QUOTE_MODERATION);
}

/** Rendered content of the "account approved" mail (also used for previews).
 *  Sent the moment a SUPER_ADMIN grants iqtibos-posting rights (isSuperApproved). */
export function buildUserApprovedEmail(displayName: string): { subject: string; text: string; html: string } {
  const name = displayName.trim().split(/\s+/)[0] || "foydalanuvchi";
  const subject = "Akkountingiz muvaffaqiyatli tasdiqlandi! 🎉";
  const text = [
    `Salom, ${name}!`,
    "",
    "Xush kelibsiz! Sizning akkountingiz Super Admin tomonidan tasdiqlandi. Endi platformada iqtiboslar joylashingiz va barcha imkoniyatlardan foydalanishingiz mumkin.",
    "",
    `Saytga kirish: ${config.appUrl.replace(/\/$/, "")}`,
  ].join("\n");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">yerlikoglon.uz</h2>
    <p style="font-size:36px;line-height:1;margin:8px 0">🎉</p>
    <h3 style="color:#16a34a;margin:0 0 8px">${escapeHtml(name)}, akkountingiz muvaffaqiyatli tasdiqlandi!</h3>
    <p style="color:#334155;line-height:1.6">Xush kelibsiz! Sizning akkountingiz Super Admin tomonidan tasdiqlandi. Endi platformada iqtiboslar joylashingiz va barcha imkoniyatlardan foydalanishingiz mumkin.</p>
    <p style="margin:24px 0">
      <a href="${config.appUrl.replace(/\/$/, "")}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Saytga o'tish</a>
    </p>
    <p style="font-size:13px;color:#94a3b8">Agar bu xabarni siz kutmagansiz, uni e'tiborsiz qoldirishingiz mumkin.</p>
  </div>`;

  return { subject, text, html };
}

/** Fire-and-forget approval notice so the moderation action never blocks on an
 *  email round-trip (sendEmail itself never throws). */
export function sendUserApprovedEmail(to: string, displayName?: string): Promise<EmailSendResult> {
  const { subject, text, html } = buildUserApprovedEmail(displayName ?? "");
  return sendEmail({ to, subject, text, html }, EmailType.USER_APPROVED);
}