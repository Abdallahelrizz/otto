import { db } from '../db/client.js';

export async function integrationRoutes(fastify) {
  // List all available integrations
  fastify.get('/api/v1/integrations', async (_req, reply) => {
    const { rows } = await db.query(
      `SELECT id, slug, name, category, description, icon_url, credential_schema, node_types, version, official
       FROM integrations
       ORDER BY category ASC, name ASC`
    );
    return reply.send({ integrations: rows });
  });

  // List integrations installed for a workspace
  fastify.get('/api/v1/integrations/installed', async (req, reply) => {
    const { workspaceId } = req.query;
    if (!workspaceId) return reply.code(400).send({ error: 'workspaceId is required' });

    const { rows } = await db.query(
      `SELECT i.id, i.slug, i.name, i.category, i.description, i.icon_url,
              i.credential_schema, i.node_types, i.version, wi.installed_at
       FROM workspace_integrations wi
       JOIN integrations i ON i.id = wi.integration_id
       WHERE wi.workspace_id = $1
       ORDER BY i.name ASC`,
      [workspaceId]
    );
    return reply.send({ integrations: rows });
  });

  // Install an integration to a workspace
  fastify.post('/api/v1/integrations/:id/install', async (req, reply) => {
    const { workspaceId } = req.body ?? {};
    if (!workspaceId) return reply.code(400).send({ error: 'workspaceId is required' });

    const { rows: intRows } = await db.query('SELECT id FROM integrations WHERE id = $1', [req.params.id]);
    if (!intRows.length) return reply.code(404).send({ error: 'Integration not found' });

    await db.query(
      `INSERT INTO workspace_integrations (workspace_id, integration_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [workspaceId, req.params.id]
    );
    return reply.send({ ok: true });
  });

  // Uninstall an integration from a workspace
  fastify.delete('/api/v1/integrations/:id/install', async (req, reply) => {
    const { workspaceId } = req.query;
    if (!workspaceId) return reply.code(400).send({ error: 'workspaceId is required' });

    await db.query(
      `DELETE FROM workspace_integrations WHERE workspace_id = $1 AND integration_id = $2`,
      [workspaceId, req.params.id]
    );
    return reply.send({ ok: true });
  });
}
