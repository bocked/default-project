-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "adminEmail" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminLog_createdAt_idx" ON "AdminLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AdminLog_action_idx" ON "AdminLog"("action");

-- CreateIndex
CREATE INDEX "AdminLog_targetType_targetId_idx" ON "AdminLog"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBlock_key_key" ON "ContentBlock"("key");

-- CreateIndex
CREATE INDEX "ContentBlock_key_idx" ON "ContentBlock"("key");

-- CreateIndex
CREATE INDEX "Quote_deletedAt_status_idx" ON "Quote"("deletedAt", "status");

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt" DESC);
