import { db } from '../db/client.js';
import { createExecution } from '../engine/logger.js';
import { subscribeExecution, unsubscribeExecution } from '../engine/events.js';
import { executionQueue } from '../queue/client.js';
import { randomUUID } from 'crypto';

async function enqueueManualExecution({ workflowId, workspaceId, input }) {
  const executionId = await createExecution({
    workflowId,
    workspaceId,
    triggerType: 'manual',
    input,
    status: 'pending',
  });

  await executionQueue.add('run', { executionId, workflowId, workspaceId, triggerType: 'manual', input });
  return executionId;
}

export async function executionRoutes(fastify) {
  fastify.post('/api/v1/execute', async (req, reply) => {
    const { definition, workflowId: savedWorkflowId, savedWorkflowId: altSavedWorkflowId, input = {}, name = 'Canvas Draft' } = req.body ?? {};
    const requestedWorkflowId = savedWorkflowId ?? altSavedWorkflowId;
    const { workspaceId } = req.auth;

    let workflowId;

    if (requestedWorkflowId) {
      const { rows } = await db.query(
        'SELECT id FROM workflows WHERE id = $1 AND workspace_id = $2',
        [requestedWorkflowId, workspaceId]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
      workflowId = rows[0].id;
    } else {
      if (!definition) return reply.code(400).send({ error: 'definition or savedWorkflowId is required' });
      workflowId = randomUUID();
      await db.query(
        `INSERT INTO workflows (id, workspace_id, name, definition, active)
         VALUES ($1, $2, $3, $4, false)`,
        [workflowId, workspaceId, name, JSON.stringify(definition)]
      );
    }

    const executionId = await enqueueManualExecution({ workflowId, workspaceId, input });
    return reply.send({ executionId, workflowId, status: 'pending' });
  });

  fastify.post('/api/v1/workflows/:id/execute', async (req, reply) => {
    const { id: workflowId } = req.params;
    const input = req.body?.input ?? req.body ?? {};

    const { rows } = await db.query(
      'SELECT id FROM workflows WHERE id = $1 AND workspace_id = $2',
      [workflowId, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    const executionId = await enqueueManualExecution({
      workflowId,
      workspaceId: req.auth.workspaceId,
      input,
    });

    return reply.send({ executionId, workflowId, status: 'pending' });
  });

  fastify.get('/api/v1/executions', async (req, reply) => {
    const { workflowId, status, page = 1, limit = 50 } = req.query;
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const parsedPage = Math.max(Number(page) || 1, 1);
    const offset = (parsedPage - 1) * parsedLimit;

    const conditions = ['workspace_id = $1'];
    const params = [req.auth.workspaceId];

    if (workflowId) {
      params.push(workflowId);
      conditions.push(`workflow_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');
    const countResult = await db.query(
      `SELECT COUNT(*)::INT AS total FROM executions WHERE ${whereClause}`,
      params
    );

    params.push(parsedLimit, offset);
    const { rows } = await db.query(
      `SELECT id, workflow_id, status, started_at, completed_at, trigger_type, error
       FROM executions
       WHERE ${whereClause}
       ORDER BY COALESCE(started_at, completed_at, NOW()) DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return reply.send({ executions: rows, total: countResult.rows[0]?.total ?? 0, page: parsedPage, limit: parsedLimit });
  });

  fastify.get('/api/v1/executions/:id/stream', async (req, reply) => {
    const { id } = req.params;

    const { rows: execRows } = await db.query(
      'SELECT id, status FROM executions WHERE id = $1 AND workspace_id = $2',
      [id, req.auth.workspaceId]
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

    const [snapExec, snapNodes] = await Promise.all([
      db.query('SELECT * FROM executions WHERE id = $1 AND workspace_id = $2', [id, req.auth.workspaceId]),
      db.query(
        `SELECT id, node_id, node_name, node_type, status, started_at, completed_at,
                duration_ms, input, output, error, retry_count, prompt_tokens,
                completion_tokens, total_tokens, model
         FROM node_executions WHERE execution_id = $1 ORDER BY started_at ASC`,
        [id]
      ),
    ]);
    send('snapshot', { execution: snapExec.rows[0], nodes: snapNodes.rows });

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

  fastify.get('/api/v1/executions/:id', async (req, reply) => {
    const { id } = req.params;

    const [execResult, nodeResult] = await Promise.all([
      db.query(
        'SELECT * FROM executions WHERE id = $1 AND workspace_id = $2',
        [id, req.auth.workspaceId]
      ),
      db.query(
        `SELECT id, node_id, node_name, node_type, status,
                started_at, completed_at, duration_ms,
                input, output, error, retry_count,
                prompt_tokens, completion_tokens, total_tokens, model
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
