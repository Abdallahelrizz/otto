ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS key_prefix TEXT;

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace ON api_keys(workspace_id);
