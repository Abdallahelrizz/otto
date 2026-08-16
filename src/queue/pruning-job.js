import { executionQueue } from './client.js';
import { db } from '../db/client.js';

const PRUNE_JOB_NAME = 'prune-old-executions';

export async function schedulePruningJob() {
  // Add a repeatable job that runs every night at 2 AM UTC
  await executionQueue.add(
    PRUNE_JOB_NAME,
    { type: 'prune' },
    {
      repeat: { pattern: '0 2 * * *' }, // cron: 2 AM UTC daily
      jobId: PRUNE_JOB_NAME,
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

/**
 * Delete executions older than the retention window.
 *
 * `workspaceId` MUST be passed for anything request-driven. This used to be
 * unconditionally global, while `POST /api/v1/observability/prune/run` let any
 * workspace admin invoke it — so one workspace's admin pressing "Prune now"
 * deleted every other workspace's execution history. Cross-workspace and
 * destructive: the worst combination.
 *
 * Omitting `workspaceId` is still supported, but ONLY for the scheduled
 * instance-wide job, where an operator pruning their whole deployment is the
 * intent. Never default it from a request.
 */
export async function runPruning({ retentionDays = 30, workspaceId = null } = {}) {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000).toISOString();

  const scope = workspaceId ? 'AND workspace_id = $2' : '';
  const params = workspaceId ? [cutoff, workspaceId] : [cutoff];

  // Delete node_executions first (FK constraint)
  const nodeResult = await db.query(
    `DELETE FROM node_executions WHERE execution_id IN (
      SELECT id FROM executions
      WHERE created_at < $1
        AND status IN ('success', 'error', 'cancelled')
        ${scope}
    )`,
    params
  );

  // Then delete the executions
  const execResult = await db.query(
    `DELETE FROM executions
     WHERE created_at < $1
       AND status IN ('success', 'error', 'cancelled')
       ${scope}`,
    params
  );

  return {
    deletedNodeExecutions: nodeResult.rowCount,
    deletedExecutions: execResult.rowCount,
    cutoff,
    retentionDays,
  };
}
