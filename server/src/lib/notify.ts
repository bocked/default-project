import { prisma } from "./prisma.js";
import { sendTelegramMessage } from "./telegram.js";
import { sendQuoteModerationEmail } from "./email.js";

export type ModerationDecision = "approved" | "rejected";

/**
 * Notifies the owner that their submission was moderated. Telegram is used
 * when the account is linked to one (fast, free, most likely to be read);
 * otherwise it falls back to email. Quick-login accounts without an email and
 * without an outgoing bot notification are simply skipped. Never throws — a
 * failed notification must not break the admin action that triggered it.
 */
export async function notifyQuoteModeration(input: {
  quoteId: string;
  decision: ModerationDecision;
  reason?: string;
}): Promise<void> {
  try {
    const quote = await prisma.quote.findUnique({
      where: { id: input.quoteId },
      select: { id: true, text: true, displayAuthor: true, userId: true },
    });
    if (!quote) return;

    const user = await prisma.user.findUnique({
      where: { id: quote.userId },
      select: { email: true, telegramId: true },
    });
    if (!user) return;

    if (user.telegramId) {
      const message =
        input.decision === "approved"
          ? `✅ Iqtibosingiz tasdiqlandi!\n\n“${quote.text}”\n\n— ${quote.displayAuthor}\nyerlikoglon.uz`
          : `❌ Iqtibosingiz rad etildi.\n\n“${quote.text}”\n\nSabab: ${input.reason ?? "Ko'rsatilmagan"}\nyerlikoglon.uz`;
      await sendTelegramMessage(user.telegramId, message);
      return;
    }

    if (user.email) {
      await sendQuoteModerationEmail(user.email, {
        decision: input.decision,
        reason: input.reason,
        text: quote.text,
        displayAuthor: quote.displayAuthor,
      });
    }
  } catch {
    /* notification must never break the admin action */
  }
}