-- Granular RBAC permission flags for sub-admins (ADMIN role).
-- SUPER_ADMIN keeps unconditional access; the master ADMIN_PASSWORD key is
-- unrestricted too. Default TRUE preserves the access today's admins already
-- have — the SUPER_ADMIN then turns specific abilities off per sub-admin.
ALTER TABLE "User"
  ADD COLUMN "canViewUsers"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canManageUsers"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canManageQuotes"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canManageCategories" BOOLEAN NOT NULL DEFAULT true;