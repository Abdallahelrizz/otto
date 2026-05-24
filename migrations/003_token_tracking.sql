-- Migration 003: LLM token tracking + model name on node_executions

ALTER TABLE node_executions
  ADD COLUMN IF NOT EXISTS prompt_tokens     INTEGER,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS total_tokens      INTEGER,
  ADD COLUMN IF NOT EXISTS model             TEXT;
