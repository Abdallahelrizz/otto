-- Extend executions.status to include 'waiting'
ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_status_check;
ALTER TABLE executions
  ADD CONSTRAINT executions_status_check
  CHECK (status IN ('pending','running','success','error','cancelled','waiting'));

-- Extend node_executions.status to include 'waiting'
ALTER TABLE node_executions DROP CONSTRAINT IF EXISTS node_executions_status_check;
ALTER TABLE node_executions
  ADD CONSTRAINT node_executions_status_check
  CHECK (status IN ('pending','running','success','error','skipped','waiting'));

-- Add wait/resume columns to executions
ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS wait_node_id   TEXT,
  ADD COLUMN IF NOT EXISTS wait_type      TEXT
    CHECK (wait_type IN ('time','webhook','form')),
  ADD COLUMN IF NOT EXISTS wait_until     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resume_token   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS resume_payload JSONB,
  ADD COLUMN IF NOT EXISTS resumed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_executions_resume_token
  ON executions(resume_token) WHERE resume_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_executions_wait_until
  ON executions(wait_until) WHERE status = 'waiting' AND wait_type = 'time';

CREATE INDEX IF NOT EXISTS idx_executions_status_waiting
  ON executions(status) WHERE status = 'waiting';
