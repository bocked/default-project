import { PrismaClient } from "@prisma/client";

// warn: duplicate-query-plan warnings; error: failed queries.
// (The `slow` log threshold needs Prisma >= 6.3; revisit on upgrade.)
export const prisma = new PrismaClient({
  log: ["warn", "error"],
});
