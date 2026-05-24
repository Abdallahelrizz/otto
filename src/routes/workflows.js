import { db } from '../db/client.js';
import { randomUUID } from 'crypto';
import { reconcileWorkflowSchedule, validateWorkflowActivation } from '../schedules/service.js';

export async function workflowRoutes(fastify) {
  fastify.get('/api/v1/workflows', async (req, reply) => {
    const { limit = 50, offset = 0 } = req.query;
    const { workspaceId } = req.auth;

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

  fastify.get('/api/v1/workflows/:id', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT id, workspace_id, name, definition, active, created_at, updated_at
       FROM workflows
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
    return reply.send({ workflow: rows[0] });
  });

  fastify.post('/api/v1/workflows', async (req, reply) => {
    const { name, definition = { nodes: [], edges: [] }, active = false } = req.body ?? {};
    if (!name) return reply.code(400).send({ error: 'name is required' });

    if (active) {
      const errors = validateWorkflowActivation(definition);
      if (errors.length) return reply.code(422).send({ error: 'Workflow cannot be activated', details: errors });
    }

    const id = randomUUID();
    await db.query(
      `INSERT INTO workflows (id, workspace_id, name, definition, active)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.auth.workspaceId, name, JSON.stringify(definition), active]
    );

    if (active) {
      await reconcileWorkflowSchedule({ id, workspace_id: req.auth.workspaceId, definition, active });
    }

    return reply.code(201).send({ id });
  });

  fastify.put('/api/v1/workflows/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, definition, active } = req.body ?? {};

    const { rows: existing } = await db.query(
      `SELECT id, workspace_id, name, definition, active
       FROM workflows
       WHERE id = $1 AND workspace_id = $2`,
      [id, req.auth.workspaceId]
    );
    if (!existing.length) return reply.code(404).send({ error: 'Workflow not found' });

    const nextDefinition = definition ?? existing[0].definition;
    const nextActive = active ?? existing[0].active;
    if (nextActive) {
      const errors = validateWorkflowActivation(nextDefinition);
      if (errors.length) return reply.code(422).send({ error: 'Workflow cannot be activated', details: errors });
    }

    const setParts = ['updated_at = NOW()'];
    const params = [];

    if (name !== undefined) { params.push(name); setParts.push(`name = $${params.length}`); }
    if (definition !== undefined) { params.push(JSON.stringify(definition)); setParts.push(`definition = $${params.length}`); }
    if (active !== undefined) { params.push(active); setParts.push(`active = $${params.length}`); }

    params.push(id, req.auth.workspaceId);
    const { rows: updatedRows } = await db.query(
      `UPDATE workflows
       SET ${setParts.join(', ')}
       WHERE id = $${params.length - 1} AND workspace_id = $${params.length}
       RETURNING id, workspace_id, definition, active`,
      params
    );

    if (definition !== undefined) {
      const { rows: versionRows } = await db.query(
        'SELECT COALESCE(MAX(version_number), 0) AS max_v FROM workflow_versions WHERE workflow_id = $1',
        [id]
      );
      const nextVersion = (versionRows[0]?.max_v ?? 0) + 1;
      await db.query(
        `INSERT INTO workflow_versions (workflow_id, version_number, definition, created_by)
         VALUES ($1, $2, $3, $4)`,
        [id, nextVersion, JSON.stringify(definition), req.auth.userId]
      );
    }

    await reconcileWorkflowSchedule(updatedRows[0]);

    return reply.send({ ok: true, id });
  });

  fastify.delete('/api/v1/workflows/:id', async (req, reply) => {
    const { rows } = await db.query(
      `UPDATE workflows
       SET active = false, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2
       RETURNING id, workspace_id, definition, active`,
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
    await reconcileWorkflowSchedule(rows[0]);
    return reply.send({ ok: true });
  });

  fastify.post('/api/v1/workflows/:id/duplicate', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT workspace_id, name, definition
       FROM workflows
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.auth.workspaceId]
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
