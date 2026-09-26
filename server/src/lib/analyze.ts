import { config } from "../config.js";
import { logger } from "./logger.js";

export type LanguageCode = "uz" | "ru" | "en";

export interface SpellingSuggestion {
  type: "spelling" | "repeated" | "whitespace" | "punctuation" | "alphabet" | "apostrophe";
  /** The offending word (when word-level) or the matched fragment. */
  word?: string;
  /** Replacement word for word-level suggestions. */
  suggestion?: string;
  reason: string;
}

export interface AnalyzeResult {
  /** Detected quote language (rule-based). */
  language: LanguageCode;
  /** Deterministic spelling/structure suggestions. */
  suggestions: SpellingSuggestion[];
  /** Suggested tag slugs (max 3), derived from a keyword -> category map. */
  tags: string[];
  /** Best-matching category, or null when nothing matched. */
  categorySlug: string | null;
  /** Whether an external AI assist was configured and used. */
  ai: boolean;
  /** Available flag — always true (the analyzer never depends on a key). */
  available: boolean;
}

const CYRILLIC = /[\u0400-\u04FF]/;

/** Apostrophe look-alikes that should collapse to the ASCII apostrophe. */
const APOSTROPHES = new RegExp(`[\u2018\u2019\u02BB\u02BC\u0060\u00B4\u2032]`, "g");

/** English stopwords — strong signal the text is English. */
const ENGLISH_WORDS = [
  "the", "is", "to", "and", "of", "you", "not", "for", "are", "with", "we",
  "they", "can", "will", "your", "that", "this", "have", "has", "but", "who",
];

/** Normalises text for keyword matching: lowercase + canon apostrophe. */
function normalizeMatch(text: string): string {
  return text.toLowerCase().replace(APOSTROPHES, "'");
}

/** Counts keyword hits in an apostrophe-normalised text. */
function countHits(text: string, words: string[]): number {
  return words.reduce((sum, word) => sum + (text.includes(word) ? 1 : 0), 0);
}

// Keyword -> category. Keys are the DEFAULT_CATEGORIES slugs, values are
// lowercase words that (in or out of context) suggest that category.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  motivatsiya: [
    "motivatsiya", "motivatsion", "motivatsiya", "omad", "harakat", "intilish",
    "orzu", "maqsad", "ishonch", "iymon", "g'alaba", "g'olib", "jasorat",
    "bardosh", "kurash", "chidam",
  ],
  muvaffaqiyat: [
    "muvaffaqiyat", "muvaffaqiyatli", "yutuq", "muvaffaqiyatsizlik", "natija",
    "biznes", "startap", "kotib", "lider",
  ],
  hayot: ["hayot", "hayotda", "hayotning", "yashash", "umr", "dunyo", "tiriklik", "ko'p"],
  it: [
    "dastur", "kod", "texnologiya", "internet", "kompyuter", "raqamli", "sun'iy",
    "algoritm", "robot", "dasturchi", "dasturlash", "ai",
  ],
  falsafa: ["falsafa", "inson", "haqiqat", "ma'no", "mohiyat", "tafakkur", "aql-idrok", "borliq"],
  dostlik: ["do'st", "do'stlik", "birodar", "hamkor", "sadoqat", "ulush"],
  muhabbat: ["muhabbat", "sevgi", "sevgini", "yurak", "sevgimsiz", "sevish", "oshiq"],
  donolik: [
    "donolik", "hikmat", "bilim", "ilm", "sabr", "o'qish", "kitob", "ta'lim",
    "aql", "dono", "fahm", "maktab",
  ],
};

const TAG_LIMIT = 3;

/**
 * Nearest LanguageCode for a quote text. Rule-based and fully deterministic:
 * any Cyrillic -> "ru"; otherwise the Latin text is scored against Uzbek and
 * English keyword lists, defaulting to Uzbek (the site language) on a tie.
 */
export function detectLanguage(text: string): LanguageCode {
  if (CYRILLIC.test(text)) return "ru";
  const normalized = normalizeMatch(text);
  const uzScore = Object.values(CATEGORY_KEYWORDS).reduce(
    (sum, words) => sum + countHits(normalized, words),
    0
  );
  const enScore = countHits(normalized, ENGLISH_WORDS);
  // A bare Latin quote with no marker words is most likely Uzbek on this site.
  if (uzScore > enScore) return "uz";
  if (enScore > uzScore) return "en";
  // The Uzbek modifier apostrophe (oʻ / gʻ) is a very strong Uzbek signal.
  if (/[oOgG][\u02BB\u02BC]/.test(text)) return "uz";
  return "uz";
}

/** High-confidence word-level corrections (missing apostrophes, common typos). */
const SPELLING_DICT: Record<string, string> = {
  boladi: "bo'ladi",
  boladiy: "bo'ladi",
  bolib: "bo'lib",
  bolsa: "bo'lsa",
  bolmaydi: "bo'lmaydi",
  kilib: "qilib",
  kiladi: "qiladi",
  kilaman: "qilaman",
  keralk: "kerak",
  unversitet: "universitet",
  "o''": "o'",
};

/**
 * Deterministic spelling + structure suggestions for an Uzbek quote text.
 * Word-level corrections come from a curated dictionary; the structure rules
 * (repeated word, double space, missing space after punctuation, mixed alphabets,
 * wrong apostrophe) apply to any text and keep the analyzer fully offline.
 */
export function suggestSpelling(text: string): SpellingSuggestion[] {
  const suggestions: SpellingSuggestion[] = [];

  if (/[\u0400-\u04FF]/.test(text) && /[a-zA-Z]/.test(text)) {
    suggestions.push({
      type: "alphabet",
      reason: "Matnda lotin va kirill belgilar aralashib ketgan",
    });
  }

  if (/o[`´\u2018\u2019\u02BC]/i.test(text) || /u[`´\u2018\u2019\u02BC]/i.test(text) || /g[`´\u2018\u2019\u02BC]/i.test(text)) {
    suggestions.push({
      type: "apostrophe",
      reason: "'oʻ/gʻ' tovushlari uchun to'g'ri apostrof (') ishlatilsin",
    });
  }

  const normalized = normalizeMatch(text);
  const seen = new Set<string>();
  for (const [wrong, right] of Object.entries(SPELLING_DICT)) {
    if (normalized.includes(` ${wrong} `) || normalized.startsWith(`${wrong} `) || normalized.endsWith(` ${wrong}`)) {
      if (seen.has(wrong)) continue;
      seen.add(wrong);
      suggestions.push({
        type: "spelling",
        word: wrong,
        suggestion: right,
        reason: `"${wrong}" → "${right}" deb yoziladi`,
      });
    }
  }

  const repeated = text.match(/\b([\p{L}]{2,})\s+\1\b/iu);
  if (repeated) {
    suggestions.push({
      type: "repeated",
      word: repeated[1],
      reason: `"${repeated[1]}" so'zi ikki marta takrorlangan`,
    });
  }

  if (/\s{2,}/.test(text)) {
    suggestions.push({ type: "whitespace", reason: "So'zlar orasida qo'sh oraliq bor" });
  }

  if (/[,.;:!?]\p{L}/u.test(text)) {
    suggestions.push({
      type: "punctuation",
      reason: "Tinish belgisidan keyin bo'sh joy qoldiring",
    });
  }

  return suggestions;
}

/** Best category slug + ordered tag slugs for a quote text (offline mode). */
export function suggestTags(text: string, language: LanguageCode): { tags: string[]; categorySlug: string | null } {
  const normalized = normalizeMatch(text);
  const scored = Object.entries(CATEGORY_KEYWORDS).map(([slug, words]) => ({
    slug,
    score: countHits(normalized, words),
  }));
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return { tags: [], categorySlug: null };
  const categorySlug = ranked[0].slug;
  const tags = ranked.slice(0, TAG_LIMIT).map((s) => s.slug);
  // Never suggest the "hayot" generic tag when a more specific tag exists.
  if (language === "uz" && tags.includes("hayot") && tags.length > 1) {
    const rest = tags.filter((t) => t !== "hayot");
    return { tags: rest.length > 0 ? rest : tags, categorySlug };
  }
  return { tags, categorySlug };
}

interface AiTagResponse {
  tags?: string[];
  categorySlug?: string | null;
}

/**
 * Optional AI assist: an OpenAI-compatible /chat/completions call that returns
 * JSON tag suggestions. Best-effort — any error (network, timeout, parse) falls
 * back to the offline result, so the endpoint never depends on AI availability.
 */
async function aiSuggest(text: string, language: LanguageCode): Promise<{ tags: string[]; categorySlug: string | null } | null> {
  if (!config.aiApiKey) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${config.aiBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.aiApiKey}`,
      },
      body: JSON.stringify({
        model: config.aiModel,
        temperature: 0,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content:
              "You analyze a quote text. Respond with a single JSON object: " +
              '{"tags":["..."],"categorySlug":"..."}. ' +
              "tags: 1-3 slugs from [motivatsiya, muvaffaqiyat, hayot, it, falsafa, dostlik, muhabbat, donolik]. " +
              "categorySlug: exactly one of those slugs or null.",
          },
          {
            role: "user",
            content: `Detected language: ${language}\nQuote text: ${text.slice(0, 1000)}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as AiTagResponse;
    const allowed = new Set(Object.keys(CATEGORY_KEYWORDS));
    const tags = Array.isArray(parsed.tags)
      ? [...new Set(parsed.tags.map((t) => String(t).trim().toLowerCase()))].filter((t) => allowed.has(t)).slice(0, TAG_LIMIT)
      : [];
    const categorySlug =
      typeof parsed.categorySlug === "string" && allowed.has(parsed.categorySlug.toLowerCase())
        ? parsed.categorySlug.toLowerCase()
        : null;
    if (tags.length === 0 && !categorySlug) return null;
    return { tags, categorySlug };
  } catch (err) {
    logger.warn({ err }, "AI tag suggestion failed, using offline analyzer");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Full offline-plus-AI analyze pipeline for a quote text. */
export async function analyzeQuoteText(text: string): Promise<AnalyzeResult> {
  const language = detectLanguage(text);
  const suggestions = suggestSpelling(text);
  const offline = suggestTags(text, language);
  const ai = await aiSuggest(text, language);
  const aiUsed = ai !== null;
  const tags = aiUsed && ai.tags.length > 0 ? ai.tags : offline.tags;
  const categorySlug = aiUsed && ai.categorySlug ? ai.categorySlug : offline.categorySlug;
  return { language, suggestions, tags, categorySlug, ai: aiUsed, available: true };
}

/** Synchronous, dependency-free variant for unit tests and quick previews. */
export function analyzeQuoteTextSync(text: string): Omit<AnalyzeResult, "ai"> & { ai: false } {
  const language = detectLanguage(text);
  const tags = suggestTags(text, language);
  return { language, suggestions: suggestSpelling(text), tags: tags.tags, categorySlug: tags.categorySlug, ai: false, available: true };
}