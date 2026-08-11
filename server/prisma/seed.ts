import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: "Motivatsiya", slug: "motivatsiya" },
  { name: "Hayot", slug: "hayot" },
  { name: "IT", slug: "it" },
  { name: "Falsafa", slug: "falsafa" },
  { name: "Muvaffaqiyat", slug: "muvaffaqiyat" },
  { name: "Do'stlik", slug: "dostlik" },
  { name: "Muhabbat", slug: "muhabbat" },
  { name: "Donolik", slug: "donolik" },
];

async function main(): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
