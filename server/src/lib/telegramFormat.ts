export interface ChannelValueInput {
  channelChatId: string;
  channelValue: string;
}

/**
 * Masks a secret for any admin-facing response. The full value is never sent
 * back to the panel — only `tokenSet` plus a shortened hint.
 */
export function maskToken(token: string): string {
  const cleaned = token.trim();
  if (!cleaned) return "";
  if (cleaned.length <= 10) return `${cleaned.slice(0, 2)}***`;
  return `${cleaned.slice(0, 6)}…${cleaned.slice(-4)}`;
}

/**
 * Turns what the admin typed into a usable Telegram chat id for the channel,
 * or `null` when only an invite link was provided (numeric id must then be
 * captured from the webhook).
 *
 * Accepted forms: `-1001234567890`, `123456789`, `@my_channel`,
 * `https://t.me/my_channel`, `t.me/my_channel`.
 * Unresolvable: `https://t.me/+AbCdEfGh` (private invite link).
 */
export function parseChannelValue(value: string): string | null {
  const cleaned = value.trim();
  if (!cleaned) return null;

  if (/^[+-]?\d+$/.test(cleaned)) return cleaned;

  if (cleaned.startsWith("@")) {
    return /^@[A-Za-z0-9_]{3,}$/.test(cleaned) ? cleaned : null;
  }

  const username = cleaned.match(/t\.me\/([A-Za-z0-9_]{3,})$/);
  if (username) return `@${username[1]}`;

  return null;
}

/** Resolves the effective channel chat id using the captured id first. */
export function channelChatIdFor(value: ChannelValueInput): string | null {
  if (value.channelChatId) return value.channelChatId;
  return parseChannelValue(value.channelValue);
}

/** Small human-readable timestamp for the panel status card. */
export function formatLastChecked(date: Date | null | undefined): string {
  return date ? new Date(date).toISOString().slice(0, 19).replace("T", " ") : "—";
}