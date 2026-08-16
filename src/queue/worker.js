import { Worker } from 'bullmq';
import { redis } from './client.js';
import { runWorkflow } from '../engine/executor.js';
import { db } from '../db/client.js';
import { context, propagation } from '@opentelemetry/api';

export function startWorker() {
  const worker = new Worker(
    'executions',
    async (job) => {
      // Handle pruning jobs before workflow execution
      if (job.name === 'prune-old-executions' || job.data?.type === 'prune') {
        const { runPruning } = await import('./pruning-job.js');
        const retentionDays = Number(process.env.EXECUTION_RETENTION_DAYS ?? 30);
        // Intentionally instance-wide (no workspaceId): this is the scheduled
        // retention job an operator sets via EXECUTION_RETENTION_DAYS, not a
        // request. Request-driven pruning MUST pass a workspaceId — see
        // routes/observability.js.
        const result = await runPruning({ retentionDays });
        console.log(`[pruning] Deleted ${result.deletedExecutions} executions older than ${result.retentionDays} days`);
        return result;
      }

      const { executionId, workflowId, workspaceId, triggerType, mode, nodeId, pinnedData } = job.data;

      // For time-based resume jobs, verify the execution is still waiting (not cancelled)
      if (job.name === 'resume' && executionId) {
        const { rows: statusRows } = await db.query(
          'SELECT status FROM executions WHERE id = $1',
          [executionId]
        );
        if (!statusRows.length || statusRows[0].status !== 'waiting') return;
      }
      const input = job.data.input?.schedule?.firedAt === '{{ scheduled_at }}'
        ? { ...job.data.input, schedule: { ...job.data.input.schedule, firedAt: new Date().toISOString() } }
        : (job.data.input ?? {});

      let definition = job.data.definition;
      if (!definition) {
        const { rows } = await db.query(
          'SELECT definition FROM workflows WHERE id = $1',
          [workflowId]
        );
        if (!rows.length) throw new Error(`Workflow ${workflowId} not found`);
        definition = rows[0].definition;
      }

      const parentCtx = job.data?.traceparent
        ? propagation.extract(context.active(), { traceparent: job.data.traceparent })
        : context.active();
      await context.with(parentCtx, () => runWorkflow({
        executionId,
        workflowId,
        workspaceId,
        definition,
        input,
        triggerType,
        mode,
        nodeId,
        pinnedData,
      }));
    },
    {
      connection: redis,
      concurrency: Number(process.env.WORKER_CONCURRENCY ?? 10),
      drainDelay: 1,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[worker] job ${job.id} completed`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[worker] job ${job?.id} failed:`, err.message);
  });

  return worker;
}
