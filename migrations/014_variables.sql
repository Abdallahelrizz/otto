CREATE TABLE IF NOT EXISTS variables (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  value       TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT 'string',  -- string | number | boolean | json
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_variables_workspace ON variables(workspace_id);
