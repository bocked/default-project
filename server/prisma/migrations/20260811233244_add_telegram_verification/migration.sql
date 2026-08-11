-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telegramId" TEXT,
ADD COLUMN     "telegramVerifyChatId" TEXT,
ADD COLUMN     "telegramVerifyCode" TEXT,
ADD COLUMN     "telegramVerifyCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramVerifyExpiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramVerifyToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramVerifyToken_key" ON "User"("telegramVerifyToken");

