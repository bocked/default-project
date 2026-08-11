import { prisma } from "./prisma.js";
import { logger } from "./logger.js";

export interface CategorySeed {
  name: string;
  slug: string;
}

export const DEFAULT_CATEGORIES: CategorySeed[] = [
  { name: "Motivatsiya", slug: "motivatsiya" },
  { name: "Hayot", slug: "hayot" },
  { name: "IT", slug: "it" },
  { name: "Falsafa", slug: "falsafa" },
  { name: "Muvaffaqiyat", slug: "muvaffaqiyat" },
  { name: "Do'stlik", slug: "dostlik" },
  { name: "Muhabbat", slug: "muhabbat" },
  { name: "Donolik", slug: "donolik" },
];

/** Lowercase, strip hashtag/whitespace/punctuation, collapse to a slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/['`']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Human-readable tag name derived from user input. */
export function normalizeTagName(input: string): string {
  return input.trim().replace(/^#+/, "").slice(0, 40);
}

/** Ensures the default categories exist (called at server startup + seed). */
export async function ensureDefaultCategories(): Promise<void> {
  for (const category of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
}

/** Best-effort at startup so a fresh production database works immediately. */
export async function tryEnsureDefaultCategories(): Promise<void> {
  try {
    await ensureDefaultCategories();
    logger.info("default categories ensured");
  } catch (err) {
    logger.warn({ err }, "failed to ensure default categories");
  }
}
