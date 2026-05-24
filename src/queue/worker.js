import { Worker } from 'bullmq';
import { redis } from './client.js';
import { runWorkflow } from '../engine/executor.js';
import { db } from '../db/client.js';

export function startWorker() {
  const worker = new Worker(
    'executions',
    async (job) => {
      const { executionId, workflowId, workspaceId, triggerType } = job.data;
      const input = job.data.input?.schedule?.firedAt === '{{ scheduled_at }}'
        ? { ...job.data.input, schedule: { ...job.data.input.schedule, firedAt: new Date().toISOString() } }
        : (job.data.input ?? {});

      // Fetch the latest workflow definition
      const { rows } = await db.query(
        'SELECT definition FROM workflows WHERE id = $1',
        [workflowId]
      );
      if (!rows.length) throw new Error(`Workflow ${workflowId} not found`);

      const definition = rows[0].definition;

      await runWorkflow({ executionId, workflowId, workspaceId, definition, input, triggerType });
    },
    {
      connection: redis,
      concurrency: 10,
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
