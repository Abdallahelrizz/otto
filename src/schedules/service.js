import { executionQueue } from '../queue/client.js';
import { db } from '../db/client.js';
import { validateFormFields } from '../triggers/runtime.js';
import cronParser from 'cron-parser';

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

function validateCronSchedule(config) {
  const pattern = String(config.cron ?? '').trim();
  if (!pattern) return 'needs a cron expression';
  const timezone = String(config.timezone || 'UTC');
  try {
    cronParser.parseExpression(pattern, { tz: timezone }).next();
    return null;
  } catch (err) {
    return `has an invalid cron expression or timezone: ${err.message}`;
  }
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
        // Non-empty but invalid cron/timezone values previously passed activation, leaving
        // the workflow active in Postgres while BullMQ rejected its scheduler.
        const cronError = validateCronSchedule(config);
        if (cronError) errors.push(`Schedule trigger "${node.name ?? node.id}" ${cronError}`);
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
  if ((config.mode ?? 'interval') === 'cron') {
    const cronError = validateCronSchedule(config);
    if (cronError) {
      // Invalid persisted schedules previously left the last valid BullMQ scheduler alive,
      // so an active workflow could keep firing on a schedule no longer shown in Postgres.
      await executionQueue.removeJobScheduler(schedulerId).catch(() => false);
      throw new Error(`Schedule trigger "${scheduleNode.name ?? scheduleNode.id}" ${cronError}`);
    }
  }
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

  const activeSchedulerIds = new Set(rows
    .filter((row) => findScheduleNode(row.definition))
    .map((row) => schedulerIdForWorkflow(row.id)));

  // Reconciliation previously only upserted active workflows. Schedulers belonging to a
  // workflow deleted/deactivated while this process was down survived and kept firing.
  const schedulers = await executionQueue.getJobSchedulers(0, -1, true);
  for (const scheduler of schedulers) {
    if (scheduler.id?.startsWith(`${SCHEDULER_PREFIX}:`) && !activeSchedulerIds.has(scheduler.id)) {
      await executionQueue.removeJobScheduler(scheduler.id);
    }
  }

  for (const row of rows) {
    await reconcileWorkflowSchedule(row).catch((err) => {
      console.error(`[scheduler] failed to reconcile workflow ${row.id}:`, err.message);
    });
  }
}
