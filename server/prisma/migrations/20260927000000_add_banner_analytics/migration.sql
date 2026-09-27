-- CreateTable
CREATE TABLE "BannerAnalytics" (
    "slot" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannerAnalytics_pkey" PRIMARY KEY ("slot")
);