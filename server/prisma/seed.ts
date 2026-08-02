import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const count = await prisma.canvasItem.count();
  if (count > 0) {
    console.info(`[seed] canvas already has ${count} items, skipping`);
    return;
  }

  await prisma.canvasItem.create({
    data: {
      type: "STICKY",
      content: "Salom! Bu boshqa foydalanuvchilar ko'rgan real-vaqtli katta kustav daftar. Yozing, rasm joylang va hokazo.",
      x: 200,
      y: 200,
      color: "#fef08a",
      ipAddress: "seed",
    },
  });
  await prisma.canvasItem.create({
    data: {
      type: "TEXT",
      content: "Chap tugma — harakatlantirish, g'ildirak — yaqinlashtirish, ikki marta bosish — yangi element.",
      x: 320,
      y: 380,
      color: "#334155",
      ipAddress: "seed",
    },
  });

  console.info("[seed] seeded welcome items");
}

main()
  .catch((err) => {
    console.error("[seed] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
