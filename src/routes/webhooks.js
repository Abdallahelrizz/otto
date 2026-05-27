import { db } from '../db/client.js';
import { createExecution } from '../engine/logger.js';
import { executionQueue } from '../queue/client.js';
import {
  buildChatInput,
  buildFormInput,
  buildTriggerInput,
  chatResponse,
  formResponse,
  methodMatches,
  normalizeTriggerPath,
  renderFormHtml,
  webhookResponse,
} from '../triggers/runtime.js';

const TRIGGER_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export async function webhookRoutes(fastify) {
  fastify.route({
    method: TRIGGER_METHODS,
    url: '/webhooks/:path',
    handler: (req, reply) => handleWebhook(req, reply, { mode: 'production' }),
  });

  fastify.route({
    method: TRIGGER_METHODS,
    url: '/webhooks-test/:workflowId/:path',
    handler: (req, reply) => handleWebhook(req, reply, { mode: 'test' }),
  });

  fastify.get('/forms/:path', async (req, reply) => handleFormRender(req, reply, { mode: 'production' }));
  fastify.get('/forms-test/:workflowId/:path', async (req, reply) => handleFormRender(req, reply, { mode: 'test' }));
  fastify.post('/forms/:path', async (req, reply) => handleFormSubmit(req, reply, { mode: 'production' }));
  fastify.post('/forms-test/:workflowId/:path', async (req, reply) => handleFormSubmit(req, reply, { mode: 'test' }));

  fastify.post('/chat/:path', async (req, reply) => handleChatSubmit(req, reply, { mode: 'production' }));
  fastify.post('/chat-test/:workflowId/:path', async (req, reply) => handleChatSubmit(req, reply, { mode: 'test' }));

  fastify.get('/api/v1/triggers/samples/:workflowId/:nodeId', async (req, reply) => {
    const { workflowId, nodeId } = req.params;
    try {
      const { rows } = await db.query(
        `SELECT node_id, trigger_type, payload, received_at
         FROM trigger_samples
         WHERE workflow_id = $1 AND node_id = $2 AND workspace_id = $3`,
        [workflowId, nodeId, req.auth.workspaceId]
      );
      return reply.send({ sample: rows[0] ?? null });
    } catch (err) {
      if (err.code === '42P01') return reply.send({ sample: null });
      throw err;
    }
  });
}

async function handleWebhook(req, reply, { mode }) {
  const path = normalizeTriggerPath(req.params.path);
  const match = await findTrigger({
    type: 'webhook_trigger',
    path,
    method: req.method,
    mode,
    workflowId: req.params.workflowId,
  });
  if (!match) return reply.code(404).send({ error: 'No matching webhook trigger found' });

  const input = buildTriggerInput({
    req,
    triggerType: 'webhook',
    workflowId: match.workflow.id,
    node: match.node,
    path,
    mode,
  });
  const executionId = await enqueueTriggerExecution({ match, triggerType: 'webhook', input });
  await saveTriggerSample({
    workflowId: match.workflow.id,
    workspaceId: match.workflow.workspace_id,
    nodeId: match.node.id,
    triggerType: 'webhook',
    payload: input,
  });

  const response = webhookResponse(match.node.config ?? {}, { workflowId: match.workflow.id, executionId });
  if (response.body == null) return reply.code(response.statusCode).send();
  return reply.code(response.statusCode).send(response.body);
}

async function handleFormRender(req, reply, { mode }) {
  const path = normalizeTriggerPath(req.params.path);
  const match = await findTrigger({
    type: 'form_trigger',
    path,
    method: 'GET',
    mode,
    workflowId: req.params.workflowId,
  });
  if (!match) return reply.code(404).send({ error: 'No matching form trigger found' });

  const action = mode === 'test'
    ? `/forms-test/${match.workflow.id}/${path}`
    : `/forms/${path}`;
  reply.header('Content-Type', 'text/html; charset=utf-8');
  return reply.send(renderFormHtml(match.node.config ?? {}, { action }));
}

async function handleFormSubmit(req, reply, { mode }) {
  const path = normalizeTriggerPath(req.params.path);
  const match = await findTrigger({
    type: 'form_trigger',
    path,
    method: 'POST',
    mode,
    workflowId: req.params.workflowId,
  });
  if (!match) return reply.code(404).send({ error: 'No matching form trigger found' });

  const input = buildFormInput({ req, workflowId: match.workflow.id, node: match.node, path, mode });
  const executionId = await enqueueTriggerExecution({ match, triggerType: 'form', input });
  await saveTriggerSample({
    workflowId: match.workflow.id,
    workspaceId: match.workflow.workspace_id,
    nodeId: match.node.id,
    triggerType: 'form',
    payload: input,
  });

  const response = formResponse(match.node.config ?? {}, { workflowId: match.workflow.id, executionId });
  if (String(req.headers.accept ?? '').includes('text/html')) {
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.code(response.statusCode).send(response.html);
  }
  return reply.code(response.statusCode).send(response.body);
}

async function handleChatSubmit(req, reply, { mode }) {
  const path = normalizeTriggerPath(req.params.path);
  const match = await findTrigger({
    type: 'chat_trigger',
    path,
    method: 'POST',
    mode,
    workflowId: req.params.workflowId,
  });
  if (!match) return reply.code(404).send({ error: 'No matching chat trigger found' });

  const input = buildChatInput({ req, workflowId: match.workflow.id, node: match.node, path, mode });
  const executionId = await enqueueTriggerExecution({ match, triggerType: 'chat', input });
  await saveTriggerSample({
    workflowId: match.workflow.id,
    workspaceId: match.workflow.workspace_id,
    nodeId: match.node.id,
    triggerType: 'chat',
    payload: input,
  });

  const response = chatResponse(match.node.config ?? {}, {
    workflowId: match.workflow.id,
    executionId,
    sessionId: input.sessionId,
  });
  return reply.code(response.statusCode).send(response.body);
}

async function findTrigger({ type, path, method, mode, workflowId }) {
  if (mode === 'test') {
    const { rows } = await db.query(
      'SELECT id, workspace_id, definition FROM workflows WHERE id = $1',
      [workflowId]
    );
    if (!rows.length) return null;
    const node = findDefinitionTrigger(rows[0].definition, { type, path, method });
    return node ? { workflow: rows[0], node } : null;
  }

  const { rows } = await db.query(
    `SELECT w.id, w.workspace_id, w.definition, node AS trigger_node
     FROM workflows w,
          jsonb_array_elements(w.definition->'nodes') node
     WHERE w.active = true
       AND node->>'type' = $1
       AND node->'config'->>'path' = $2
     LIMIT 20`,
    [type, path]
  );

  const row = rows.find((item) => methodMatches(item.trigger_node?.config?.method, method));
  if (!row) return null;
  return {
    workflow: { id: row.id, workspace_id: row.workspace_id, definition: row.definition },
    node: row.trigger_node,
  };
}

function findDefinitionTrigger(definition, { type, path, method }) {
  return (definition?.nodes ?? []).find((node) => (
    node.type === type
    && pathMatches(node.config?.path, path)
    && methodMatches(node.config?.method, method)
  )) ?? null;
}

function pathMatches(candidate, expected) {
  try {
    return normalizeTriggerPath(candidate) === expected;
  } catch {
    return false;
  }
}

async function enqueueTriggerExecution({ match, triggerType, input }) {
  const executionId = await createExecution({
    workflowId: match.workflow.id,
    workspaceId: match.workflow.workspace_id,
    triggerType,
    input,
    status: 'pending',
  });

  await executionQueue.add(
    'run',
    {
      executionId,
      workflowId: match.workflow.id,
      workspaceId: match.workflow.workspace_id,
      triggerType,
      input,
      definition: match.workflow.definition,
    },
    { jobId: executionId }
  );

  return executionId;
}

async function saveTriggerSample({ workflowId, workspaceId, nodeId, triggerType, payload }) {
  try {
    await db.query(
      `INSERT INTO trigger_samples (workflow_id, workspace_id, node_id, trigger_type, payload, received_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (workflow_id, node_id)
       DO UPDATE SET trigger_type = EXCLUDED.trigger_type,
                     payload = EXCLUDED.payload,
                     received_at = NOW()`,
      [workflowId, workspaceId, nodeId, triggerType, JSON.stringify(payload ?? {})]
    );
  } catch (err) {
    if (err.code === '42P01') {
      console.warn('[triggers] trigger_samples table missing; run migrations to persist samples');
      return;
    }
    throw err;
  }
}
