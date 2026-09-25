-- CreateTable
CREATE TABLE "TelegramSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "botToken" TEXT NOT NULL DEFAULT '',
    "superAdminChatId" TEXT NOT NULL DEFAULT '',
    "channelValue" TEXT NOT NULL DEFAULT '',
    "channelChatId" TEXT NOT NULL DEFAULT '',
    "notifyPolicy" BOOLEAN NOT NULL DEFAULT true,
    "notifyNewFeature" BOOLEAN NOT NULL DEFAULT true,
    "notifyHealth" BOOLEAN NOT NULL DEFAULT true,
    "notifyBackup" BOOLEAN NOT NULL DEFAULT true,
    "botStatus" TEXT NOT NULL DEFAULT 'disabled',
    "botUsername" TEXT,
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramSettings_pkey" PRIMARY KEY ("id")
);

-- Seed the single settings row so runtime helpers always find it.
INSERT INTO "TelegramSettings" ("id", "updatedAt", "createdAt")
VALUES ('main', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);