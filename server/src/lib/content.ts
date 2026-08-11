import { prisma } from "./prisma.js";

/** Editable site content blocks (Content Manager). */
export const DEFAULT_CONTENT: Array<{ key: string; title: string; value: string }> = [
  {
    key: "site.title",
    title: "Sayt sarlavhasi",
    value: "Iqtibosim — iqtiboslar to'plami",
  },
  {
    key: "hero.title",
    title: "Bosh sahifa sarlavhasi",
    value: "Iqtibosim",
  },
  {
    key: "hero.subtitle",
    title: "Bosh sahifa matni",
    value: "Dono fikrlarni o'qing va o'zingiznikini qo'shing. Har bir iqtibos moderatsiyadan o'tadi.",
  },
  {
    key: "footer.about",
    title: "Sayt tagi matni",
    value: "Iqtibosim — fikrlarni to'playdigan joy",
  },
];

/** Seeding is best-effort and idempotent (keyed on the unique `key`). */
export async function tryEnsureDefaultContent(): Promise<void> {
  try {
    for (const block of DEFAULT_CONTENT) {
      await prisma.contentBlock.upsert({
        where: { key: block.key },
        update: {},
        create: block,
      });
    }
  } catch {
    /* non-fatal */
  }
}

export async function listContent(): Promise<Array<{ key: string; title: string; value: string; updatedAt: Date }>> {
  return prisma.contentBlock.findMany({ orderBy: { key: "asc" } });
}

export async function getContent(key: string) {
  return prisma.contentBlock.findUnique({ where: { key } });
}
