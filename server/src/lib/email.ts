import nodemailer, { type Transporter } from "nodemailer";
import { EmailStatus, EmailType } from "@prisma/client";
import { prisma } from "./prisma.js";
import { config } from "../config.js";
import { logger } from "./logger.js";

export interface EmailRecord {
  to: string;
  subject: string;
  html: string;
  text: string;
  at: string;
  type: EmailType;
}

/**
 * In-memory transcript of every email "sent" while SMTP is not configured or
 * during the E2E suite (NODE_ENV=test). Tests use this to read the raw
 * verification link/OTP instead of actually delivering mail.
 */
export const emailTranscript: EmailRecord[] = [];

let transporter: Transporter | null = null;

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

function getTransporter(): Transporter | null {
  if (config.smtpHost && process.env.NODE_ENV !== "test") {
    if (!transporter) {
      transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
      });
    }
    return transporter;
  }
  return null;
}

/** Parses `"Iqtibosim <noreply@yerlikoglon.uz>"` into {name, email}. */
function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: "", email: from.trim() };
}

async function sendViaBrevo(input: SendEmailInput, type: EmailType): Promise<boolean> {
  try {
    const sender = parseSender(config.smtpFrom);
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": config.brevoApiKey,
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender,
        to: [{ email: input.to }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body, to: input.to }, "failed to send email (brevo api)");
      await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: body.slice(0, 500) });
      return false;
    }
    const data = (await res.json()) as { messageId?: string };
    logger.info({ to: input.to, subject: input.subject, messageId: data.messageId }, "email sent (brevo api)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SUCCESS, messageId: data.messageId });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: input.to }, "failed to send email (brevo api)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: message.slice(0, 500) });
    return false;
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends a transactional email and records the outcome in EmailLog so the
 *  Super Admin dashboard can show delivery history. */
export async function sendEmail(input: SendEmailInput, type: EmailType = EmailType.ANNOUNCEMENT): Promise<boolean> {
  const record: EmailRecord = { ...input, at: new Date().toISOString(), type };
  if (config.brevoApiKey) {
    return sendViaBrevo(input, type);
  }
  const transport = getTransporter();
  if (!transport) {
    // No SMTP configured: log + keep a transcript for tests/dev.
    emailTranscript.push(record);
    const link = input.text.match(/https?:\/\/\S+/)?.[0];
    logger.info({ to: input.to, subject: input.subject, link }, "email (not sent: SMTP not configured)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SUCCESS });
    return true;
  }
  try {
    const info = await transport.sendMail({
      from: config.smtpFrom,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    logger.info({ to: input.to, subject: input.subject, messageId: info.messageId }, "email sent");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SUCCESS, messageId: info.messageId });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: input.to }, "failed to send email");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: message.slice(0, 500) });
    return false;
  }
}

/** SMTP connection self-test used by the Super Admin dashboard. Returns the
 *  raw delivery result so the UI can show either the messageId or the error. */
export async function sendTestEmail(to: string): Promise<{ ok: boolean; messageId?: string | null; error?: string | null }> {
  const subject = "yerlikoglon.uz — SMTP sinov xati";
  const text = [
    "yerlikoglon.uz — SMTP sinov xati",
    "",
    "Agar bu xatni olgan bo'lsangiz, email xizmati to'g'ri ishlayapti.",
    "",
    "— yerlikoglon.uz tizimi",
  ].join("\n");
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">yerlikoglon.uz</h2>
    <p style="color:#16a34a;font-weight:bold">SMTP ishlayapti!</p>
    <p style="color:#334155;line-height:1.6">Bu email super admin "Pochta boshqaruvi" panelidan yuborilgan sinov xati.</p>
  </div>`;

  const sent = await sendEmail({ to, subject, text, html }, EmailType.TEST);
  if (sent) {
    const last = await prisma.emailLog.findFirst({
      where: { type: EmailType.TEST },
      orderBy: { createdAt: "desc" },
    });
    return { ok: true, messageId: last?.messageId ?? null };
  }
  const last = await prisma.emailLog.findFirst({
    where: { type: EmailType.TEST },
    orderBy: { createdAt: "desc" },
  });
  return { ok: false, error: last?.error ?? "Noma'lum xatolik" };
}

function verificationUrl(token: string): string {
  return `${config.appUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}

/** Rendered content of the registration/verification email (link + OTP). Also
 *  used by the dashboard template preview with sample data. */
export function buildVerificationEmail(token: string, code?: string): { subject: string; text: string; html: string } {
  const link = verificationUrl(token);
  const codeBlock = code ? ["", "Yoki email kodini quyida kiriting (muddat: 15 daqiqa):", code] : [];
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
    <p style="color:#334155;line-height:1.6">Yoki ushbu 6 xonali kodni saytda kiriting (muddat: 15 daqiqa):</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#0f172a;background:#f1f5f9;padding:12px 16px;border-radius:10px;text-align:center;margin:16px 0">${escapeHtml(code)}</p>` : ""}
    <p style="font-size:13px;color:#94a3b8">Agar tugma ishlamasa, ushbu havolani oching: ${link}</p>
  </div>`;

  return { subject: "yerlikoglon.uz — emailni tasdiqlang", text, html };
}

export function sendVerificationEmail(to: string, token: string, code?: string): Promise<boolean> {
  const { subject, text, html } = buildVerificationEmail(token, code);
  return sendEmail({ to, subject, text, html }, EmailType.VERIFICATION);
}

function resetPasswordUrl(token: string): string {
  return `${config.appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Rendered content of the password reset email (also used for previews). */
export function buildPasswordResetEmail(token: string): { subject: string; text: string; html: string } {
  const link = resetPasswordUrl(token);
  const text = [
    "Iqtibosim — parolni tiklash",
    "",
    "Parolingizni tiklash uchun quyidagi havolani oching:",
    link,
    "",
    "Bu havola vaqtinchalik bo'lib, bir marta ishlatiladi. Agar siz parol tiklashni so'ramagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.",
  ].join("\n");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">Iqtibosim</h2>
    <p style="color:#334155;line-height:1.6">Parolingizni tiklash uchun quyidagi tugmani bosing:</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Parolni tiklash</a>
    </p>
    <p style="font-size:13px;color:#94a3b8">Bu havola vaqtinchalik bo'lib, bir marta ishlatiladi. Agar siz parol tiklashni so'ramagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.</p>
  </div>`;

  return { subject: "Iqtibosim — parolni tiklash", text, html };
}

export function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
  const { subject, text, html } = buildPasswordResetEmail(token);
  return sendEmail({ to, subject, text, html }, EmailType.PASSWORD_RESET);
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Tells the author whether their submitted quote was approved or rejected. */
export function sendQuoteModerationEmail(
  to: string,
  info: { decision: "approved" | "rejected"; reason?: string; text: string; displayAuthor: string }
): Promise<boolean> {
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