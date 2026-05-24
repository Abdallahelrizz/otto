import { db } from '../db/client.js';
import { randomUUID } from 'crypto';

export async function workflowRoutes(fastify) {
  // List workflows for a workspace
  fastify.get('/api/v1/workflows', async (req, reply) => {
    const { workspaceId, limit = 50, offset = 0 } = req.query;
    if (!workspaceId) return reply.code(400).send({ error: 'workspaceId is required' });

    const { rows } = await db.query(
      `SELECT id, name, active, created_at, updated_at
       FROM workflows
       WHERE workspace_id = $1
       ORDER BY updated_at DESC
       LIMIT $2 OFFSET $3`,
      [workspaceId, Number(limit), Number(offset)]
    );
    return reply.send({ workflows: rows });
  });

  // Get a single workflow (includes definition)
  fastify.get('/api/v1/workflows/:id', async (req, reply) => {
    const { rows } = await db.query(
      'SELECT id, workspace_id, name, definition, active, created_at, updated_at FROM workflows WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
    return reply.send({ workflow: rows[0] });
  });

  // Create a workflow
  fastify.post('/api/v1/workflows', async (req, reply) => {
    const { workspaceId, name, definition = { nodes: [], edges: [] }, active = false } = req.body ?? {};
    if (!workspaceId) return reply.code(400).send({ error: 'workspaceId is required' });
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const id = randomUUID();
    await db.query(
      `INSERT INTO workflows (id, workspace_id, name, definition, active)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, workspaceId, name, JSON.stringify(definition), active]
    );
    return reply.code(201).send({ id });
  });

  // Update a workflow (name, definition, active)
  fastify.put('/api/v1/workflows/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, definition, active } = req.body ?? {};

    const { rows: existing } = await db.query(
      'SELECT id, name, definition FROM workflows WHERE id = $1',
      [id]
    );
    if (!existing.length) return reply.code(404).send({ error: 'Workflow not found' });

    const setParts = ['updated_at = NOW()'];
    const params = [];

    if (name !== undefined) { params.push(name); setParts.push(`name = $${params.length}`); }
    if (definition !== undefined) { params.push(JSON.stringify(definition)); setParts.push(`definition = $${params.length}`); }
    if (active !== undefined) { params.push(active); setParts.push(`active = $${params.length}`); }

    params.push(id);
    await db.query(
      `UPDATE workflows SET ${setParts.join(', ')} WHERE id = $${params.length}`,
      params
    );

    // Snapshot to workflow_versions if definition changed
    if (definition !== undefined) {
      const { rows: versionRows } = await db.query(
        'SELECT COALESCE(MAX(version_number), 0) AS max_v FROM workflow_versions WHERE workflow_id = $1',
        [id]
      );
      const nextVersion = (versionRows[0]?.max_v ?? 0) + 1;
      await db.query(
        `INSERT INTO workflow_versions (workflow_id, version_number, definition)
         VALUES ($1, $2, $3)`,
        [id, nextVersion, JSON.stringify(definition)]
      );
    }

    return reply.send({ ok: true });
  });

  // Soft-delete (deactivate) a workflow
  fastify.delete('/api/v1/workflows/:id', async (req, reply) => {
    const { rows } = await db.query(
      'UPDATE workflows SET active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
    return reply.send({ ok: true });
  });

  // Duplicate a workflow
  fastify.post('/api/v1/workflows/:id/duplicate', async (req, reply) => {
    const { rows } = await db.query(
      'SELECT workspace_id, name, definition FROM workflows WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    const src = rows[0];
    const newId = randomUUID();
    await db.query(
      `INSERT INTO workflows (id, workspace_id, name, definition, active)
       VALUES ($1, $2, $3, $4, false)`,
      [newId, src.workspace_id, `${src.name} (copy)`, JSON.stringify(src.definition)]
    );
    return reply.code(201).send({ id: newId });
  });
}
