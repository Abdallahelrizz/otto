/**
 * src/routes/mcp.js
 *
 * Otto MCP (Model Context Protocol) server endpoint.
 * Exposes Otto workflows to AI systems (Claude, etc.) via JSON-RPC 2.0.
 *
 * Register in src/server.js:
 *   import { mcpRoutes } from './routes/mcp.js';
 *   fastify.register(mcpRoutes);
 */

import { db } from '../db/client.js';
import { createExecution } from '../engine/logger.js';
import { executionQueue } from '../queue/client.js';
import { completeExecution } from '../engine/logger.js';

// ─── JSON-RPC helpers ────────────────────────────────────────────────────────

function ok(id, result) {
  return { jsonrpc: '2.0', result, id: id ?? null };
}

function err(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: '2.0', error, id: id ?? null };
}

// Standard JSON-RPC 2.0 error codes
const E_PARSE         = -32700; // unused — body parsing handled by Fastify
const E_INVALID_REQ   = -32600;
const E_METHOD        = -32601; // Method not found
const E_PARAMS        = -32602; // Invalid params
const E_INTERNAL      = -32603;
const E_AUTH          = -32001; // Custom: authentication required
const E_NOT_FOUND     = -32002; // Custom: resource not found

// ─── Tool catalogue ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_workflows',
    description:
      'List workflows in the workspace. Returns id, name, active status, and tags for each workflow.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of workflows to return (default 50, max 100).',
        },
        tag: {
          type: 'string',
          description: 'Filter workflows to those that include this tag.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'run_workflow',
    description:
      'Trigger a saved workflow by ID. Returns an executionId that can be polled with get_execution.',
    inputSchema: {
      type: 'object',
      required: ['workflowId'],
      properties: {
        workflowId: {
          type: 'string',
          description: 'UUID of the workflow to run.',
        },
        input: {
          type: 'object',
          description: 'Optional input payload passed as the trigger data for the workflow.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_execution',
    description:
      'Get the status and per-node results of an execution. Returns id, status, timestamps, optional error, and a nodes array.',
    inputSchema: {
      type: 'object',
      required: ['executionId'],
      properties: {
        executionId: {
          type: 'string',
          description: 'UUID of the execution to retrieve.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_executions',
    description:
      'List recent executions across all workflows, or scoped to a specific workflow. Supports optional status filter.',
    inputSchema: {
      type: 'object',
      properties: {
        workflowId: {
          type: 'string',
          description: 'Filter executions to this workflow UUID.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of executions to return (default 20, max 100).',
        },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'success', 'error', 'cancelled'],
          description: 'Filter by execution status.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'cancel_execution',
    description:
      'Cancel a running or pending execution. No-op if the execution is already in a terminal state.',
    inputSchema: {
      type: 'object',
      required: ['executionId'],
      properties: {
        executionId: {
          type: 'string',
          description: 'UUID of the execution to cancel.',
        },
      },
      additionalProperties: false,
    },
  },
];

const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

// ─── Tool handlers ───────────────────────────────────────────────────────────

async function handleListWorkflows(args, workspaceId) {
  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 100);
  const tag   = args.tag ?? null;

  const { rows } = await db.query(
    `SELECT id, name, active, tags
     FROM workflows
     WHERE workspace_id = $1 AND ($2::text IS NULL OR $2 = ANY(tags))
     ORDER BY updated_at DESC
     LIMIT $3`,
    [workspaceId, tag, limit]
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ workflows: rows }),
      },
    ],
  };
}

async function handleRunWorkflow(args, workspaceId) {
  const { workflowId, input = {} } = args;

  if (!workflowId || typeof workflowId !== 'string') {
    throw { code: E_PARAMS, message: 'workflowId is required and must be a string' };
  }

  const { rows } = await db.query(
    'SELECT id, definition FROM workflows WHERE id = $1 AND workspace_id = $2',
    [workflowId, workspaceId]
  );
  if (!rows.length) {
    throw { code: E_NOT_FOUND, message: `Workflow ${workflowId} not found` };
  }

  const { definition } = rows[0];

  const executionId = await createExecution({
    workflowId,
    workspaceId,
    triggerType: 'manual',
    input,
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
      triggerType: 'manual',
      input,
      definition,
      mode: 'full',
      nodeId: null,
      pinnedData: {},
    },
    { jobId: executionId }
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ executionId }),
      },
    ],
  };
}

async function handleGetExecution(args, workspaceId) {
  const { executionId } = args;

  if (!executionId || typeof executionId !== 'string') {
    throw { code: E_PARAMS, message: 'executionId is required and must be a string' };
  }

  // Fix: the child query previously read node rows by execution ID without workspace isolation.
  const [execResult, nodeResult] = await Promise.all([
    db.query(
      `SELECT id, workflow_id, status, started_at, completed_at, error
       FROM executions
       WHERE id = $1 AND workspace_id = $2`,
      [executionId, workspaceId]
    ),
    db.query(
      `SELECT node_id, node_name, status
       FROM node_executions
       WHERE execution_id = $1
         AND EXISTS (
           SELECT 1 FROM executions e
           WHERE e.id = node_executions.execution_id AND e.workspace_id = $2
         )
       ORDER BY started_at ASC`,
      [executionId, workspaceId]
    ),
  ]);

  if (!execResult.rows.length) {
    throw { code: E_NOT_FOUND, message: `Execution ${executionId} not found` };
  }

  const exec = execResult.rows[0];
  const result = {
    id: exec.id,
    workflowId: exec.workflow_id,
    status: exec.status,
    startedAt: exec.started_at,
    completedAt: exec.completed_at,
    nodes: nodeResult.rows.map((n) => ({
      nodeId: n.node_id,
      nodeName: n.node_name,
      status: n.status,
    })),
  };
  if (exec.error) result.error = exec.error;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result),
      },
    ],
  };
}

async function handleListExecutions(args, workspaceId) {
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);

  const conditions = ['workspace_id = $1'];
  const params = [workspaceId];

  if (args.workflowId) {
    params.push(args.workflowId);
    conditions.push(`workflow_id = $${params.length}`);
  }
  if (args.status) {
    params.push(args.status);
    conditions.push(`status = $${params.length}`);
  }

  params.push(limit);
  const { rows } = await db.query(
    `SELECT id, workflow_id, status, started_at
     FROM executions
     WHERE ${conditions.join(' AND ')}
     ORDER BY COALESCE(started_at, NOW()) DESC, id DESC
     LIMIT $${params.length}`,
    params
  );

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ executions: rows }),
      },
    ],
  };
}

async function handleCancelExecution(args, workspaceId) {
  const { executionId } = args;

  if (!executionId || typeof executionId !== 'string') {
    throw { code: E_PARAMS, message: 'executionId is required and must be a string' };
  }

  const { rows } = await db.query(
    `SELECT id, status
     FROM executions
     WHERE id = $1 AND workspace_id = $2`,
    [executionId, workspaceId]
  );

  if (!rows.length) {
    throw { code: E_NOT_FOUND, message: `Execution ${executionId} not found` };
  }

  const { status } = rows[0];

  // Already in a terminal state — return ok without modifying.
  if (['success', 'error', 'cancelled'].includes(status)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ok: true, status }),
        },
      ],
    };
  }

  // Remove from BullMQ queue if still pending/waiting.
  const job = await executionQueue.getJob(executionId);
  if (job) {
    const state = await job.getState();
    if (['waiting', 'delayed', 'prioritized'].includes(state)) {
      await job.remove();
    }
  }

  await completeExecution(executionId, { status: 'cancelled', error: 'Cancelled via MCP' });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ ok: true, status: 'cancelled' }),
      },
    ],
  };
}

// ─── Dispatch table ──────────────────────────────────────────────────────────

const TOOL_HANDLERS = new Map([
  ['list_workflows',   handleListWorkflows],
  ['run_workflow',     handleRunWorkflow],
  ['get_execution',    handleGetExecution],
  ['list_executions',  handleListExecutions],
  ['cancel_execution', handleCancelExecution],
]);

// ─── MCP method handlers ─────────────────────────────────────────────────────

function handleInitialize(params, id) {
  return ok(id, {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: {
      name: 'Otto Workflow Orchestrator',
      version: '0.1.0',
    },
  });
}

function handleToolsList(params, id) {
  return ok(id, { tools: TOOLS });
}

async function handleToolsCall(params, id, workspaceId) {
  const { name, arguments: args = {} } = params ?? {};

  if (!name || typeof name !== 'string') {
    return err(id, E_PARAMS, 'params.name is required');
  }

  const handler = TOOL_HANDLERS.get(name);
  if (!handler) {
    return err(id, E_PARAMS, `Invalid params: unknown tool "${name}"`);
  }

  try {
    const result = await handler(args, workspaceId);
    return ok(id, result);
  } catch (e) {
    // Structured throws from handlers carry code + message.
    if (e && typeof e.code === 'number') {
      return err(id, e.code, e.message);
    }
    // Fix: unexpected database/runtime messages were returned to MCP clients and could expose internals.
    return err(id, E_INTERNAL, 'Internal error');
  }
}

// ─── Fastify plugin ──────────────────────────────────────────────────────────

export async function mcpRoutes(fastify) {
  /**
   * POST /api/v1/mcp
   *
   * MCP JSON-RPC 2.0 endpoint. Always responds HTTP 200 with
   * Content-Type: application/json, even for JSON-RPC-level errors.
   */
  fastify.post('/api/v1/mcp', async (req, reply) => {
    reply.header('Content-Type', 'application/json');

    // Authentication check — req.auth is set by the global onRequest hook.
    if (!req.auth) {
      return reply.code(200).send(
        JSON.stringify(err(null, E_AUTH, 'Authentication required'))
      );
    }

    const { workspaceId } = req.auth;
    const { method, params = {}, id = null } = req.body ?? {};

    if (!method || typeof method !== 'string') {
      return reply.code(200).send(
        JSON.stringify(err(id, E_INVALID_REQ, 'method is required'))
      );
    }

    let response;

    switch (method) {
      case 'initialize':
        response = handleInitialize(params, id);
        break;

      case 'tools/list':
        response = handleToolsList(params, id);
        break;

      case 'tools/call':
        response = await handleToolsCall(params, id, workspaceId);
        break;

      default:
        response = err(id, E_METHOD, `Method not found: ${method}`);
    }

    return reply.code(200).send(JSON.stringify(response));
  });
}
