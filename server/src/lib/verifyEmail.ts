import { prisma } from "./prisma.js";
import {
  generateEmailVerificationToken,
  hashEmailVerificationToken,
  emailVerificationExpiry,
  generateEmailVerifyCode,
  hashEmailVerifyCode,
  emailVerifyCodeExpiry,
} from "./tokens.js";
import { sendVerificationEmail } from "./email.js";

/** Issues a fresh verification token + 6-digit OTP and persists both digests.
 *  Returns the plaintext OTP the way it was minted so the Super Admin can hand
 *  it to a user manually (see /api/admin/emails/otp/:userId/code) without
 *  depending on a second email delivery. */
export async function createEmailVerificationCode(email: string): Promise<{ token: string; code: string }> {
  const token = generateEmailVerificationToken();
  const code = generateEmailVerifyCode();
  await prisma.user.update({
    where: { email },
    data: {
      emailVerificationToken: hashEmailVerificationToken(token),
      emailVerificationExpiresAt: emailVerificationExpiry(),
      emailVerifyCodeHash: hashEmailVerifyCode(code),
      emailVerifyCodeExpiresAt: emailVerifyCodeExpiry(),
    },
  });
  return { token, code };
}

/** Issues a fresh verification token + 6-digit OTP, persists both digests,
 *  emails them together. Either one can be redeemed at /verify-email. Reused
 *  by the auth routes and the Super Admin OTP resend endpoint.
 *  Returns whether the email was actually dispatched so callers can answer
 *  "sent" vs a hard 500 without hanging on a dead SMTP connection. */
export async function issueEmailVerification(email: string): Promise<boolean> {
  const { token, code } = await createEmailVerificationCode(email);
  return sendVerificationEmail(email, token, code);
}