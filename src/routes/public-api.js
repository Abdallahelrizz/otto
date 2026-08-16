import { db } from '../db/client.js';
import { randomUUID } from 'crypto';
import { executionQueue } from '../queue/client.js';
import { createExecution } from '../engine/logger.js';
import { reconcileWorkflowSchedule, validateWorkflowActivation } from '../schedules/service.js';
import { hasBlockingIssues, validateWorkflowDefinition } from '../utils/workflow-validation.js';

/**
 * Public API routes — /api/v1/public/
 *
 * Intended for programmatic / external access via API key or session.
 * All routes require req.auth (set by the global onRequest hook).
 * All data is scoped to req.auth.workspaceId.
 */
export async function publicApiRoutes(fastify) {
  // -------------------------------------------------------------------------
  // GET /api/v1/public/workflows
  // List workflows — minimal fields suitable for external consumers.
  // Query params: limit (default 50, max 100), offset (default 0), tag
  // -------------------------------------------------------------------------
  fastify.get('/api/v1/public/workflows', async (req, reply) => {
    const { workspaceId } = req.auth;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const tag = req.query.tag ?? null;

    const { rows } = await db.query(
      `SELECT id, name, active, tags, created_at, updated_at
       FROM workflows
       WHERE workspace_id = $1 AND ($2::text IS NULL OR $2 = ANY(tags))
       ORDER BY updated_at DESC
       LIMIT $3 OFFSET $4`,
      [workspaceId, tag, limit, offset]
    );

    return reply.send({ workflows: rows });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/public/workflows/:id/run
  // Trigger a workflow run. Enqueues to BullMQ and returns { executionId }.
  // Body (all optional): input object, triggerData object
  // -------------------------------------------------------------------------
  fastify.post('/api/v1/public/workflows/:id/run', async (req, reply) => {
    const { id: workflowId } = req.params;
    const { workspaceId } = req.auth;
    const triggerData = req.body?.triggerData ?? req.body?.input ?? {};

    const { rows } = await db.query(
      'SELECT id, definition, active FROM workflows WHERE id = $1 AND workspace_id = $2',
      [workflowId, workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    const { definition } = rows[0];

    const validation = validateWorkflowDefinition(definition);
    if (hasBlockingIssues(validation)) {
      return reply.code(422).send({
        error: 'Workflow has validation errors and cannot be run',
        details: validation.issues,
      });
    }

    const executionId = await createExecution({
      workflowId,
      workspaceId,
      triggerType: 'api',
      input: triggerData,
      status: 'pending',
      mode: 'full',
      focusNodeId: null,
      pinnedData: {},
    });

    await executionQueue.add(
      'run',
      {
        executionId,
        workflowId,
        workspaceId,
        triggerType: 'api',
        input: triggerData,
        definition,
        mode: 'full',
        nodeId: null,
        pinnedData: {},
      },
      { jobId: executionId }
    );

    return reply.code(202).send({ executionId });
  });

  // -------------------------------------------------------------------------
  // GET /api/v1/public/executions/:id
  // Get execution status + node outputs.
  // Returns: { id, status, startedAt, completedAt, nodes: [{nodeId, nodeName, status, output}] }
  // -------------------------------------------------------------------------
  fastify.get('/api/v1/public/executions/:id', async (req, reply) => {
    const { id } = req.params;
    const { workspaceId } = req.auth;

    // Fix: the child query previously read node rows by execution ID without workspace isolation.
    const [execResult, nodeResult] = await Promise.all([
      db.query(
        `SELECT id, workflow_id, status, started_at, completed_at, trigger_type, error
         FROM executions
         WHERE id = $1 AND workspace_id = $2`,
        [id, workspaceId]
      ),
      db.query(
        `SELECT node_id, node_name, status, output
         FROM node_executions
         WHERE execution_id = $1
           AND EXISTS (
             SELECT 1 FROM executions e
             WHERE e.id = node_executions.execution_id AND e.workspace_id = $2
           )
         ORDER BY started_at ASC`,
        [id, workspaceId]
      ),
    ]);

    if (!execResult.rows.length) return reply.code(404).send({ error: 'Execution not found' });

    const exec = execResult.rows[0];
    return reply.send({
      id: exec.id,
      workflowId: exec.workflow_id,
      status: exec.status,
      startedAt: exec.started_at,
      completedAt: exec.completed_at,
      triggerType: exec.trigger_type,
      error: exec.error ?? null,
      nodes: nodeResult.rows.map((n) => ({
        nodeId: n.node_id,
        nodeName: n.node_name,
        status: n.status,
        output: n.output ?? null,
      })),
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/public/workflows/:id/activate
  // Set active=true on a workflow. Reconciles schedule triggers.
  // -------------------------------------------------------------------------
  fastify.post('/api/v1/public/workflows/:id/activate', async (req, reply) => {
    const { id } = req.params;
    const { workspaceId } = req.auth;

    const { rows } = await db.query(
      'SELECT id, definition FROM workflows WHERE id = $1 AND workspace_id = $2',
      [id, workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    const { definition } = rows[0];

    const validation = validateWorkflowDefinition(definition);
    if (hasBlockingIssues(validation)) {
      return reply.code(422).send({
        error: 'Workflow cannot be activated — validation errors must be resolved first',
        details: validation.issues,
      });
    }

    const activationErrors = validateWorkflowActivation(definition);
    if (activationErrors.length) {
      return reply.code(422).send({ error: 'Workflow cannot be activated', details: activationErrors });
    }

    const { rows: updated } = await db.query(
      `UPDATE workflows
       SET active = true, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2
       RETURNING id, workspace_id, definition, active`,
      [id, workspaceId]
    );

    await reconcileWorkflowSchedule(updated[0]);

    return reply.send({ ok: true });
  });

  // -------------------------------------------------------------------------
  // POST /api/v1/public/workflows/:id/deactivate
  // Set active=false on a workflow. Reconciles schedule triggers.
  // -------------------------------------------------------------------------
  fastify.post('/api/v1/public/workflows/:id/deactivate', async (req, reply) => {
    const { id } = req.params;
    const { workspaceId } = req.auth;

    const { rows } = await db.query(
      'SELECT id FROM workflows WHERE id = $1 AND workspace_id = $2',
      [id, workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    const { rows: updated } = await db.query(
      `UPDATE workflows
       SET active = false, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2
       RETURNING id, workspace_id, definition, active`,
      [id, workspaceId]
    );

    await reconcileWorkflowSchedule(updated[0]);

    return reply.send({ ok: true });
  });
}
