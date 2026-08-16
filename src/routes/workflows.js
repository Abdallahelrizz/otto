import { db } from '../db/client.js';
import { randomUUID } from 'crypto';
import { reconcileWorkflowSchedule, validateWorkflowActivation } from '../schedules/service.js';
import {
  hasBlockingIssues,
  hasSaveBlockingIssues,
  validateWorkflowDefinition,
} from '../utils/workflow-validation.js';

export async function workflowRoutes(fastify) {
  fastify.get('/api/v1/workflows', async (req, reply) => {
    const { tag } = req.query;
    const { workspaceId } = req.auth;
    // Clamp pagination to sane bounds (guard NaN / negative / huge)
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { rows } = await db.query(
      `SELECT id, name, active, tags, created_at, updated_at,
         jsonb_build_object(
           'nodes', COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('id', n->>'id', 'type', n->>'type', 'position', n->'position'))
              FROM jsonb_array_elements(COALESCE(definition->'nodes', '[]'::jsonb)) n),
             '[]'::jsonb
           ),
           'edges', COALESCE(
             (SELECT jsonb_agg(jsonb_build_object('id', e->>'id', 'source', e->>'source', 'target', e->>'target'))
              FROM jsonb_array_elements(COALESCE(definition->'edges', '[]'::jsonb)) e),
             '[]'::jsonb
           )
         ) AS definition
       FROM workflows
       WHERE workspace_id = $1 AND ($2::text IS NULL OR $2 = ANY(tags))
       ORDER BY updated_at DESC
       LIMIT $3 OFFSET $4`,
      [workspaceId, tag ?? null, limit, offset]
    );
    return reply.send({ workflows: rows });
  });

  fastify.get('/api/v1/workflows/:id', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT id, workspace_id, name, definition, active, tags, created_at, updated_at
       FROM workflows
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
    return reply.send({ workflow: rows[0] });
  });

  fastify.post('/api/v1/workflows', async (req, reply) => {
    const { name, definition = { nodes: [], edges: [] }, active = false, tags = [] } = req.body ?? {};
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const validation = validateWorkflowDefinition(definition);
    if (hasSaveBlockingIssues(validation)) {
      return reply.code(422).send({ error: 'Workflow definition is invalid', details: validation.issues, validation });
    }

    if (active && hasBlockingIssues(validation)) {
      return reply.code(422).send({ error: 'Workflow cannot be activated', details: validation.issues, validation });
    }

    if (active) {
      const errors = validateWorkflowActivation(definition);
      if (errors.length) return reply.code(422).send({ error: 'Workflow cannot be activated', details: errors });
    }

    const id = randomUUID();
    await db.query(
      `INSERT INTO workflows (id, workspace_id, name, definition, active, tags)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, req.auth.workspaceId, name, JSON.stringify(definition), active, tags]
    );

    if (active) {
      await reconcileWorkflowSchedule({ id, workspace_id: req.auth.workspaceId, definition, active });
    }

    return reply.code(201).send({ id, validation });
  });

  fastify.put('/api/v1/workflows/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, definition, active, tags, autosave = false } = req.body ?? {};
    const isAutosave = autosave === true;

    const { rows: existing } = await db.query(
      `SELECT id, workspace_id, name, definition, active
       FROM workflows
       WHERE id = $1 AND workspace_id = $2`,
      [id, req.auth.workspaceId]
    );
    if (!existing.length) return reply.code(404).send({ error: 'Workflow not found' });

    const nextDefinition = definition ?? existing[0].definition;
    const nextActive = active ?? existing[0].active;
    const validation = validateWorkflowDefinition(nextDefinition);
    if (hasSaveBlockingIssues(validation)) {
      return reply.code(422).send({ error: 'Workflow definition is invalid', details: validation.issues, validation });
    }
    if (nextActive && hasBlockingIssues(validation)) {
      return reply.code(422).send({ error: 'Workflow cannot be activated', details: validation.issues, validation });
    }

    if (nextActive) {
      const errors = validateWorkflowActivation(nextDefinition);
      if (errors.length) return reply.code(422).send({ error: 'Workflow cannot be activated', details: errors });
    }

    const setParts = ['updated_at = NOW()'];
    const params = [];

    if (name !== undefined) { params.push(name); setParts.push(`name = $${params.length}`); }
    if (definition !== undefined) { params.push(JSON.stringify(definition)); setParts.push(`definition = $${params.length}`); }
    if (active !== undefined) { params.push(active); setParts.push(`active = $${params.length}`); }
    if (tags !== undefined) { params.push(tags); setParts.push(`tags = $${params.length}`); }

    params.push(id, req.auth.workspaceId);
    const { rows: updatedRows } = await db.query(
      `UPDATE workflows
       SET ${setParts.join(', ')}
       WHERE id = $${params.length - 1} AND workspace_id = $${params.length}
       RETURNING id, workspace_id, definition, active`,
      params
    );

    if (definition !== undefined) {
      // Fix: version child reads are scoped through the already-owned workflow.
      const { rows: latestRows } = await db.query(
        `SELECT id, version_number, is_autosave
         FROM workflow_versions
         WHERE workflow_id = $1
           AND EXISTS (SELECT 1 FROM workflows w WHERE w.id = $1 AND w.workspace_id = $2)
         ORDER BY version_number DESC
         LIMIT 1`,
        [id, req.auth.workspaceId]
      );
      const latest = latestRows[0];

      if (isAutosave && latest?.is_autosave) {
        await db.query(
          `UPDATE workflow_versions
           SET definition = $1, created_at = NOW(), created_by = $2
           WHERE id = $3
             AND EXISTS (
               SELECT 1 FROM workflows w
               WHERE w.id = workflow_versions.workflow_id AND w.workspace_id = $4
             )`,
          [JSON.stringify(definition), req.auth.userId, latest.id, req.auth.workspaceId]
        );
      } else {
        const nextVersion = (latest?.version_number ?? 0) + 1;
        await db.query(
          `INSERT INTO workflow_versions (workflow_id, version_number, definition, created_by, is_autosave)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, nextVersion, JSON.stringify(definition), req.auth.userId, isAutosave]
        );
      }
    }

    await reconcileWorkflowSchedule(updatedRows[0]);

    return reply.send({ ok: true, id, validation });
  });

  fastify.delete('/api/v1/workflows/:id', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT id, workspace_id, definition, active
       FROM workflows
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    if (rows[0].active) {
      await reconcileWorkflowSchedule({ ...rows[0], active: false });
    }

    await db.query(
      `DELETE FROM workflows WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.auth.workspaceId]
    );

    return reply.send({ ok: true });
  });

  fastify.get('/api/v1/workflows/:id/versions', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT v.version_number, v.created_at, u.email AS created_by_email
       FROM workflow_versions v
       LEFT JOIN users u ON u.id = v.created_by
       WHERE v.workflow_id = $1
         AND EXISTS (SELECT 1 FROM workflows w WHERE w.id = $1 AND w.workspace_id = $2)
       ORDER BY v.version_number DESC
       LIMIT 50`,
      [req.params.id, req.auth.workspaceId]
    );
    return reply.send({ versions: rows });
  });

  fastify.post('/api/v1/workflows/:id/versions/:vnum/restore', async (req, reply) => {
    const { id, vnum } = req.params;
    const versionNumber = Number(vnum);
    // Fix: reject non-numeric versions before they reach integer SQL parameters.
    if (!Number.isInteger(versionNumber)) return reply.code(400).send({ error: 'Invalid version number' });
    const { rows: vRows } = await db.query(
      `SELECT v.definition
       FROM workflow_versions v
       WHERE v.workflow_id = $1 AND v.version_number = $2
         AND EXISTS (SELECT 1 FROM workflows w WHERE w.id = $1 AND w.workspace_id = $3)`,
      [id, versionNumber, req.auth.workspaceId]
    );
    if (!vRows.length) return reply.code(404).send({ error: 'Version not found' });

    const definition = vRows[0].definition;
    await db.query(
      `UPDATE workflows SET definition = $1, updated_at = NOW() WHERE id = $2 AND workspace_id = $3`,
      [JSON.stringify(definition), id, req.auth.workspaceId]
    );

    // Fix: the version aggregate is scoped through the request workspace.
    const { rows: versionRows } = await db.query(
      `SELECT COALESCE(MAX(v.version_number), 0) AS max_v
       FROM workflow_versions v
       WHERE v.workflow_id = $1
         AND EXISTS (SELECT 1 FROM workflows w WHERE w.id = $1 AND w.workspace_id = $2)`,
      [id, req.auth.workspaceId]
    );
    const nextVersion = (versionRows[0]?.max_v ?? 0) + 1;
    await db.query(
      `INSERT INTO workflow_versions (workflow_id, version_number, definition, created_by) VALUES ($1, $2, $3, $4)`,
      [id, nextVersion, JSON.stringify(definition), req.auth.userId]
    );

    return reply.send({ ok: true, restoredFrom: versionNumber, newVersion: nextVersion });
  });

  fastify.post('/api/v1/workflows/:id/activate', async (req, reply) => {
    const { rows } = await db.query(
      `UPDATE workflows SET active = true, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL
       RETURNING id, workspace_id, definition, active`,
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
    await reconcileWorkflowSchedule(rows[0]);
    return reply.send({ ok: true, active: true });
  });

  fastify.post('/api/v1/workflows/:id/deactivate', async (req, reply) => {
    const { rows } = await db.query(
      `UPDATE workflows SET active = false, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2
       RETURNING id, workspace_id, definition, active`,
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
    await reconcileWorkflowSchedule(rows[0]);
    return reply.send({ ok: true, active: false });
  });

  fastify.post('/api/v1/workflows/:id/archive', async (req, reply) => {
    const { rows } = await db.query(
      `UPDATE workflows SET active = false, archived_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL
       RETURNING id, workspace_id, definition, active`,
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found or already archived' });
    await reconcileWorkflowSchedule({ ...rows[0], active: false });
    return reply.send({ ok: true, archived: true });
  });

  fastify.post('/api/v1/workflows/:id/unarchive', async (req, reply) => {
    const { rows } = await db.query(
      `UPDATE workflows SET archived_at = NULL, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2 AND archived_at IS NOT NULL
       RETURNING id`,
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found or not archived' });
    return reply.send({ ok: true, archived: false });
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
