import { parseDAG } from './dag.js';
import { logNodeStart, logNodeEnd, logNodeSkipped, createExecution, completeExecution } from './logger.js';
import { getCredential } from './credentials.js';
import { resolveConfig } from './expressions.js';
import { getNodeHandler } from '../nodes/index.js';
import { SKIP } from './skip.js';
import { emitExecutionEvent } from './events.js';

/**
 * Run a workflow definition to completion.
 *
 * @param {object} opts
 * @param {string} opts.workflowId
 * @param {string} opts.workspaceId
 * @param {object} opts.definition  — workflow JSONB { nodes, edges }
 * @param {object} opts.input       — trigger payload
 * @param {string} opts.triggerType — 'webhook' | 'manual' | 'schedule'
 * @returns {Promise<{ executionId: string, outputs: Map<string,any> }>}
 */
/**
 * Fire-and-forget variant used by the canvas.
 * Creates the execution record immediately (so the ID can be returned to the
 * browser), then runs the workflow in the background without blocking.
 */
export async function fireWorkflow({ workflowId, workspaceId, definition, input, triggerType }) {
  const executionId = await createExecution({ workflowId, triggerType, input });
  emitExecutionEvent(executionId, 'execution:start', { workflowId, triggerType });

  setImmediate(async () => {
    try {
      const dag = parseDAG(definition);
      await executeDAG(dag, { executionId, workspaceId, workflowId, triggerInput: input });
      await completeExecution(executionId, { status: 'success' });
      emitExecutionEvent(executionId, 'execution:end', { status: 'success' });
    } catch (err) {
      await completeExecution(executionId, { status: 'error', error: err.message });
      emitExecutionEvent(executionId, 'execution:end', { status: 'error', error: err.message });
    }
  });

  return executionId;
}

export async function runWorkflow({ workflowId, workspaceId, definition, input, triggerType }) {
  const executionId = await createExecution({ workflowId, triggerType, input });
  emitExecutionEvent(executionId, 'execution:start', { workflowId, triggerType });

  try {
    const dag = parseDAG(definition);
    const outputs = await executeDAG(dag, { executionId, workspaceId, workflowId, triggerInput: input });
    await completeExecution(executionId, { status: 'success' });
    emitExecutionEvent(executionId, 'execution:end', { status: 'success' });
    return { executionId, outputs };
  } catch (err) {
    await completeExecution(executionId, { status: 'error', error: err.message });
    emitExecutionEvent(executionId, 'execution:end', { status: 'error', error: err.message });
    throw err;
  }
}

/**
 * Execute all nodes in the DAG with true parallelism.
 *
 * Uses a "pull" model: each node's promise is memoized and awaits its
 * dependencies via Promise.all(). Nodes with no shared dependencies fire
 * simultaneously — no serialization unless there is a data dependency.
 */
async function executeDAG(dag, ctx) {
  // memoized promise per node — ensures each node executes exactly once
  const nodePromises = new Map();

  function getOutput(nodeId) {
    if (nodePromises.has(nodeId)) return nodePromises.get(nodeId);

    const promise = (async () => {
      const node = dag.nodes.get(nodeId);
      const deps = dag.inEdges.get(nodeId) ?? [];

      // Wait for all direct dependencies in parallel — this is where Promise.all() happens.
      // Independent subgraphs resolve this concurrently with no coordination overhead.
      const depResults = await Promise.all(deps.map(async dep => ({
        source: dep.source,
        sourceHandle: dep.sourceHandle,
        value: await getOutput(dep.source),
      })));

      // Build a nodes context so {{ nodes.nodeId.field }} expressions resolve correctly
      const nodesCtx = {};
      for (const dep of depResults) {
        if (dep.value !== SKIP) nodesCtx[dep.source] = dep.value;
      }

      // Collect this node's merged input from dependency outputs.
      // Nodes with no incoming edges are trigger nodes — feed them the trigger payload.
      const { input, rawInputs, skipped } = deps.length === 0
        ? { input: ctx.triggerInput, rawInputs: [], skipped: false }
        : collectInput(depResults);

      if (skipped) {
        await logNodeSkipped({ executionId: ctx.executionId, nodeId, nodeName: node.name, nodeType: node.type });
        emitExecutionEvent(ctx.executionId, 'node:skipped', { nodeId, nodeType: node.type, nodeName: node.name });
        return SKIP;
      }

      return runNode(node, input, rawInputs, { ...ctx, nodesCtx });
    })();

    nodePromises.set(nodeId, promise);
    return promise;
  }

  // Kick off all nodes. Each pulls its own dependencies recursively.
  // Nodes with no predecessors (triggers) start immediately.
  await Promise.all([...dag.nodes.keys()].map(id => getOutput(id)));

  return nodePromises;
}

/**
 * Merge outputs from predecessor nodes into a single input object.
 * Returns { input, rawInputs, skipped }.
 *
 * rawInputs: [{ source: nodeId, data: object }] — one entry per active predecessor.
 * Used by the Merge node's collect-array mode; all other nodes ignore it.
 */
function collectInput(depResults) {
  if (depResults.length === 0) return { input: {}, rawInputs: [], skipped: false };

  const activeInputs = [];
  const rawInputs = [];

  for (const dep of depResults) {
    const raw = dep.value;

    if (raw === SKIP) continue;

    let resolved;

    // IF node outputs have a sourceHandle ('true' or 'false') pointing to a branch
    if (dep.sourceHandle && typeof raw === 'object' && raw !== null && '_ifBranches' in raw) {
      const branch = raw._ifBranches[dep.sourceHandle];
      if (branch === SKIP || branch === undefined) continue;
      resolved = branch;
    } else {
      resolved = raw;
    }

    activeInputs.push(resolved);
    rawInputs.push({ source: dep.source, data: resolved });
  }

  if (activeInputs.length === 0) return { input: null, rawInputs: [], skipped: true };

  // Merge all active inputs — later sources overwrite earlier ones on key conflict
  const merged = Object.assign({}, ...activeInputs);
  return { input: merged, rawInputs, skipped: false };
}

async function runNode(node, input, rawInputs, ctx) {
  const { executionId, workspaceId, nodesCtx = {} } = ctx;
  const expressionCtx = { input, nodes: nodesCtx };

  const resolvedConfig = resolveConfig(node.config ?? {}, expressionCtx);

  let credential = null;
  if (resolvedConfig.credentialId) {
    credential = await getCredential(resolvedConfig.credentialId, {
      workflowId: ctx.workflowId,
      nodeId: node.id,
    });
  }

  const logId = await logNodeStart({
    executionId,
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
    input,
  });

  emitExecutionEvent(executionId, 'node:start', { nodeId: node.id, nodeType: node.type, nodeName: node.name });

  try {
    const handler = getNodeHandler(node.type);
    const output = await handler({ input, rawInputs, config: resolvedConfig, credential, workspaceId });

    // Extract token usage from LLM-style outputs (llm_call, ai_agent)
    const usage = output?.usage ?? null;
    const model  = output?.model ?? null;

    await logNodeEnd(logId, { status: 'success', output, usage, model });
    emitExecutionEvent(executionId, 'node:end', {
      nodeId: node.id, nodeType: node.type, nodeName: node.name,
      status: 'success', usage, model,
    });
    return output;
  } catch (err) {
    await logNodeEnd(logId, { status: 'error', error: err.message });
    emitExecutionEvent(executionId, 'node:end', {
      nodeId: node.id, nodeType: node.type, nodeName: node.name,
      status: 'error', error: err.message,
    });
    throw err;
  }
}

