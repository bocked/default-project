import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config.js";
import { logger } from "./logger.js";

export interface EmailRecord {
  to: string;
  subject: string;
  html: string;
  text: string;
  at: string;
}

/**
 * In-memory transcript of every email "sent" while SMTP is not configured
 * (local development and the E2E suite). Tests use this to read the raw
 * verification link instead of actually delivering mail.
 */
export const emailTranscript: EmailRecord[] = [];

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (config.smtpHost) {
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

async function sendViaBrevo(input: SendEmailInput): Promise<boolean> {
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
      logger.error({ status: res.status, body: await res.text(), to: input.to }, "failed to send email (brevo api)");
      return false;
    }
    const data = (await res.json()) as { messageId?: string };
    logger.info({ to: input.to, subject: input.subject, messageId: data.messageId }, "email sent (brevo api)");
    return true;
  } catch (err) {
    logger.error({ err, to: input.to }, "failed to send email (brevo api)");
    return false;
  }
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendEmail(input: SendEmailInput): Promise<boolean> {
  const record: EmailRecord = { ...input, at: new Date().toISOString() };
  if (config.brevoApiKey) {
    return sendViaBrevo(input);
  }
  const transport = getTransporter();
  if (!transport) {
    // No SMTP configured: log + keep a transcript for tests/dev.
    emailTranscript.push(record);
    const link = input.text.match(/https?:\/\/\S+/)?.[0];
    logger.info({ to: input.to, subject: input.subject, link }, "email (not sent: SMTP not configured)");
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
    return true;
  } catch (err) {
    logger.error({ err, to: input.to }, "failed to send email");
    return false;
  }
}

function verificationUrl(token: string): string {
  return `${config.appUrl.replace(/\/$/, "")}/verify-email?token=${encodeURIComponent(token)}`;
}

export function sendVerificationEmail(to: string, token: string): Promise<boolean> {
  const link = verificationUrl(token);
  const text = [
    "Iqtibosimga xush kelibsiz!",
    "",
    "Email manzilingizni tasdiqlash uchun quyidagi havolani oching:",
    link,
    "",
    "Agar siz ro'yxatdan o'tmagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.",
  ].join("\n");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">Iqtibosim</h2>
    <p style="color:#334155;line-height:1.6">Email manzilingizni tasdiqlash uchun quyidagi tugmani bosing:</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Emailni tasdiqlash</a>
    </p>
    <p style="font-size:13px;color:#94a3b8">Agar tugma ishlamasa, ushbu havolani oching: ${link}</p>
  </div>`;

  return sendEmail({ to, subject: "Iqtibosim — emailni tasdiqlang", text, html });
}

function resetPasswordUrl(token: string): string {
  return `${config.appUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export function sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
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

  return sendEmail({ to, subject: "Iqtibosim — parolni tiklash", text, html });
}
