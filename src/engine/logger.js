import { db } from '../db/client.js';

export async function createExecution({ workflowId, workspaceId, triggerType, input, status = 'running' }) {
  const { rows } = await db.query(
    `INSERT INTO executions (workflow_id, workspace_id, status, started_at, trigger_type, input)
     VALUES ($1, $2, $3, CASE WHEN $3 = 'running' THEN NOW() ELSE NULL END, $4, $5)
     RETURNING id`,
    [workflowId, workspaceId, status, triggerType, JSON.stringify(input)]
  );
  return rows[0].id;
}

export async function startExecution(executionId) {
  await db.query(
    `UPDATE executions
     SET status = 'running',
         started_at = COALESCE(started_at, NOW()),
         completed_at = NULL,
         error = NULL
     WHERE id = $1`,
    [executionId]
  );
}

export async function completeExecution(executionId, { status, error } = {}) {
  await db.query(
    `UPDATE executions
     SET status = $2, completed_at = NOW(), error = $3
     WHERE id = $1`,
    [executionId, status ?? 'success', error ?? null]
  );
}

export async function logNodeStart({ executionId, nodeId, nodeName, nodeType, input }) {
  const { rows } = await db.query(
    `INSERT INTO node_executions
       (execution_id, node_id, node_name, node_type, status, started_at, input)
     VALUES ($1, $2, $3, $4, 'running', NOW(), $5)
     RETURNING id`,
    [executionId, nodeId, nodeName ?? nodeId, nodeType, JSON.stringify(input)]
  );
  return rows[0].id;
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
