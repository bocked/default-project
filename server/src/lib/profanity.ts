import leoProfanity from "leo-profanity";

// Additional words to block on top of leo-profanity's built-in list.
// Extend this array as needed (any language).
const EXTRA_WORDS: string[] = [];

leoProfanity.add(EXTRA_WORDS);

/**
 * Replaces profane/bad words in a string with asterisks.
 */
export function censorText(input: string): string {
  return leoProfanity.clean(input);
}

/**
 * Returns true when the text contains any banned word (regardless of casing).
 */
export function hasBannedWord(input: string): boolean {
  const lower = input.toLowerCase();
  if (EXTRA_WORDS.some((w) => lower.includes(w.toLowerCase()))) return true;
  return lower !== leoProfanity.clean(input).toLowerCase();
}
