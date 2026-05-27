import { db } from '../db/client.js';

function requireOwnerOrAdmin(req, reply) {
  const role = req.auth?.role ?? 'viewer';
  if (!['owner', 'admin'].includes(role)) {
    reply.code(403).send({ error: 'Insufficient permissions' });
    return false;
  }
  return true;
}

export async function auditRoutes(fastify) {
  /**
   * GET /api/v1/audit
   * List recent audit events for the workspace.
   * Query params:
   *   limit        - number of rows to return (default 50, max 500)
   *   userId       - filter to a specific user UUID
   *   action       - filter to a specific action string (exact match)
   *   resourceType - filter to a specific resource type
   */
  fastify.get('/api/v1/audit', async (req, reply) => {
    if (!requireOwnerOrAdmin(req, reply)) return;

    const rawLimit = parseInt(req.query.limit ?? '50', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 50;

    const conditions = ['workspace_id = $1'];
    const params = [req.auth.workspaceId];

    if (req.query.userId) {
      params.push(req.query.userId);
      conditions.push(`user_id = $${params.length}`);
    }
    if (req.query.action) {
      params.push(req.query.action);
      conditions.push(`action = $${params.length}`);
    }
    if (req.query.resourceType) {
      params.push(req.query.resourceType);
      conditions.push(`resource_type = $${params.length}`);
    }

    params.push(limit);
    const { rows } = await db.query(
      `SELECT
         id,
         action,
         resource_type   AS "resourceType",
         resource_id     AS "resourceId",
         metadata,
         user_id         AS "userId",
         created_at      AS "createdAt",
         ip_address      AS "ipAddress",
         user_agent      AS "userAgent"
       FROM audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    return reply.send({ events: rows });
  });

  /**
   * GET /api/v1/audit/summary
   * Count events grouped by action for the last 30 days.
   */
  fastify.get('/api/v1/audit/summary', async (req, reply) => {
    if (!requireOwnerOrAdmin(req, reply)) return;

    const { rows } = await db.query(
      `SELECT action, COUNT(*)::int AS count
       FROM audit_log
       WHERE workspace_id = $1
         AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY action
       ORDER BY count DESC`,
      [req.auth.workspaceId]
    );

    return reply.send({ summary: rows });
  });
}
