-- AlterTable
ALTER TABLE "TelegramSettings" ADD COLUMN     "approvalBotToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "approvalBotUsername" TEXT,
ADD COLUMN     "approvalBotStatus" TEXT NOT NULL DEFAULT 'disabled',
ADD COLUMN     "approvalBotLastError" TEXT,
ADD COLUMN     "approvalBotLastCheckedAt" TIMESTAMP(3);