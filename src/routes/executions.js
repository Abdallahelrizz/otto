import { db } from '../db/client.js';
import { createExecution, completeExecution } from '../engine/logger.js';
import { subscribeExecution, unsubscribeExecution } from '../engine/events.js';
import { executionQueue } from '../queue/client.js';
import { randomUUID } from 'crypto';
import {
  hasBlockingIssues,
  scopeDefinitionForValidation,
  validateWorkflowDefinition,
} from '../utils/workflow-validation.js';
import { checkWorkspaceExecLimit, rateLimitReply } from '../middleware/rate-limit.js';

const EXECUTION_MODES = new Set(['full', 'single_node', 'to_node', 'from_node']);

function normalizeExecutionOptions(body = {}) {
  const mode = EXECUTION_MODES.has(body.mode) ? body.mode : 'full';
  return {
    mode,
    nodeId: body.nodeId ?? body.focusNodeId ?? null,
    pinnedData: body.pinnedData && typeof body.pinnedData === 'object' ? body.pinnedData : {},
  };
}

async function enqueueManualExecution({
  workflowId,
  workspaceId,
  input,
  definition,
  mode = 'full',
  nodeId = null,
  pinnedData = {},
}) {
  const executionId = await createExecution({
    workflowId,
    workspaceId,
    triggerType: 'manual',
    input,
    status: 'pending',
    mode,
    focusNodeId: nodeId,
    pinnedData,
  });

  await executionQueue.add(
    'run',
    { executionId, workflowId, workspaceId, triggerType: 'manual', input, definition, mode, nodeId, pinnedData },
    { jobId: executionId }
  );

  return executionId;
}

export async function executionRoutes(fastify) {
  fastify.post('/api/v1/execute', async (req, reply) => {
    const {
      definition,
      workflowId: savedWorkflowId,
      savedWorkflowId: altSavedWorkflowId,
      input = {},
      name = 'Canvas Draft',
    } = req.body ?? {};
    const requestedWorkflowId = savedWorkflowId ?? altSavedWorkflowId;
    const { workspaceId } = req.auth;

    const execLimit = checkWorkspaceExecLimit(workspaceId);
    if (!execLimit.allowed) return reply.code(429).send({ error: 'Execution rate limit exceeded. Try again shortly.' });

    const { mode, nodeId, pinnedData } = normalizeExecutionOptions(req.body);

    let workflowId;
    let runDefinition = definition;

    if (requestedWorkflowId) {
      const { rows } = await db.query(
        'SELECT id, definition FROM workflows WHERE id = $1 AND workspace_id = $2',
        [requestedWorkflowId, workspaceId]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
      workflowId = rows[0].id;
      runDefinition ??= rows[0].definition;
    } else {
      if (!definition) return reply.code(400).send({ error: 'definition or savedWorkflowId is required' });
      workflowId = randomUUID();
    }

    const validationDefinition = scopeDefinitionForValidation(runDefinition, { mode, nodeId });
    const validation = validateWorkflowDefinition(validationDefinition, { mode });
    if (hasBlockingIssues(validation)) {
      return reply.code(422).send({ error: 'Workflow has validation errors', details: validation.issues, validation });
    }

    if (!requestedWorkflowId) {
      await db.query(
        `INSERT INTO workflows (id, workspace_id, name, definition, active)
         VALUES ($1, $2, $3, $4, false)`,
        [workflowId, workspaceId, name, JSON.stringify(definition)]
      );
    }

    const executionId = await enqueueManualExecution({
      workflowId,
      workspaceId,
      input,
      definition: runDefinition,
      mode,
      nodeId,
      pinnedData,
    });

    return reply.send({ executionId, workflowId, status: 'pending', validation });
  });

  fastify.post('/api/v1/workflows/:id/execute', async (req, reply) => {
    const { id: workflowId } = req.params;
    const input = req.body?.input ?? {};
    const { mode, nodeId, pinnedData } = normalizeExecutionOptions(req.body);

    const execLimit = checkWorkspaceExecLimit(req.auth.workspaceId);
    if (!execLimit.allowed) return reply.code(429).send({ error: 'Execution rate limit exceeded. Try again shortly.' });

    const { rows } = await db.query(
      'SELECT id, definition FROM workflows WHERE id = $1 AND workspace_id = $2',
      [workflowId, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    const validationDefinition = scopeDefinitionForValidation(rows[0].definition, { mode, nodeId });
    const validation = validateWorkflowDefinition(validationDefinition, { mode });
    if (hasBlockingIssues(validation)) {
      return reply.code(422).send({ error: 'Workflow has validation errors', details: validation.issues, validation });
    }

    const executionId = await enqueueManualExecution({
      workflowId,
      workspaceId: req.auth.workspaceId,
      input,
      definition: rows[0].definition,
      mode,
      nodeId,
      pinnedData,
    });

    return reply.send({ executionId, workflowId, status: 'pending', validation });
  });

  fastify.post('/api/v1/executions/:id/cancel', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT id, status
       FROM executions
       WHERE id = $1 AND workspace_id = $2`,
      [id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Execution not found' });
    if (['success', 'error', 'cancelled'].includes(rows[0].status)) {
      return reply.send({ ok: true, status: rows[0].status });
    }

    const job = await executionQueue.getJob(id);
    if (job) {
      const state = await job.getState();
      if (['waiting', 'delayed', 'prioritized'].includes(state)) await job.remove();
    }

    await completeExecution(id, { status: 'cancelled', error: 'Cancelled by user' });
    return reply.send({ ok: true, status: 'cancelled' });
  });

  fastify.post('/api/v1/executions/:id/retry', async (req, reply) => {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT id, workflow_id, input, mode, focus_node_id, pinned_data
       FROM executions
       WHERE id = $1 AND workspace_id = $2`,
      [id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Execution not found' });

    const original = rows[0];
    const workflowResult = await db.query(
      'SELECT id, definition FROM workflows WHERE id = $1 AND workspace_id = $2',
      [original.workflow_id, req.auth.workspaceId]
    );
    if (!workflowResult.rows.length) return reply.code(404).send({ error: 'Workflow not found' });

    const executionId = await enqueueManualExecution({
      workflowId: original.workflow_id,
      workspaceId: req.auth.workspaceId,
      input: original.input ?? {},
      definition: workflowResult.rows[0].definition,
      mode: original.mode ?? 'full',
      nodeId: original.focus_node_id ?? null,
      pinnedData: original.pinned_data ?? {},
    });

    return reply.send({ executionId, workflowId: original.workflow_id, status: 'pending' });
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
      `SELECT id, workflow_id, status, started_at, completed_at, trigger_type,
              mode, focus_node_id, error
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
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
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
