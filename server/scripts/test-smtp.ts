import { config } from "../src/config.js";
import { verifySmtpAtStartup, sendTestEmail, emailMode } from "../src/lib/email.js";

/**
 * Verifies the SMTP transport (nodemailer verify()) and immediately delivers a
 * live test email to the first ADMIN_EMAILS / SUPER_ADMIN_EMAILS address.
 * Usage: npm run test:smtp
 * Requires SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS in server/.env (or env).
 */
async function main(): Promise<void> {
  if (emailMode() !== "smtp") {
    throw new Error("SMTP rejimi faol emas — SMTP_HOST/SMTP_PASS sozlang (hosiylik: " + emailMode() + ")");
  }

  const verified = await verifySmtpAtStartup();
  if (!verified) throw new Error("SMTP verify() muvaffaqiyatsiz — yuqoridagi log'larni tekshiring");

  const to = config.adminEmails[0] ?? config.superAdminEmails[0] ?? "mirabbostolqinjonov@gmail.com";
  console.log(`Sinov xati yuborilmoqda: ${to} (from: ${config.sendFrom})`);
  const sent = await sendTestEmail(to);
  console.log("Natija:", JSON.stringify(sent, null, 2));
  if (!sent.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});