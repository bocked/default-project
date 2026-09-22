-- AlterEnum
-- SUPER_ADMIN outranks ADMIN. Existing rows keep their current role.
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "isSuperApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "superApprovedAt" TIMESTAMP(3);