-- Align durable-wait persistence with the Human Approval node.
-- The node emits waitType='approval'; the previous CHECK rejected every such run.
ALTER TABLE executions
  DROP CONSTRAINT IF EXISTS executions_wait_type_check;

ALTER TABLE executions
  ADD CONSTRAINT executions_wait_type_check
  CHECK (wait_type IN ('time', 'webhook', 'form', 'approval'));

-- Workspace-scoped memory queries are on interactive API and node-execution paths.
CREATE INDEX IF NOT EXISTS idx_memory_interactions_workspace_created
  ON memory_interactions(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_interactions_workspace_session_created
  ON memory_interactions(workspace_id, session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_summaries_workspace_updated
  ON session_summaries(workspace_id, updated_at DESC);

-- Dataset deletion cascades to cases, but eval_runs previously blocked the parent
-- delete before that cascade could complete. Preserve run history by making the
-- lookup/delete path efficient; FK deletion semantics require a product decision.
CREATE INDEX IF NOT EXISTS idx_eval_runs_dataset
  ON eval_runs(dataset_id);

CREATE INDEX IF NOT EXISTS idx_eval_results_case
  ON eval_results(eval_case_id);
