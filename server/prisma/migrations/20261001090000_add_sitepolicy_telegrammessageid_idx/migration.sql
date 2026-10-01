-- Index for the Telegram reply lookup on SitePolicy drafts.
--
-- Every message posted in the admin Telegram chat runs
--   SELECT ... FROM "SitePolicy" WHERE "telegramMessageId" = $1 AND "isApproved" = false
-- to find whether that message is a pending SUGGEST/REJECT reply. That lookup ran
-- as a sequential scan on every single admin-chat message because the column had
-- no index, unlike Quote.telegramMessageId which already has one. Draft rows are
-- few, but the scan cost grows with published policy history and the query is on
-- the hot path of the webhook.
CREATE INDEX IF NOT EXISTS "SitePolicy_telegramMessageId_idx" ON "SitePolicy" ("telegramMessageId");