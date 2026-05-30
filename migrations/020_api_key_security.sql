-- Add security columns to api_keys
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS expires_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scopes       TEXT[] NOT NULL DEFAULT ARRAY['*']::TEXT[],
  ADD COLUMN IF NOT EXISTS last_used_ip TEXT;

-- Fast prefix lookup: single-row result for active keys without a full table scan
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_prefix_active
  ON api_keys(key_prefix) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_api_keys_workspace_active
  ON api_keys(workspace_id) WHERE revoked_at IS NULL;

-- All keys created before the HMAC pepper was introduced cannot be re-verified.
-- They are soft-revoked here. Operators must issue new keys after this migration.
UPDATE api_keys SET revoked_at = NOW() WHERE revoked_at IS NULL;

-- Workflow archive (n8n parity) — soft-delete that keeps the row for audit trail
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workflows_archived
  ON workflows(archived_at) WHERE archived_at IS NOT NULL;
