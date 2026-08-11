-- Add the UserRole enum and the role column on User
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- Password reset token (hashed digest stored, single use, time-limited)
ALTER TABLE "User" ADD COLUMN "resetPasswordToken" TEXT;
ALTER TABLE "User" ADD COLUMN "resetPasswordExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_resetPasswordToken_key" ON "User"("resetPasswordToken");

-- Optional Telegram post embed link on quotes
ALTER TABLE "Quote" ADD COLUMN "telegramUrl" TEXT;
