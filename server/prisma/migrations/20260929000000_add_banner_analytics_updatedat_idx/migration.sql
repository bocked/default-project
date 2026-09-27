-- Index for freshness-ordered admin stats reads on BannerAnalytics (5-row
-- table, but keeps per-slot updatedAt lookups indexed as rows grow).
CREATE INDEX IF NOT EXISTS "BannerAnalytics_updatedAt_idx" ON "BannerAnalytics" ("updatedAt");