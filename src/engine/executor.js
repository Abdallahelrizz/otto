import { parseDAG } from './dag.js';
import { logNodeStart, logNodeEnd, logNodeSkipped, logNodeWait, createExecution, startExecution, completeExecution, suspendExecution, deleteExecution } from './logger.js';
import { randomUUID } from 'crypto';
import { getCredential } from './credentials.js';
import { resolveConfig } from './expressions.js';
import { getNodeHandler } from '../nodes/index.js';
import { SKIP } from './skip.js';
import { db } from '../db/client.js';
import { isWaitDescriptor } from './wait.js';
import { emitExecutionEvent } from './events.js';
import { executionQueue } from '../queue/client.js';
import { redactObject, redactString, credentialSecrets } from '../utils/redact.js';
import { withSpan } from '../utils/otel.js';

const EXECUTION_MODES = new Set(['full', 'single_node', 'to_node', 'from_node']);

function getExecutionType(triggerType) {
  if (triggerType === 'manual') return 'manual';
  if (triggerType === 'api') return 'api';
  if (triggerType === 'resume') return 'resume';
  if (triggerType === 'error_workflow') return 'error_workflow';
  if (triggerType === 'schedule') return 'scheduled';
  if (triggerType === 'sub_workflow') return 'sub_workflow';
  if (triggerType === 'test') return 'test';
  return 'production'; // webhook, form, chat, unknown → production
}

// Trigger types that are always saved regardless of workflow save settings.
const ALWAYS_SAVE_TRIGGER_TYPES = new Set(['error_workflow', 'resume']);

/**
 * Returns true if the execution should be deleted after completion based on
 * the workflow's save settings.  Only acts when a setting is EXPLICITLY false;
 * undefined/null/missing defaults to saving (returns false).
 */
function shouldDeleteExecution({ settings, status, triggerType }) {
  // Certain system-level trigger types are always persisted.
  if (ALWAYS_SAVE_TRIGGER_TYPES.has(triggerType)) return false;

  // Manual-trigger check takes priority over success/failure check.
  if (triggerType === 'manual' && settings?.saveManualExecutions === false) return true;

  if (status === 'success' && settings?.saveSuccessfulExecutions === false) return true;
  if (status === 'error' && settings?.saveFailedExecutions === false) return true;

  return false;
}

class WaitSignal extends Error {
  constructor(nodeId, descriptor) {
    super(`Workflow waiting at node "${nodeId}"`);
    this.name = 'WaitSignal';
    this.nodeId = nodeId;
    this.descriptor = descriptor;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

function errorName(err) {
  return err instanceof Error ? err.name : 'Error';
}

/**
 * Run a workflow definition to completion.
 *
 * mode:
 * - full: run the full workflow
 * - single_node: run only nodeId with the provided input
 * - to_node: run all ancestors of nodeId and nodeId
 * - from_node: run nodeId with the provided input, then its descendants
 */
export async function runWorkflow({
  executionId: existingExecutionId,
  workflowId,
  workspaceId,
  definition,
  input,
  triggerType,
  mode = 'full',
  nodeId = null,
  pinnedData = {},
  recursionDepth = 0,
  parentExecutionId = null,
  parentNodeId = null,
}) {
  const executionMode = EXECUTION_MODES.has(mode) ? mode : 'full';
  const scopedDefinition = selectExecutionDefinition(definition, { mode: executionMode, nodeId });
  const executionId = existingExecutionId
    ?? await createExecution({
      workflowId,
      workspaceId,
      triggerType,
      executionType: getExecutionType(triggerType),
      input,
      status: 'running',
      mode: executionMode,
      focusNodeId: nodeId,
      pinnedData,
      parentExecutionId,
      parentNodeId,
    });

  if (existingExecutionId) await startExecution(existingExecutionId);
  emitExecutionEvent(executionId, 'execution:start', { workflowId, triggerType, mode: executionMode, nodeId });

  return withSpan('workflow.run', {
    'workflow.id': workflowId,
    'workflow.trigger_type': triggerType ?? 'manual',
    'execution.id': executionId,
  }, async (span) => {
    try {
      const dag = parseDAG(scopedDefinition);
      const timeoutSeconds = definition?.settings?.timeoutSeconds;
      // Fetch workspace variables once per execution and share them with every
      // node, instead of re-querying Postgres inside each node (one WAN round
      // trip per node on remote Postgres).
      const vars = await fetchWorkspaceVariables(workspaceId);
      const dagPromise = executeDAG(dag, {
        executionId,
        workspaceId,
        workflowId,
        triggerInput: input,
        pinnedData,
        recursionDepth,
        vars,
      });
      const outputs = (timeoutSeconds > 0)
        ? await Promise.race([
            dagPromise,
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error(`Workflow exceeded timeout of ${timeoutSeconds}s`)),
                timeoutSeconds * 1000,
              )
            ),
          ])
        : await dagPromise;
      if (outputs?.waited) {
        const { waitNodeId, waitDescriptor, nodeOutputs } = outputs;
        const resumeToken = randomUUID().replace(/-/g, '');
        const waitUntil = waitDescriptor.waitType === 'time'
          ? new Date(Date.now() + waitDescriptor.durationSeconds * 1000)
          : null;
        await suspendExecution(executionId, { waitNodeId, waitType: waitDescriptor.waitType, waitUntil, resumeToken, nodeOutputs });
        emitExecutionEvent(executionId, 'execution:wait', { waitNodeId, waitType: waitDescriptor.waitType });
        if (waitDescriptor.waitType === 'time') {
          await executionQueue.add('resume', {
            executionId,
            workflowId,
            workspaceId,
            mode: 'from_node',
            nodeId: waitNodeId,
            pinnedData: { ...nodeOutputs, [waitNodeId]: { resumed: true, waitType: 'time', resumedAt: waitUntil.toISOString() } },
            triggerType: 'resume',
          }, { delay: waitDescriptor.durationSeconds * 1000 });
        }
        return { executionId, waited: true };
      }
      if (shouldDeleteExecution({ settings: definition?.settings, status: 'success', triggerType })) {
        await deleteExecution(executionId);
        emitExecutionEvent(executionId, 'execution:end', { status: 'success', saved: false });
      } else {
        await completeExecution(executionId, { status: 'success' });
        emitExecutionEvent(executionId, 'execution:end', { status: 'success' });
      }
      return { executionId, outputs };
    } catch (err) {
      const message = errorMessage(err);
      if (shouldDeleteExecution({ settings: definition?.settings, status: 'error', triggerType })) {
        await deleteExecution(executionId);
        emitExecutionEvent(executionId, 'execution:end', { status: 'error', error: message, saved: false });
      } else {
        await completeExecution(executionId, { status: 'error', error: message });
        emitExecutionEvent(executionId, 'execution:end', { status: 'error', error: message });
      }

      const errorWorkflowId = definition?.settings?.errorWorkflowId;
      if (errorWorkflowId) {
        try {
          const failureContext = {
            failedWorkflowId: workflowId,
            failedExecutionId: executionId,
            errorMessage: message,
            triggerType,
            mode: executionMode,
          };
          await executionQueue.add('execute', {
            workflowId: errorWorkflowId,
            workspaceId,
            triggerType: 'error_workflow',
            input: failureContext,
          });
        } catch (dispatchErr) {
          // swallow — do not break original error path
        }
      }

      throw err;
    }
  });
}

async function executeDAG(dag, ctx) {
  const nodePromises = new Map();
  const outputValues = new Map();
  const pinnedData = ctx.pinnedData && typeof ctx.pinnedData === 'object' ? ctx.pinnedData : {};
  const hasPinned = (nodeId) => Object.prototype.hasOwnProperty.call(pinnedData, nodeId);

  function getOutput(nodeId) {
    if (nodePromises.has(nodeId)) return nodePromises.get(nodeId);

    const promise = (async () => {
      const node = dag.nodes.get(nodeId);
      if (!node) throw new Error(`Node "${nodeId}" not found`);

      if (hasPinned(nodeId)) {
        const output = pinnedData[nodeId];
        const logId = await logNodeStart({
          executionId: ctx.executionId,
          nodeId,
          nodeName: node.name,
          nodeType: node.type,
          input: { pinned: true },
        });
        emitExecutionEvent(ctx.executionId, 'node:start', {
          nodeId,
          nodeType: node.type,
          nodeName: node.name,
          pinned: true,
        });
        await logNodeEnd(logId, { status: 'success', output });
        emitExecutionEvent(ctx.executionId, 'node:end', {
          nodeId,
          nodeType: node.type,
          nodeName: node.name,
          status: 'success',
          pinned: true,
        });
        outputValues.set(nodeId, output);
        return output;
      }

      const deps = dag.inEdges.get(nodeId) ?? [];
      const depResults = await Promise.all(deps.map(async dep => ({
        source: dep.source,
        sourceHandle: dep.sourceHandle,
        value: await getOutput(dep.source),
      })));

      const nodesCtx = buildNodesContext(dag, outputValues);

      const { input, rawInputs, skipped } = deps.length === 0
        ? { input: ctx.triggerInput, rawInputs: [], skipped: false }
        : collectInput(depResults);

      if (skipped) {
        await logNodeSkipped({ executionId: ctx.executionId, nodeId, nodeName: node.name, nodeType: node.type });
        emitExecutionEvent(ctx.executionId, 'node:skipped', { nodeId, nodeType: node.type, nodeName: node.name });
        outputValues.set(nodeId, SKIP);
        return SKIP;
      }

      if (node.disabled) {
        await logNodeSkipped({ executionId: ctx.executionId, nodeId, nodeName: node.name, nodeType: node.type });
        emitExecutionEvent(ctx.executionId, 'node:skipped', { nodeId, nodeType: node.type, nodeName: node.name, disabled: true });
        const output = input ?? {};
        outputValues.set(nodeId, output);
        return output;
      }

      const output = await runNode(node, input, rawInputs, { ...ctx, nodesCtx });
      outputValues.set(nodeId, output);
      return output;
    })();

    nodePromises.set(nodeId, promise);
    return promise;
  }

  const results = await Promise.allSettled([...dag.nodes.keys()].map(id => getOutput(id)));
  const waitHit = results.find(r => r.status === 'rejected' && r.reason instanceof WaitSignal);
  if (waitHit) {
    const signal = waitHit.reason;
    const serialized = {};
    for (const [id, val] of outputValues) {
      if (val !== SKIP) serialized[id] = val;
    }
    return { waited: true, waitNodeId: signal.nodeId, waitDescriptor: signal.descriptor, nodeOutputs: serialized };
  }
  const firstError = results.find(r => r.status === 'rejected');
  if (firstError) throw firstError.reason;
  return nodePromises;
}

function selectExecutionDefinition(definition, { mode, nodeId }) {
  if (!definition || !Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
    throw new Error('Workflow definition must contain nodes and edges arrays');
  }

  if (mode === 'full') return definition;
  if (!nodeId) throw new Error(`Execution mode "${mode}" requires nodeId`);

  const allNodeIds = new Set(definition.nodes.map((node) => node.id));
  if (!allNodeIds.has(nodeId)) throw new Error(`Node "${nodeId}" not found in workflow`);

  const incoming = new Map([...allNodeIds].map((id) => [id, []]));
  const outgoing = new Map([...allNodeIds].map((id) => [id, []]));

  for (const edge of definition.edges) {
    if (!allNodeIds.has(edge.source) || !allNodeIds.has(edge.target)) continue;
    incoming.get(edge.target).push(edge.source);
    outgoing.get(edge.source).push(edge.target);
  }

  const selected = new Set([nodeId]);
  const visit = (id, direction) => {
    const nextIds = direction === 'incoming' ? incoming.get(id) : outgoing.get(id);
    for (const nextId of nextIds ?? []) {
      if (selected.has(nextId)) continue;
      selected.add(nextId);
      visit(nextId, direction);
    }
  };

  if (mode === 'to_node') visit(nodeId, 'incoming');
  if (mode === 'from_node') visit(nodeId, 'outgoing');

  return {
    ...definition,
    nodes: definition.nodes.filter((node) => selected.has(node.id)),
    edges: mode === 'single_node'
      ? []
      : definition.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)),
  };
}

function collectInput(depResults) {
  if (depResults.length === 0) return { input: {}, rawInputs: [], skipped: false };

  const activeInputs = [];
  const rawInputs = [];

  for (const dep of depResults) {
    const raw = dep.value;

    if (raw === SKIP) continue;

    let resolved;

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

  return { input: Object.assign({}, ...activeInputs), rawInputs, skipped: false };
}

// Fetch + coerce all workspace variables for a run. Called once per execution
// (hoisted into ctx by runWorkflow) and reused by every node. Workspace
// variables are config — only routes/variables.js writes them, never a node
// mid-run — so one fetch per run is semantically identical to one per node.
async function fetchWorkspaceVariables(workspaceId) {
  if (!workspaceId) return {};
  try {
    const { rows: varRows } = await db.query(
      'SELECT name, value, type FROM variables WHERE workspace_id = $1',
      [workspaceId]
    );
    return Object.fromEntries(varRows.map(r => [
      r.name,
      r.type === 'number' ? Number(r.value)
        : r.type === 'boolean' ? r.value === 'true'
        : r.type === 'json' ? JSON.parse(r.value)
        : r.value,
    ]));
  } catch {
    // Non-fatal: variables unavailable (e.g. migration not yet applied)
    return {};
  }
}

async function runNode(node, input, rawInputs, ctx) {
  const { executionId, workspaceId, nodesCtx = {} } = ctx;

  return withSpan('node.execute', {
    'node.id': node.id,
    'node.type': node.type,
    'node.name': node.label ?? node.name ?? node.type,
    'workflow.id': ctx.workflowId,
    'execution.id': executionId,
  }, async (span) => {
    // Use the variables fetched once per execution (ctx.vars). Fall back to a
    // per-node fetch only for direct callers that don't supply it (e.g. tests),
    // preserving the original behavior exactly for those paths.
    const vars = ctx.vars ?? await fetchWorkspaceVariables(workspaceId);

    const expressionCtx = {
      input,
      rawInputs,
      nodes: nodesCtx,
      vars,
      currentNode: { id: node.id, name: node.name, type: node.type },
    };

    const resolvedConfig = resolveConfig(node.config ?? {}, expressionCtx);

    let credential = null;
    if (resolvedConfig.credentialId) {
      credential = await getCredential(resolvedConfig.credentialId, {
        workflowId: ctx.workflowId,
        nodeId: node.id,
        workspaceId,
      });
    }

    const logId = randomUUID();
    const logPromise = logNodeStart({
      id: logId,
      executionId,
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      input,
    });

    emitExecutionEvent(executionId, 'node:start', { nodeId: node.id, nodeType: node.type, nodeName: node.name });

    try {
      const handler = getNodeHandler(node.type);
      const maxTries = node.retryOnFail
        ? clampInt(node.maxTries ?? node.retryAttempts, 2, 1, 10)
        : 1;
      const retryDelayMs = node.retryOnFail
        ? clampInt(node.retryDelayMs ?? node.waitBetweenTries, 1000, 0, 60_000)
        : 0;
      let retryCount = 0;
      let output;

      for (let attempt = 1; attempt <= maxTries; attempt += 1) {
        try {
          output = await handler({
            input,
            rawInputs,
            config: resolvedConfig,
            credential,
            workspaceId,
            ctx: {
              executionId: ctx.executionId,
              workflowId: ctx.workflowId,
              nodeId: node.id,
              recursionDepth: ctx.recursionDepth ?? 0,
            },
          });
          break;
        } catch (err) {
          if (attempt >= maxTries) throw err;
          retryCount = attempt;
          const message = errorMessage(err);
          emitExecutionEvent(executionId, 'node:retry', {
            nodeId: node.id,
            nodeType: node.type,
            nodeName: node.name,
            attempt,
            maxTries,
            error: message,
          });
          if (retryDelayMs > 0) await sleep(retryDelayMs);
        }
      }

      if (isWaitDescriptor(output)) {
        await logPromise.catch(() => null);
        await logNodeWait(logId, { waitType: output.waitType });
        emitExecutionEvent(executionId, 'node:wait', {
          nodeId: node.id, nodeType: node.type, nodeName: node.name, waitType: output.waitType,
        });
        throw new WaitSignal(node.id, output);
      }

      if (node.alwaysOutputData && output == null) {
        output = input ?? {};
      }

      const usage = output?.usage ?? null;
      const model = output?.model ?? null;

      await logPromise.catch(() => null);

      const safeOutput = redactObject(output);
      await logNodeEnd(logId, { status: 'success', output: safeOutput, retryCount, usage, model });
      emitExecutionEvent(executionId, 'node:end', {
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        status: 'success',
        output: safeOutput,
        usage,
        model,
      });
      if (usage) {
        if (usage.prompt_tokens != null) span.setAttribute('llm.prompt_tokens', usage.prompt_tokens);
        if (usage.completion_tokens != null) span.setAttribute('llm.completion_tokens', usage.completion_tokens);
      }
      if (model) span.setAttribute('llm.model', model);
      return output;
    } catch (err) {
      await logPromise.catch(() => null);

      const maxTries = node.retryOnFail
        ? clampInt(node.maxTries ?? node.retryAttempts, 2, 1, 10)
        : 1;
      const retryCount = Math.max(0, maxTries - 1);

      const secrets = credentialSecrets(credential);
      const shouldContinue = node.continueOnError || node.onError === 'continueRegular' || node.onError === 'continueErrorOutput';
      if (shouldContinue) {
        const message = redactString(errorMessage(err), secrets);
        const output = node.onError === 'continueErrorOutput'
          ? { error: true, message, type: 'node_error', nodeId: node.id, nodeType: node.type }
          : { error: { message, name: errorName(err) }, input };
        const safeOutput = redactObject(output);
        await logNodeEnd(logId, { status: 'error', error: message, output: safeOutput, retryCount });
        emitExecutionEvent(executionId, 'node:end', {
          nodeId: node.id,
          nodeType: node.type,
          nodeName: node.name,
          status: 'error',
          error: message,
          continued: true,
        });
        return output;
      }

      const message = redactString(errorMessage(err), secrets);
      await logNodeEnd(logId, { status: 'error', error: message, retryCount });
      emitExecutionEvent(executionId, 'node:end', {
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        status: 'error',
        error: message,
      });
      throw err;
    }
  });
}

function buildNodesContext(dag, outputValues) {
  const nodesCtx = {};
  for (const [id, value] of outputValues) {
    if (value === SKIP) continue;
    const node = dag.nodes.get(id);
    nodesCtx[id] = value;
    if (node?.name) nodesCtx[node.name] = value;
  }
  return nodesCtx;
}
