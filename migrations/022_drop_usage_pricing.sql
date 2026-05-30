-- Otto does not price model usage. The Usage page is token-only, so the
-- per-model price table and the dollar budget column from 021 are unused.
DROP TABLE IF EXISTS model_prices;
ALTER TABLE workspaces DROP COLUMN IF EXISTS monthly_budget_usd;
