-- Add execution_type column to track how an execution was triggered:
-- manual, production, test, sub_workflow, error_workflow, api, resume, scheduled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='executions' AND column_name='execution_type'
  ) THEN
    ALTER TABLE executions ADD COLUMN execution_type TEXT NOT NULL DEFAULT 'production';
  END IF;
END $$;

ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE executions
SET created_at = COALESCE(started_at, completed_at, NOW())
WHERE created_at IS NULL;

ALTER TABLE executions
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_executions_type ON executions(workspace_id, execution_type, created_at DESC);
