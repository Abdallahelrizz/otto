import { db } from '../db/client.js';

function parseLimit(value, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), 100);
}

export async function memoryRoutes(fastify) {
  fastify.get('/api/v1/memory/patterns', async (req, reply) => {
    const { category, limit = 50 } = req.query;
    const params = [req.auth.workspaceId, parseLimit(limit)];
    const categoryClause = category ? `AND category = $${params.push(category)}` : '';

    const { rows } = await db.query(
      `SELECT id, content, category, confidence, hit_count, last_invoked_at
       FROM memory_patterns
       WHERE workspace_id = $1
       ${categoryClause}
       ORDER BY COALESCE(last_invoked_at, '-infinity'::timestamptz) DESC, hit_count DESC
       LIMIT $2`,
      params
    );
    return reply.send({ patterns: rows });
  });

  fastify.get('/api/v1/memory/interactions', async (req, reply) => {
    const { sessionId, limit = 50 } = req.query;
    const params = [req.auth.workspaceId, parseLimit(limit)];
    const sessionClause = sessionId ? `AND session_id = $${params.push(sessionId)}` : '';

    const { rows } = await db.query(
      `SELECT id, session_id, input, output, confidence, created_at
       FROM memory_interactions
       WHERE workspace_id = $1
       ${sessionClause}
       ORDER BY created_at DESC
       LIMIT $2`,
      params
    );
    return reply.send({ interactions: rows });
  });

  fastify.get('/api/v1/memory/summaries', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT session_id, summary, turn_count, updated_at
       FROM session_summaries
       WHERE workspace_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [req.auth.workspaceId]
    );
    return reply.send({ summaries: rows });
  });

  fastify.delete('/api/v1/memory/patterns/:id', async (req, reply) => {
    const { rows } = await db.query(
      'DELETE FROM memory_patterns WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Memory pattern not found' });
    return reply.send({ ok: true });
  });

  fastify.delete('/api/v1/memory/interactions/:id', async (req, reply) => {
    const { rows } = await db.query(
      'DELETE FROM memory_interactions WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Memory interaction not found' });
    return reply.send({ ok: true });
  });
}
