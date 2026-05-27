ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS parent_execution_id UUID REFERENCES executions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_executions_parent
  ON executions(parent_execution_id)
  WHERE parent_execution_id IS NOT NULL;
