ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'full'
    CHECK (mode IN ('full','single_node','to_node','from_node')),
  ADD COLUMN IF NOT EXISTS focus_node_id TEXT,
  ADD COLUMN IF NOT EXISTS pinned_data JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX IF NOT EXISTS idx_executions_mode ON executions(mode);
CREATE INDEX IF NOT EXISTS idx_executions_focus_node_id ON executions(focus_node_id);
