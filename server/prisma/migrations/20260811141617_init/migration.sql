-- CreateTable
CREATE TABLE "BannedIp" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedIp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BannedIp_ipAddress_key" ON "BannedIp"("ipAddress");

-- CreateIndex
CREATE INDEX "BannedIp_createdAt_idx" ON "BannedIp"("createdAt");
