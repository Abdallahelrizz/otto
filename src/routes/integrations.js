import { db } from '../db/client.js';

export async function integrationRoutes(fastify) {
  fastify.get('/api/v1/integrations', async (_req, reply) => {
    const { rows } = await db.query(
      `SELECT id, slug, name, category, description, icon_url, credential_schema, node_types, version, official
       FROM integrations
       ORDER BY category ASC, name ASC`
    );
    return reply.send({ integrations: rows });
  });

  fastify.get('/api/v1/integrations/installed', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT i.id, i.slug, i.name, i.category, i.description, i.icon_url,
              i.credential_schema, i.node_types, i.version, wi.installed_at
       FROM workspace_integrations wi
       JOIN integrations i ON i.id = wi.integration_id
       WHERE wi.workspace_id = $1
       ORDER BY i.name ASC`,
      [req.auth.workspaceId]
    );
    return reply.send({ integrations: rows });
  });

  fastify.post('/api/v1/integrations/:id/install', async (req, reply) => {
    const { rows: intRows } = await db.query('SELECT id FROM integrations WHERE id = $1', [req.params.id]);
    if (!intRows.length) return reply.code(404).send({ error: 'Integration not found' });

    await db.query(
      `INSERT INTO workspace_integrations (workspace_id, integration_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.auth.workspaceId, req.params.id]
    );
    return reply.send({ ok: true });
  });

  fastify.delete('/api/v1/integrations/:id/install', async (req, reply) => {
    await db.query(
      `DELETE FROM workspace_integrations WHERE workspace_id = $1 AND integration_id = $2`,
      [req.auth.workspaceId, req.params.id]
    );
    return reply.send({ ok: true });
  });
}
