-- Usage / spend: per-model pricing + advisory monthly budget

CREATE TABLE IF NOT EXISTS model_prices (
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  model                 TEXT NOT NULL,
  prompt_usd_per_1m     NUMERIC(12,4) NOT NULL DEFAULT 0,
  completion_usd_per_1m NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, model)
);

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS monthly_budget_usd NUMERIC(12,2);
