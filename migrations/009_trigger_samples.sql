ALTER TABLE executions
  DROP CONSTRAINT IF EXISTS executions_trigger_type_check;

ALTER TABLE executions
  ADD CONSTRAINT executions_trigger_type_check
  CHECK (trigger_type IN ('webhook','manual','schedule','subworkflow','form','chat'));

CREATE TABLE IF NOT EXISTS trigger_samples (
  workflow_id   UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  node_id       TEXT NOT NULL,
  trigger_type  TEXT NOT NULL CHECK (trigger_type IN ('webhook','form','chat')),
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workflow_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_trigger_samples_workspace
  ON trigger_samples(workspace_id, received_at DESC);
