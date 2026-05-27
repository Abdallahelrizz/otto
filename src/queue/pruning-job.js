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

export async function runPruning({ retentionDays = 30 } = {}) {
  const cutoff = new Date(Date.now() - retentionDays * 86400_000).toISOString();

  // Delete node_executions first (FK constraint)
  const nodeResult = await db.query(
    `DELETE FROM node_executions WHERE execution_id IN (
      SELECT id FROM executions
      WHERE created_at < $1
        AND status IN ('success', 'error', 'cancelled')
    )`,
    [cutoff]
  );

  // Then delete the executions
  const execResult = await db.query(
    `DELETE FROM executions
     WHERE created_at < $1
       AND status IN ('success', 'error', 'cancelled')`,
    [cutoff]
  );

  return {
    deletedNodeExecutions: nodeResult.rowCount,
    deletedExecutions: execResult.rowCount,
    cutoff,
    retentionDays,
  };
}
