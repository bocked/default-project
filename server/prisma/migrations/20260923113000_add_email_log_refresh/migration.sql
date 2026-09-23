-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('VERIFICATION', 'PASSWORD_RESET', 'QUOTE_MODERATION', 'ANNOUNCEMENT', 'TEST');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "type" "EmailType" NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User" ADD COLUMN "refreshTokenHash" TEXT,
ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailLog_type_createdAt_idx" ON "EmailLog"("type", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailLog_to_createdAt_idx" ON "EmailLog"("to", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "User_refreshTokenHash_key" ON "User"("refreshTokenHash");