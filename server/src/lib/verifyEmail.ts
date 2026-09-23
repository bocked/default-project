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

/** Issues a fresh verification token + 6-digit OTP, persists both digests,
 *  emails them together. Either one can be redeemed at /verify-email. Reused
 *  by the auth routes and the Super Admin OTP resend endpoint. */
export async function issueEmailVerification(email: string): Promise<void> {
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
  await sendVerificationEmail(email, token, code);
}