-- AlterTable: Telegram quick-login accounts have no email/password until
-- they complete a full registration.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telegramUsername" TEXT;
ALTER TABLE "User" ADD COLUMN     "telegramFirstName" TEXT;
ALTER TABLE "User" ADD COLUMN     "telegramLastName" TEXT;
ALTER TABLE "User" ADD COLUMN     "quickLogin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TelegramQuickSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "chatId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "error" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramQuickSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramQuickSession_tokenHash_key" ON "TelegramQuickSession"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramQuickSession_status_createdAt_idx" ON "TelegramQuickSession"("status", "createdAt");
