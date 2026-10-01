/**
 * Secret scrubbing for log output and error reporting.
 *
 * Bot tokens travel inside strings, not just fields: a Telegram API URL is
 * `https://api.telegram.org/bot<token>/getMe`, and Prisma embeds the invocation
 * arguments in its error message (so a failed upsert of the settings row prints
 * `botToken: "123456:AA..."`). Pino's `redact` only walks object paths, so it
 * cannot catch either case - both need the raw text scrubbed.
 *
 * This matters beyond the log file: `app.ts` forwards 500s to Sentry and pings
 * the admin Telegram chat, so an unscrubbed error exports the production bot
 * token to a third-party SaaS and to a chat transcript.
 */

/**
 * Telegram bot tokens are `<bot_id>:<secret>`, where the secret is a fixed
 * length of URL-safe base64. Both parts are required, which keeps this from
 * matching ordinary `key: value` text such as timestamps or host:port.
 */
const TELEGRAM_TOKEN = /\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/g;

/**
 * The same secret inside a Telegram API path, where it directly follows `bot`.
 * Redacted separately so the URL stays readable (`.../bot[redacted]/getMe`),
 * which is what actually helps someone debugging a 401.
 */
const TELEGRAM_TOKEN_IN_URL = /(\/bot)[^/\s"']+/g;

/** Query/form values for well-known secret parameter names. */
const NAMED_SECRET = /([?&](?:token|secret|api_?key|password|auth)=)[^&\s"']+/gi;

/** Replaces every recognised secret shape in a string with a fixed marker. */
export function scrubSecrets(input: string): string {
  return input
    .replace(TELEGRAM_TOKEN_IN_URL, "$1[redacted]")
    .replace(TELEGRAM_TOKEN, "[redacted]")
    .replace(NAMED_SECRET, "$1[redacted]");
}

/**
 * Returns a log-safe copy of an error with its message and stack scrubbed.
 *
 * Everything else on the error is preserved because those fields are what make
 * an error actionable (Prisma's `code`, for instance) and are not secrets.
 * Non-Error throwables are stringified and scrubbed so an unexpected
 * `throw "https://api.telegram.org/bot..."` is covered too.
 */
export function scrubError(err: unknown): unknown {
  if (err instanceof Error) {
    // Prisma attaches a machine-readable `code` (e.g. P2002) that is worth
    // keeping; it has to be read through `unknown` because `Error` does not
    // declare it.
    const code = (err as unknown as { code?: unknown }).code;
    return {
      name: err.name,
      message: scrubSecrets(err.message),
      stack: err.stack ? scrubSecrets(err.stack) : err.stack,
      ...(typeof code === "string" ? { code } : {}),
    };
  }
  if (typeof err === "string") return scrubSecrets(err);
  return err;
}