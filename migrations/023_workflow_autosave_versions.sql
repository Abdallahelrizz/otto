ALTER TABLE workflow_versions
  ADD COLUMN IF NOT EXISTS is_autosave BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_workflow_versions_latest
  ON workflow_versions(workflow_id, version_number DESC);
