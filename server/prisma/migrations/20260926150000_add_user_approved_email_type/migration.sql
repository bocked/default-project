-- Tracks the "Akkountingiz muvaffaqiyatli tasdiqlandi! 🎉" mail sent to a user
-- the moment a SUPER_ADMIN (admin panel, @nimadur7_bot inbox, or verify command)
-- grants iqtibos-posting rights (isSuperApproved = true).
ALTER TYPE "EmailType" ADD VALUE 'USER_APPROVED';