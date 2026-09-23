-- Add a hashed 6-digit password-reset OTP and rename the expiry to resetTokenExpiry
ALTER TABLE "User" ADD COLUMN "resetPasswordCodeHash" TEXT;
ALTER TABLE "User" RENAME COLUMN "resetPasswordExpiresAt" TO "resetTokenExpiry";