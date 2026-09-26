-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('UZ', 'RU', 'EN');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "locale" "Locale" NOT NULL DEFAULT 'UZ',
ADD COLUMN     "translations" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" "Locale" NOT NULL DEFAULT 'UZ';

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionQuote" (
    "collectionId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionQuote_pkey" PRIMARY KEY ("collectionId","quoteId")
);

-- CreateIndex
CREATE INDEX "Collection_userId_createdAt_idx" ON "Collection"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Collection_isPrivate_idx" ON "Collection"("isPrivate");

-- CreateIndex
CREATE INDEX "CollectionQuote_quoteId_idx" ON "CollectionQuote"("quoteId");

-- CreateIndex
CREATE INDEX "Quote_status_locale_createdAt_idx" ON "Quote"("status", "locale", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionQuote" ADD CONSTRAINT "CollectionQuote_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionQuote" ADD CONSTRAINT "CollectionQuote_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;