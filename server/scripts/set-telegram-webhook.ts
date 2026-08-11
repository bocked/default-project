import { config } from "../src/config.js";

/**
 * Registers the production webhook with Telegram.
 * Usage: npm run telegram:webhook
 * Requires TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_URL and TELEGRAM_WEBHOOK_SECRET
 * in server/.env (or the environment).
 */
async function main(): Promise<void> {
  if (!config.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  if (!config.telegramWebhookSecret) throw new Error("TELEGRAM_WEBHOOK_SECRET is not set");
  if (!config.telegramWebhookUrl) throw new Error("TELEGRAM_WEBHOOK_URL is not set");

  const res = await fetch(`https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: config.telegramWebhookUrl,
      secret_token: config.telegramWebhookSecret,
      allowed_updates: ["callback_query", "message"],
      drop_pending_updates: false,
    }),
  });
  const json = (await res.json()) as { ok: boolean; description?: string };
  console.log(JSON.stringify(json));
  if (!json.ok) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
