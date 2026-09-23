-- Add email-verification OTP code support (the link token already exists).

ALTER TABLE "User" ADD COLUMN "emailVerifyCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifyCodeExpiresAt" TIMESTAMP(3);

CREATE INDEX "User_emailVerifyCodeHash_idx" ON "User"("emailVerifyCodeHash");