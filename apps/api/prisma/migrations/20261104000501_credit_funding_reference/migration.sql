BEGIN;
-- A funding event can grant credits only once, even if a caller accidentally changes its idempotency key.
-- Existing duplicates fail migration for explicit reconciliation; no financial history is edited.
CREATE UNIQUE INDEX "CreditGrant_funding_event_once" ON "CreditGrant" ("workspaceId", source, reference)
 WHERE source IN ('SUBSCRIPTION', 'PURCHASE', 'PROMOTIONAL');
COMMIT;
