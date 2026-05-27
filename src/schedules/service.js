import { executionQueue } from '../queue/client.js';
import { db } from '../db/client.js';
import { validateFormFields } from '../triggers/runtime.js';

const SCHEDULER_PREFIX = 'workflow-schedule';

function findScheduleNode(definition) {
  return (definition?.nodes ?? []).find((node) => node.type === 'schedule_trigger') ?? null;
}

function intervalMs(config) {
  const every = Number(config.every ?? config.amount ?? 0);
  const unit = config.unit ?? 'minutes';
  if (!Number.isFinite(every) || every <= 0) return null;
  if (unit === 'ms') return every;
  if (unit === 'seconds' || unit === 's') return every * 1000;
  if (unit === 'hours' || unit === 'h') return every * 60 * 60 * 1000;
  return every * 60 * 1000;
}

export function validateWorkflowActivation(definition) {
  const errors = [];
  const nodes = definition?.nodes ?? [];

  for (const node of nodes) {
    if (node.type === 'webhook_trigger') {
      if (!String(node.config?.path ?? '').trim()) {
        errors.push(`Webhook trigger "${node.name ?? node.id}" needs a path`);
      }
      if (!String(node.config?.method ?? '').trim()) {
        errors.push(`Webhook trigger "${node.name ?? node.id}" needs a method`);
      }
    }

    if (node.type === 'form_trigger') {
      if (!String(node.config?.path ?? '').trim()) {
        errors.push(`Form trigger "${node.name ?? node.id}" needs a path`);
      }
      errors.push(...validateFormFields(node.config?.fieldsJson ?? []).map((err) => `Form trigger "${node.name ?? node.id}": ${err}`));
    }

    if (node.type === 'chat_trigger') {
      if (!String(node.config?.path ?? '').trim()) {
        errors.push(`Chat trigger "${node.name ?? node.id}" needs a path`);
      }
    }

    if (node.type === 'schedule_trigger') {
      const config = node.config ?? {};
      const mode = config.mode ?? 'interval';
      if (mode === 'cron') {
        if (!String(config.cron ?? '').trim()) errors.push(`Schedule trigger "${node.name ?? node.id}" needs a cron expression`);
      } else if (!intervalMs(config)) {
        errors.push(`Schedule trigger "${node.name ?? node.id}" needs a positive interval`);
      }
    }

    if (node.type === 'code' && !String(node.config?.code ?? '').trim()) {
      errors.push(`Code node "${node.name ?? node.id}" needs code`);
    }
  }

  return errors;
}

export function schedulerIdForWorkflow(workflowId) {
  return `${SCHEDULER_PREFIX}:${workflowId}`;
}

export async function reconcileWorkflowSchedule({ id, workspace_id: workspaceId, definition, active }) {
  const schedulerId = schedulerIdForWorkflow(id);
  const scheduleNode = findScheduleNode(definition);

  if (!active || !scheduleNode) {
    await executionQueue.removeJobScheduler(schedulerId).catch(() => false);
    return { scheduled: false };
  }

  const config = scheduleNode.config ?? {};
  const repeatOpts = config.mode === 'cron'
    ? { pattern: String(config.cron), tz: config.timezone || 'UTC' }
    : { every: intervalMs(config) };

  if (!repeatOpts.every && !repeatOpts.pattern) {
    await executionQueue.removeJobScheduler(schedulerId).catch(() => false);
    return { scheduled: false };
  }

  await executionQueue.upsertJobScheduler(
    schedulerId,
    repeatOpts,
    {
      name: 'run',
      data: {
        workflowId: id,
        workspaceId,
        triggerType: 'schedule',
        input: {
          schedule: {
            workflowId: id,
            nodeId: scheduleNode.id,
            firedAt: '{{ scheduled_at }}',
          },
        },
      },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 500 },
      },
    }
  );

  return { scheduled: true, schedulerId };
}

export async function reconcileActiveSchedules() {
  const { rows } = await db.query(
    `SELECT id, workspace_id, definition, active
     FROM workflows
     WHERE active = true`
  );

  for (const row of rows) {
    await reconcileWorkflowSchedule(row).catch((err) => {
      console.error(`[scheduler] failed to reconcile workflow ${row.id}:`, err.message);
    });
  }
}
