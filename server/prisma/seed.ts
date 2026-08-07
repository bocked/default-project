import { PrismaClient } from "@prisma/client";
import { password } from "../src/lib/password.js";

const prisma = new PrismaClient();

async function seedAdmin(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const plain = process.env.ADMIN_PASSWORD;
  if (!username || !plain || plain === "change-me") return;
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return;
  const passwordHash = await password.hash(plain);
  await prisma.user.create({
    data: { username, passwordHash, role: "ADMIN", displayName: "Administrator", color: "#ef4444" },
  });
  console.info(`[seed] admin user "${username}" created`);
}

async function main(): Promise<void> {
  await seedAdmin();

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
