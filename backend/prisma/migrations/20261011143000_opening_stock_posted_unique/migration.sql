-- Posted opening-stock imports are unique per tenant and source hash.
-- Dry-run rows (dryRun = true) are excluded so a preview cannot block a later post.
CREATE UNIQUE INDEX IF NOT EXISTS "ImportBatch_opening_stock_posted_uniq"
ON "ImportBatch" ("tenantId", "sourceHash")
WHERE "kind" = 'OPENING_STOCK' AND "dryRun" = false;
