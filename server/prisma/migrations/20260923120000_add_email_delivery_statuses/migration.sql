-- Extend EmailStatus so the delivery pipeline can record fine-grained states:
-- accepted ("SENT"), confirmed delivery ("DELIVERED") and hard failures/bounces
-- ("BOUNCED") reported by the Resend webhook, alongside the legacy SUCCESS and
-- FAILED values.
ALTER TYPE "EmailStatus" ADD VALUE 'SENT';
ALTER TYPE "EmailStatus" ADD VALUE 'DELIVERED';
ALTER TYPE "EmailStatus" ADD VALUE 'BOUNCED';