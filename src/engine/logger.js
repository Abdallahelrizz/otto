import { db } from '../db/client.js';
import { randomUUID } from 'crypto';

/**
 * Derive execution_type from how the run was triggered.
 *
 * This used to default to the literal 'production' and no caller ever overrode it,
 * so EVERY execution — canvas runs, sub-workflows, error handlers, eval cases — was
 * recorded as production. That is not cosmetic: the save policy
 * (`saveManualExecutions`), retention, redaction rules, and production-vs-manual
 * metrics all key off this column, and a canvas run showed a "Production" badge.
 *
 * Values intentionally match EXEC_TYPE_LABELS in
 * canvas/src/components/panels/ExecutionPanel.tsx.
 */
const EXECUTION_TYPE_BY_TRIGGER = {
  manual: 'manual',
  api: 'api',
  schedule: 'scheduled',
  scheduled: 'scheduled',
  sub_workflow: 'sub_workflow',
  error_workflow: 'error_workflow',
  resume: 'resume',
  test: 'test',
  webhook: 'production',
  // form / chat / anything unknown → 'production' via the fallback below.
};

export function executionTypeFor(triggerType) {
  return EXECUTION_TYPE_BY_TRIGGER[triggerType] ?? 'production';
}

export async function createExecution({
  workflowId,
  workspaceId,
  triggerType,
  // Derived from triggerType unless a caller is explicit.
  executionType = undefined,
  input,
  status = 'running',
  mode = 'full',
  focusNodeId = null,
  pinnedData = {},
  parentExecutionId = null,
  parentNodeId = null,
}) {
  const { rows } = await db.query(
    `INSERT INTO executions
       (workflow_id, workspace_id, status, started_at, trigger_type, execution_type, mode, focus_node_id, pinned_data, input, parent_execution_id, parent_node_id)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'running' THEN NOW() ELSE NULL END, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      workflowId,
      workspaceId,
      status,
      triggerType,
      executionType ?? executionTypeFor(triggerType),
      mode,
      focusNodeId,
      JSON.stringify(pinnedData ?? {}),
      JSON.stringify(input ?? {}),
      parentExecutionId ?? null,
      parentNodeId ?? null,
    ]
  );
  return rows[0].id;
}

export async function startExecution(executionId) {
  const result = await db.query(
    `UPDATE executions
     SET status = 'running',
         started_at = COALESCE(started_at, NOW()),
         completed_at = NULL,
         error = NULL
     WHERE id = $1
       AND status IN ('pending', 'waiting', 'running')`,
    [executionId]
  );
  // WHAT was wrong: a duplicate/stale job could move a terminal execution back to
  // running. Return whether the transition was accepted so callers can stop replay.
  return result.rowCount > 0;
}

export async function completeExecution(executionId, { status, error } = {}) {
  await db.query(
    `UPDATE executions
     SET status = $2, completed_at = NOW(), error = $3
     WHERE id = $1
       AND status = 'running'`,
    [executionId, status ?? 'success', error ?? null]
  );
}

export async function logNodeStart({ id, executionId, nodeId, nodeName, nodeType, input }) {
  const logId = id ?? randomUUID();
  await db.query(
    `INSERT INTO node_executions
       (id, execution_id, node_id, node_name, node_type, status, started_at, input)
     VALUES ($1, $2, $3, $4, $5, 'running', NOW(), $6)`,
    [logId, executionId, nodeId, nodeName ?? nodeId, nodeType, JSON.stringify(input)]
  );
  return logId;
}

export async function logNodeEnd(logId, { status, output, error, retryCount = 0, usage, model }) {
  const params = [logId, status, JSON.stringify(output ?? null), error ?? null, retryCount];
  let tokenCols = '';

  if (usage) {
    tokenCols = `, prompt_tokens = $6, completion_tokens = $7, total_tokens = $8, model = $9`;
    params.push(usage.prompt_tokens ?? null, usage.completion_tokens ?? null, usage.total_tokens ?? null, model ?? null);
  }

  await db.query(
    `UPDATE node_executions
     SET status = $2,
         completed_at = NOW(),
         duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
         output = $3,
         error = $4,
         retry_count = $5${tokenCols}
     WHERE id = $1`,
    params
  );
}

export async function logNodeSkipped({ executionId, nodeId, nodeName, nodeType }) {
  await db.query(
    `INSERT INTO node_executions
       (execution_id, node_id, node_name, node_type, status, started_at, completed_at, duration_ms)
     VALUES ($1, $2, $3, $4, 'skipped', NOW(), NOW(), 0)`,
    [executionId, nodeId, nodeName ?? nodeId, nodeType]
  );
}

export async function logNodeWait(logId, { waitType }) {
  await db.query(
    `UPDATE node_executions SET status = 'waiting', completed_at = NULL WHERE id = $1`,
    [logId]
  );
}

export async function deleteExecution(executionId) {
  await db.query('DELETE FROM executions WHERE id = $1', [executionId]);
}

export async function suspendExecution(executionId, { waitNodeId, waitType, waitUntil, resumeToken, nodeOutputs }) {
  await db.query(
    `UPDATE executions
     SET status = 'waiting',
         wait_node_id  = $2,
         wait_type     = $3,
         wait_until    = $4,
         resume_token  = $5,
         resume_payload = $6,
         suspended_at  = NOW()
     WHERE id = $1`,
    [executionId, waitNodeId, waitType, waitUntil ?? null, resumeToken, JSON.stringify(nodeOutputs ?? {})]
  );
}
