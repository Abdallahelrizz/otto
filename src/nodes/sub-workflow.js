import { db } from '../db/client.js';
import { runWorkflow } from '../engine/executor.js';

const MAX_RECURSION_DEPTH = 5;

export async function subWorkflow({ input, config, workspaceId, ctx }) {
  const depth = ctx?.recursionDepth ?? 0;
  if (depth >= MAX_RECURSION_DEPTH) {
    throw new Error(`Sub-workflow: recursion depth limit (${MAX_RECURSION_DEPTH}) reached`);
  }

  const { workflowId, inputMode = 'forward', inputMap } = config;
  if (!workflowId) throw new Error('Sub-workflow: workflowId is required');

  let subInput = input;
  if (inputMode === 'none') {
    subInput = {};
  } else if (inputMode === 'map' && inputMap) {
    try {
      subInput = typeof inputMap === 'object' ? inputMap : JSON.parse(inputMap);
    } catch {
      subInput = {};
    }
  }

  const { rows } = await db.query(
    'SELECT id, workspace_id, definition FROM workflows WHERE id = $1',
    [workflowId]
  );
  if (!rows.length) throw new Error(`Sub-workflow: workflow ${workflowId} not found`);

  const { workspace_id, definition } = rows[0];

  // Caller policy check
  const callerPolicy = definition?.settings?.callerPolicy ?? 'any';
  if (callerPolicy === 'none') {
    throw new Error(`Sub-workflow: workflow ${workflowId} cannot be called as a sub-workflow (caller policy: none)`);
  }
  if (callerPolicy === 'same_workspace') {
    const callerWorkspaceId = workspaceId ?? null;
    if (!callerWorkspaceId || callerWorkspaceId !== workspace_id) {
      throw new Error(`Sub-workflow: workflow ${workflowId} can only be called from the same workspace (caller policy: same_workspace)`);
    }
  }
  const parentNodeId = ctx?.nodeId ?? null;
  const parentExecutionId = ctx?.executionId ?? null;

  const { executionId: subExecutionId, outputs } = await runWorkflow({
    workflowId,
    workspaceId: workspaceId ?? workspace_id,
    definition,
    input: subInput,
    triggerType: 'subworkflow',
    recursionDepth: depth + 1,
    parentExecutionId,
    parentNodeId,
  });

  // Collect the final outputs into a single merged object
  const finalOutput = {};
  for (const [, promise] of outputs) {
    const val = await promise;
    if (val && typeof val === 'object' && val !== Symbol.for('SKIP')) {
      Object.assign(finalOutput, val);
    }
  }

  const result = { ...finalOutput };
  Object.defineProperty(result, '_subExecution', {
    value: { id: subExecutionId },
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return result;
}
