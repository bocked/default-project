import { Resend } from "resend";
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

/**
 * Sends a transactional email through the Resend API (8s hard cap) and records
 * the outcome in EmailLog so the Super Admin dashboard can show delivery
 * history. Never throws: delivery problems are logged and reported as `false`
 * so routes can answer a 500 instead of hanging.
 */
export async function sendEmail(input: SendEmailInput, type: EmailType = EmailType.ANNOUNCEMENT): Promise<boolean> {
  const record: EmailRecord = { ...input, at: new Date().toISOString(), type };
  const client = getResend();
  if (!client) {
    // No API key configured: log + keep a transcript for tests/dev.
    emailTranscript.push(record);
    const link = input.text.match(/https?:\/\/\S+/)?.[0];
    logger.info({ to: input.to, subject: input.subject, link }, "email (not sent: Resend API not configured)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SUCCESS });
    return true;
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
    return false;
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
      return false;
    }
    const messageId = result.data?.id ?? null;
    logger.info({ to: input.to, subject: input.subject, messageId }, "email sent (resend api)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.SENT, messageId });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌ RESEND EMAIL ERROR:", {
      error: message,
      to: input.to,
      from: config.sendFrom,
      subject: input.subject,
      type,
    });
    logger.error({ err, to: input.to, subject: input.subject }, "failed to send email (resend api)");
    await recordLog({ type, to: input.to, subject: input.subject, status: EmailStatus.FAILED, error: message.slice(0, 500) });
    notifyDeliveryFailure(input.to, type, message);
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
  const subject = "yerlikoglon.uz — Resend sinov xati";
  const text = [
    "yerlikoglon.uz — Resend sinov xati",
    "",
    "Agar bu xatni olgan bo'lsangiz, email xizmati to'g'ri ishlayapti.",
    "",
    "— yerlikoglon.uz tizimi",
  ].join("\n");
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="color:#0f172a">yerlikoglon.uz</h2>
    <p style="color:#16a34a;font-weight:bold">Resend ishlayapti!</p>
    <p style="color:#334155;line-height:1.6">Bu email super admin "Pochta boshqaruvi" panelidan yuborilgan sinov xati.</p>
  </div>`;

  const sent = await sendEmail({ to, subject, text, html }, EmailType.TEST);
  const last = await prisma.emailLog.findFirst({
    where: { type: EmailType.TEST },
    orderBy: { createdAt: "desc" },
  });
  if (sent) return { ok: true, messageId: last?.messageId ?? null };
  return { ok: false, error: last?.error ?? "Noma'lum xatolik" };
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