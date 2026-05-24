/**
 * Execution routes.
 *
 * POST /api/v1/workflows/:id/execute
 *   Manual trigger — runs the workflow synchronously (waits for result).
 *   Used from the canvas "Run" button with test data.
 *
 * GET /api/v1/executions
 *   List recent executions (filterable by workflowId, status).
 *
 * GET /api/v1/executions/:id
 *   Get a single execution with all node logs.
 */
import { db } from '../db/client.js';
import { runWorkflow, fireWorkflow } from '../engine/executor.js';
import { subscribeExecution, unsubscribeExecution } from '../engine/events.js';
import { randomUUID } from 'crypto';

// Fixed IDs for the canvas demo workspace — created on first /api/v1/execute call
const DEMO_USER_ID      = '00000000-0000-0000-0000-000000000000';
const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export async function executionRoutes(fastify) {
  // Canvas endpoint — accepts an inline definition OR a saved workflowId
  fastify.post('/api/v1/execute', async (req, reply) => {
    const { definition, workflowId: savedWorkflowId, input = {}, name = 'Canvas Draft' } = req.body ?? {};

    // Bootstrap demo workspace (idempotent)
    await db.query(
      `INSERT INTO users (id, email, name) VALUES ($1, 'canvas@otto.dev', 'Canvas User') ON CONFLICT DO NOTHING`,
      [DEMO_USER_ID]
    );
    await db.query(
      `INSERT INTO workspaces (id, name, owner_id) VALUES ($1, 'Canvas Workspace', $2) ON CONFLICT DO NOTHING`,
      [DEMO_WORKSPACE_ID, DEMO_USER_ID]
    );

    let workflowId;
    let resolvedDefinition;

    if (savedWorkflowId) {
      // Run a saved workflow by ID — fetch its stored definition
      const { rows } = await db.query(
        'SELECT id, workspace_id, definition FROM workflows WHERE id = $1',
        [savedWorkflowId]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
      workflowId = rows[0].id;
      resolvedDefinition = rows[0].definition;
    } else {
      if (!definition) return reply.code(400).send({ error: 'definition or workflowId is required' });
      // Unsaved canvas run — create a transient draft workflow row
      workflowId = randomUUID();
      resolvedDefinition = definition;
      await db.query(
        `INSERT INTO workflows (id, workspace_id, name, definition, active)
         VALUES ($1, $2, $3, $4, false)`,
        [workflowId, DEMO_WORKSPACE_ID, name, JSON.stringify(resolvedDefinition)]
      );
    }

    const executionId = await fireWorkflow({
      workflowId,
      workspaceId: DEMO_WORKSPACE_ID,
      definition: resolvedDefinition,
      input,
      triggerType: 'manual',
    });

    return reply.send({ executionId, workflowId });
  });

  // Manual trigger — synchronous execution
  fastify.post('/api/v1/workflows/:id/execute', async (req, reply) => {
    const { id: workflowId } = req.params;
    const input = req.body ?? {};

    const { rows } = await db.query(
      'SELECT id, workspace_id, definition, active FROM workflows WHERE id = $1',
      [workflowId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    const { workspace_id: workspaceId, definition } = rows[0];

    const { executionId } = await runWorkflow({
      workflowId,
      workspaceId,
      definition,
      input,
      triggerType: 'manual',
    });

    return reply.send({ executionId });
  });

  // List executions
  fastify.get('/api/v1/executions', async (req, reply) => {
    const { workflowId, status, limit = 50, offset = 0 } = req.query;

    const conditions = ['1=1'];
    const params = [];

    if (workflowId) {
      params.push(workflowId);
      conditions.push(`workflow_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    params.push(Number(limit), Number(offset));
    const { rows } = await db.query(
      `SELECT id, workflow_id, status, started_at, completed_at, trigger_type, error
       FROM executions
       WHERE ${conditions.join(' AND ')}
       ORDER BY started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return reply.send({ executions: rows });
  });

  // SSE stream — live events for a running execution
  fastify.get('/api/v1/executions/:id/stream', async (req, reply) => {
    const { id } = req.params;

    // Verify execution exists
    const { rows: execRows } = await db.query(
      'SELECT id, status FROM executions WHERE id = $1',
      [id]
    );
    if (!execRows.length) return reply.code(404).send({ error: 'Execution not found' });

    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (eventType, data) => {
      res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Send current snapshot immediately
    const [snapExec, snapNodes] = await Promise.all([
      db.query('SELECT * FROM executions WHERE id = $1', [id]),
      db.query(
        `SELECT id, node_id, node_name, node_type, status, started_at, completed_at, duration_ms, error
         FROM node_executions WHERE execution_id = $1 ORDER BY started_at ASC`,
        [id]
      ),
    ]);
    send('snapshot', { execution: snapExec.rows[0], nodes: snapNodes.rows });

    // If already finished, close immediately
    if (['success', 'error', 'cancelled'].includes(execRows[0].status)) {
      res.end();
      return reply;
    }

    const listener = (event) => {
      send(event.type, event.data);
      if (event.type === 'execution:end') {
        setTimeout(() => res.end(), 100);
      }
    };

    subscribeExecution(id, listener);

    const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribeExecution(id, listener);
    });

    return reply;
  });

  // Get single execution with node logs
  fastify.get('/api/v1/executions/:id', async (req, reply) => {
    const { id } = req.params;

    const [execResult, nodeResult] = await Promise.all([
      db.query(
        'SELECT * FROM executions WHERE id = $1',
        [id]
      ),
      db.query(
        `SELECT id, node_id, node_name, node_type, status,
                started_at, completed_at, duration_ms,
                input, output, error, retry_count
         FROM node_executions
         WHERE execution_id = $1
         ORDER BY started_at ASC`,
        [id]
      ),
    ]);

    if (!execResult.rows.length) return reply.code(404).send({ error: 'Execution not found' });

    return reply.send({
      execution: execResult.rows[0],
      nodes: nodeResult.rows,
    });
  });
}
