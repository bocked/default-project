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
  {
    key: "quote.today",
    title: "Kun iqtibosi (ixtiyoriy)",
    value:
      "Bu yerga iqtibosning ID raqamini kiriting — o'sha iqtibos bosh sahifadagi «Kun iqtibosi» blokida doimiy ko'rsatiladi. Bo'sh qoldirilsa, sistem eng ko'p layk yig'gan iqtiboslardan avtomatik tanlaydi.",
  },
  {
    key: "banner.enabled",
    title: "Yon bannerlar (umumiy kalit)",
    value: "1",
  },
  {
    key: "banner.left.html",
    title: "Chap banner — HTML kodi (reklama)",
    value:
      "Chap yon paneldagi banner uchun to'liq HTML (masalan, AdSense yoki boshqa reklama kodi). To'ldirilsa, rasm va havola o'rnini bosadi. Bo'sh qoldirilsa pastdagi rasm/havola ishlaydi.",
  },
  {
    key: "banner.left.image",
    title: "Chap banner — rasm URL",
    value: "",
  },
  {
    key: "banner.left.href",
    title: "Chap banner — havola URL",
    value: "",
  },
  {
    key: "banner.left.alt",
    title: "Chap banner — ALT matni",
    value: "",
  },
  {
    key: "banner.right.html",
    title: "O'ng banner — HTML kodi (reklama)",
    value: "O'ng yon paneldagi banner uchun to'liq HTML (masalan, AdSense kodi).",
  },
  {
    key: "banner.right.image",
    title: "O'ng banner — rasm URL",
    value: "",
  },
  {
    key: "banner.right.href",
    title: "O'ng banner — havola URL",
    value: "",
  },
  {
    key: "banner.right.alt",
    title: "O'ng banner — ALT matni",
    value: "",
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
