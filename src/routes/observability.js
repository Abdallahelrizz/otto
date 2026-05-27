import { db } from '../db/client.js';

const FINISHED_STATUSES = new Set(['success', 'error', 'cancelled']);
const ALL_STATUSES = new Set(['pending', 'running', 'success', 'error', 'cancelled']);

export async function observabilityRoutes(fastify) {
  fastify.get('/api/v1/observability/summary', async (req, reply) => {
    const days = clampDays(req.query.days);
    const { where, params } = buildExecutionScope({
      workspaceId: req.auth.workspaceId,
      workflowId: req.query.workflowId,
      days,
    });

    const [
      totals,
      statusRows,
      durationRows,
      tokenRows,
      dailyRows,
      slowNodeRows,
      errorNodeRows,
      recentErrorRows,
    ] = await Promise.all([
      db.query(`SELECT COUNT(*)::INT AS total FROM executions e WHERE ${where}`, params),
      db.query(
        `SELECT e.status, COUNT(*)::INT AS count
         FROM executions e
         WHERE ${where}
         GROUP BY e.status`,
        params
      ),
      db.query(
        `SELECT
           COALESCE(AVG(EXTRACT(EPOCH FROM (e.completed_at - e.started_at)) * 1000), 0)::INT AS avg_duration_ms,
           COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (e.completed_at - e.started_at)) * 1000), 0)::INT AS p95_duration_ms
         FROM executions e
         WHERE ${where}
           AND e.started_at IS NOT NULL
           AND e.completed_at IS NOT NULL`,
        params
      ),
      db.query(
        `SELECT
           COALESCE(SUM(ne.prompt_tokens), 0)::INT AS prompt_tokens,
           COALESCE(SUM(ne.completion_tokens), 0)::INT AS completion_tokens,
           COALESCE(SUM(ne.total_tokens), 0)::INT AS total_tokens
         FROM node_executions ne
         JOIN executions e ON e.id = ne.execution_id
         WHERE ${where}`,
        params
      ),
      db.query(
        `SELECT
           DATE_TRUNC('day', COALESCE(e.started_at, e.completed_at))::DATE AS day,
           COUNT(*)::INT AS total,
           COUNT(*) FILTER (WHERE e.status = 'success')::INT AS success,
           COUNT(*) FILTER (WHERE e.status = 'error')::INT AS error
         FROM executions e
         WHERE ${where}
         GROUP BY day
         ORDER BY day ASC`,
        params
      ),
      db.query(
        `SELECT
           ne.node_id,
           MAX(ne.node_name) AS node_name,
           MAX(ne.node_type) AS node_type,
           COUNT(*)::INT AS runs,
           COALESCE(AVG(ne.duration_ms), 0)::INT AS avg_duration_ms,
           COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY ne.duration_ms), 0)::INT AS p95_duration_ms,
           COALESCE(MAX(ne.duration_ms), 0)::INT AS max_duration_ms
         FROM node_executions ne
         JOIN executions e ON e.id = ne.execution_id
         WHERE ${where}
           AND ne.status = 'success'
           AND ne.duration_ms IS NOT NULL
         GROUP BY ne.node_id
         ORDER BY p95_duration_ms DESC, avg_duration_ms DESC
         LIMIT 8`,
        params
      ),
      db.query(
        `SELECT
           ne.node_id,
           MAX(ne.node_name) AS node_name,
           MAX(ne.node_type) AS node_type,
           COUNT(*)::INT AS errors,
           MAX(ne.completed_at) AS last_error_at,
           (ARRAY_AGG(ne.error ORDER BY ne.completed_at DESC NULLS LAST))[1] AS last_error
         FROM node_executions ne
         JOIN executions e ON e.id = ne.execution_id
         WHERE ${where}
           AND ne.status = 'error'
         GROUP BY ne.node_id
         ORDER BY errors DESC, last_error_at DESC NULLS LAST
         LIMIT 8`,
        params
      ),
      db.query(
        `SELECT
           e.id,
           e.workflow_id,
           w.name AS workflow_name,
           e.started_at,
           e.completed_at,
           e.error
         FROM executions e
         LEFT JOIN workflows w ON w.id = e.workflow_id
         WHERE ${where}
           AND e.status = 'error'
         ORDER BY COALESCE(e.completed_at, e.started_at) DESC NULLS LAST
         LIMIT 8`,
        params
      ),
    ]);

    const byStatus = statusRows.rows.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, { pending: 0, running: 0, success: 0, error: 0, cancelled: 0 });
    const total = totals.rows[0]?.total ?? 0;
    const completed = byStatus.success + byStatus.error + byStatus.cancelled;
    const successRate = completed > 0 ? byStatus.success / completed : 0;
    const errorRate = completed > 0 ? byStatus.error / completed : 0;

    return reply.send({
      rangeDays: days,
      workflowId: req.query.workflowId ?? null,
      totals: {
        executions: total,
        completed,
        successRate,
        errorRate,
        avgDurationMs: durationRows.rows[0]?.avg_duration_ms ?? 0,
        p95DurationMs: durationRows.rows[0]?.p95_duration_ms ?? 0,
        tokens: tokenRows.rows[0] ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      },
      byStatus,
      daily: dailyRows.rows,
      slowNodes: slowNodeRows.rows,
      errorNodes: errorNodeRows.rows,
      recentErrors: recentErrorRows.rows,
    });
  });

  fastify.get('/api/v1/observability/retention', async (req, reply) => {
    return reply.send({ retentionDays: Number(process.env.EXECUTION_RETENTION_DAYS ?? 30) });
  });

  fastify.post('/api/v1/observability/prune/run', async (req, reply) => {
    if (!req.auth || !['owner', 'admin'].includes(req.auth.role ?? '')) {
      return reply.code(403).send({ error: 'Admin or owner role required' });
    }
    const { retentionDays = Number(process.env.EXECUTION_RETENTION_DAYS ?? 30) } = req.body ?? {};
    const { runPruning } = await import('../queue/pruning-job.js');
    const result = await runPruning({ retentionDays });
    return reply.send(result);
  });

  fastify.post('/api/v1/observability/prune', async (req, reply) => {
    const days = clampDays(req.body?.olderThanDays);
    const statuses = normalizeStatuses(req.body?.statuses);
    const dryRun = req.body?.dryRun !== false;
    const { where, params } = buildExecutionScope({
      workspaceId: req.auth.workspaceId,
      workflowId: req.body?.workflowId,
      days,
      statuses,
      useCompletedCutoff: true,
    });

    const countResult = await db.query(`SELECT COUNT(*)::INT AS count FROM executions e WHERE ${where}`, params);
    const count = countResult.rows[0]?.count ?? 0;

    if (dryRun) {
      return reply.send({ dryRun: true, deleted: 0, matched: count, olderThanDays: days, statuses });
    }

    const deleteResult = await db.query(`DELETE FROM executions e WHERE ${where}`, params);
    return reply.send({
      dryRun: false,
      deleted: deleteResult.rowCount ?? 0,
      matched: count,
      olderThanDays: days,
      statuses,
    });
  });
}

function buildExecutionScope({ workspaceId, workflowId, days, statuses, useCompletedCutoff = false }) {
  const params = [workspaceId, days];
  const timestampExpr = useCompletedCutoff
    ? 'COALESCE(e.completed_at, e.started_at)'
    : 'COALESCE(e.started_at, e.completed_at)';
  const conditions = [
    'e.workspace_id = $1',
    `${timestampExpr} >= NOW() - ($2::INT * INTERVAL '1 day')`,
  ];

  if (useCompletedCutoff) {
    conditions[1] = `${timestampExpr} < NOW() - ($2::INT * INTERVAL '1 day')`;
  }

  if (workflowId) {
    params.push(workflowId);
    conditions.push(`e.workflow_id = $${params.length}`);
  }

  if (statuses?.length) {
    params.push(statuses);
    conditions.push(`e.status = ANY($${params.length}::TEXT[])`);
  }

  return { where: conditions.join(' AND '), params };
}

function clampDays(value) {
  const parsed = Number(value ?? 7);
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(Math.max(Math.floor(parsed), 1), 3650);
}

function normalizeStatuses(value) {
  const raw = Array.isArray(value) ? value : [];
  const statuses = raw.filter((status) => ALL_STATUSES.has(status));
  if (!statuses.length) return [...FINISHED_STATUSES];
  const finished = statuses.filter((status) => status !== 'pending' && status !== 'running');
  return finished.length ? finished : [...FINISHED_STATUSES];
}
