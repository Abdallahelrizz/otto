import { db } from '../db/client.js';
import { aggregateUsage, dailyTokens, monthBounds } from '../engine/usage-stats.js';

const RETENTION_DAYS = Number(process.env.EXECUTION_RETENTION_DAYS ?? 30);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export async function usageRoutes(fastify) {
  // Token-usage summary. Otto does not price model usage — no dollars here.
  fastify.get('/api/v1/usage/summary', async (req, reply) => {
    const ws = req.auth.workspaceId;
    const now = new Date();

    let from, to;
    if (req.query.from && req.query.to) {
      from = new Date(`${req.query.from}T00:00:00.000Z`);
      to = new Date(`${req.query.to}T00:00:00.000Z`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        return reply.code(400).send({ error: 'Invalid from/to range' });
      }
    } else {
      ({ from, to } = monthBounds(now.getUTCFullYear(), now.getUTCMonth()));
    }

    const currentBounds = monthBounds(now.getUTCFullYear(), now.getUTCMonth());
    const isCurrentMonth =
      from.getTime() === currentBounds.from.getTime() && to.getTime() === currentBounds.to.getTime();
    const label = `${MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`;
    const retentionCutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
    const beyondRetention = to <= retentionCutoff;

    const params = [ws, from.toISOString(), to.toISOString()];

    const [tokenRes, runRes, dailyRes] = await Promise.all([
      db.query(
        `SELECT e.workflow_id, w.name AS workflow_name, ne.model,
                COALESCE(SUM(ne.prompt_tokens), 0)::BIGINT     AS prompt_tokens,
                COALESCE(SUM(ne.completion_tokens), 0)::BIGINT AS completion_tokens
         FROM node_executions ne
         JOIN executions e ON e.id = ne.execution_id
         LEFT JOIN workflows w ON w.id = e.workflow_id
         WHERE e.workspace_id = $1
           AND COALESCE(e.started_at, e.completed_at) >= $2
           AND COALESCE(e.started_at, e.completed_at) <  $3
           AND ne.model IS NOT NULL
         GROUP BY e.workflow_id, w.name, ne.model
         UNION ALL
         SELECT '00000000-0000-0000-0000-000000000000'::UUID AS workflow_id, 'OttoBot Chat' AS workflow_name, model,
                SUM(prompt_tokens)::BIGINT AS prompt_tokens,
                SUM(completion_tokens)::BIGINT AS completion_tokens
         FROM ottobot_usage
         WHERE workspace_id = $1
           AND created_at >= $2
           AND created_at <  $3
         GROUP BY model`,
        params
      ),
      db.query(
        `SELECT e.workflow_id, COUNT(*)::INT AS runs
         FROM executions e
         WHERE e.workspace_id = $1
           AND COALESCE(e.started_at, e.completed_at) >= $2
           AND COALESCE(e.started_at, e.completed_at) <  $3
         GROUP BY e.workflow_id`,
        params
      ),
      db.query(
        `SELECT DATE_TRUNC('day', COALESCE(e.started_at, e.completed_at))::DATE AS day,
                COALESCE(SUM(ne.prompt_tokens), 0)::BIGINT     AS prompt_tokens,
                COALESCE(SUM(ne.completion_tokens), 0)::BIGINT AS completion_tokens
         FROM node_executions ne
         JOIN executions e ON e.id = ne.execution_id
         WHERE e.workspace_id = $1
           AND COALESCE(e.started_at, e.completed_at) >= $2
           AND COALESCE(e.started_at, e.completed_at) <  $3
           AND ne.model IS NOT NULL
         GROUP BY day
         UNION ALL
         SELECT DATE_TRUNC('day', created_at)::DATE AS day,
                SUM(prompt_tokens)::BIGINT AS prompt_tokens,
                SUM(completion_tokens)::BIGINT AS completion_tokens
         FROM ottobot_usage
         WHERE workspace_id = $1
           AND created_at >= $2
           AND created_at <  $3
         GROUP BY day
         ORDER BY day ASC`,
        params
      ),
    ]);

    const agg = aggregateUsage(
      tokenRes.rows.map((r) => ({
        workflow_id: r.workflow_id,
        workflow_name: r.workflow_name,
        model: r.model,
        prompt_tokens: Number(r.prompt_tokens),
        completion_tokens: Number(r.completion_tokens),
      })),
      runRes.rows
    );

    const daily = dailyTokens(dailyRes.rows);

    return reply.send({
      period: { from: from.toISOString(), to: to.toISOString(), label, isCurrentMonth },
      retention: { cutoff: retentionCutoff.toISOString(), beyondRetention },
      totals: agg.totals,
      byWorkflow: agg.byWorkflow,
      daily,
      models: agg.models,
    });
  });
}
