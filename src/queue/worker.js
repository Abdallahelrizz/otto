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

      // For resume jobs, accept both time waits (still `waiting`) and HTTP/approval
      // resumes (atomically claimed as `running` before enqueue).
      if (job.name === 'resume' && executionId) {
        const { rows: statusRows } = await db.query(
          'SELECT status FROM executions WHERE id = $1',
          [executionId]
        );
        // WHAT was wrong: token-based resume routes set `running` before enqueueing,
        // so the worker discarded every valid webhook/form/approval resume job.
        if (!statusRows.length || !['waiting', 'running'].includes(statusRows[0].status)) return;
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
      try {
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
      } catch (err) {
        // A workflow that FAILED is not a job that needs retrying.
        //
        // The queue runs with attempts: 3, so rethrowing here made BullMQ replay the
        // ENTIRE workflow from node 1 — re-executing every node that had already
        // succeeded. A workflow that sends an email at node 2 and fails at node 5 sent
        // that email three times. Node-level retry (`retryOnFail`) is the correct
        // granularity for business-logic failures and already exists.
        //
        // So: if the execution reached a terminal state, the outcome is recorded and the
        // job is done — swallow, and let the execution row carry the failure. Only
        // rethrow when nothing was recorded (the job died before/while starting, e.g. the
        // DB was unreachable), where a retry is safe because no nodes ran.
        if (!executionId) throw err;
        let recorded = null;
        try {
          const { rows } = await db.query('SELECT status FROM executions WHERE id = $1', [executionId]);
          recorded = rows[0]?.status ?? null;
        } catch {
          throw err; // can't tell — fail loudly rather than silently drop it
        }
        if (['success', 'error', 'cancelled', 'waiting'].includes(recorded)) {
          console.error(`[worker] execution ${executionId} finished as "${recorded}": ${err?.message ?? err}`);
          return; // outcome persisted; replaying would duplicate side effects
        }
        throw err;
      }
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
