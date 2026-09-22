-- AlterTable
ALTER TABLE "User" ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "premiumExpiresAt" TIMESTAMP(3),
ADD COLUMN "customWatermark" TEXT;