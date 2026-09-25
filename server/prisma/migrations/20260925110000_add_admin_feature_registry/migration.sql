-- Dynamic feature/permission registry (AdminFeature + AdminGrant) plus the
-- policy Telegram reply fields on SitePolicy. The four legacy boolean flags
-- migrate into explicit AdminGrant rows only when they were FALSE (a missing
-- grant means "use the feature default", which is TRUE for these built-ins).

-- 1. AdminFeature registry
CREATE TABLE "AdminFeature" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'general',
    "defaultEnabled" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'builtin',
    "description" TEXT,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminFeature_pkey" PRIMARY KEY ("key")
);

-- 2. AdminGrant (per-admin override)
CREATE TABLE "AdminGrant" (
    "adminId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminGrant_pkey" PRIMARY KEY ("adminId","featureKey")
);

ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_featureKey_fkey" FOREIGN KEY ("featureKey") REFERENCES "AdminFeature"("key") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AdminGrant_featureKey_idx" ON "AdminGrant"("featureKey");

-- 3. Seed the built-in features (all default TRUE so existing admins keep access)
INSERT INTO "AdminFeature" ("key","label","group","defaultEnabled","source","description","registeredAt") VALUES
('canViewUsers', 'Foydalanuvchilarni ko''rish', 'Foydalanuvchilar', true, 'builtin', NULL, CURRENT_TIMESTAMP),
('canManageUsers', 'Foydalanuvchilarni boshqarish', 'Foydalanuvchilar', true, 'builtin', NULL, CURRENT_TIMESTAMP),
('canManageQuotes', 'Iqtiboslar moderatsiyasi', 'Kontent', true, 'builtin', NULL, CURRENT_TIMESTAMP),
('canManageCategories', 'Bo''lim va heshteglar', 'Kontent', true, 'builtin', NULL, CURRENT_TIMESTAMP),
('canManageQuizzes', 'Testlar boshqaruvi', 'Modullar', true, 'builtin', NULL, CURRENT_TIMESTAMP),
('canManageAnnouncements', 'E''lonlar', 'Modullar', true, 'builtin', NULL, CURRENT_TIMESTAMP),
('canManageFeedback', 'Fikr-mulohaza', 'Modullar', true, 'builtin', NULL, CURRENT_TIMESTAMP),
('canManageSettings', 'Sozlamalar', 'Modullar', true, 'builtin', NULL, CURRENT_TIMESTAMP),
('canViewAudit', 'Audit jurnali', 'Modullar', true, 'builtin', NULL, CURRENT_TIMESTAMP);

-- 4. Backfill: only explicit FALSE switches from the legacy columns become
--    AdminGrant rows (true = default, no row needed).
INSERT INTO "AdminGrant" ("adminId","featureKey","enabled","updatedAt")
SELECT "id", 'canViewUsers', false, CURRENT_TIMESTAMP FROM "User" WHERE "role" = 'ADMIN' AND "canViewUsers" = false;
INSERT INTO "AdminGrant" ("adminId","featureKey","enabled","updatedAt")
SELECT "id", 'canManageUsers', false, CURRENT_TIMESTAMP FROM "User" WHERE "role" = 'ADMIN' AND "canManageUsers" = false;
INSERT INTO "AdminGrant" ("adminId","featureKey","enabled","updatedAt")
SELECT "id", 'canManageQuotes', false, CURRENT_TIMESTAMP FROM "User" WHERE "role" = 'ADMIN' AND "canManageQuotes" = false;
INSERT INTO "AdminGrant" ("adminId","featureKey","enabled","updatedAt")
SELECT "id", 'canManageCategories', false, CURRENT_TIMESTAMP FROM "User" WHERE "role" = 'ADMIN' AND "canManageCategories" = false;

-- 5. Drop the legacy boolean columns
ALTER TABLE "User" DROP COLUMN "canViewUsers";
ALTER TABLE "User" DROP COLUMN "canManageUsers";
ALTER TABLE "User" DROP COLUMN "canManageQuotes";
ALTER TABLE "User" DROP COLUMN "canManageCategories";

-- 6. Policy Telegram reply fields (SUGGEST / REJECT flows)
ALTER TABLE "SitePolicy" ADD COLUMN "awaitingTelegramReply" TEXT;
ALTER TABLE "SitePolicy" ADD COLUMN "telegramMessageId" INTEGER;