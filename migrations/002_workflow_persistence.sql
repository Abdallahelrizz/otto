-- Migration 002: workspace_id on executions + perf indexes

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_executions_workspace
  ON executions(workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflows_workspace_updated
  ON workflows(workspace_id, updated_at DESC);
