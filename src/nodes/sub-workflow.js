import { db } from '../db/client.js';
import { runWorkflow } from '../engine/executor.js';

const MAX_RECURSION_DEPTH = 5;

export async function subWorkflow({ input, config, workspaceId, ctx }) {
  const depth = ctx?.recursionDepth ?? 0;
  if (depth >= MAX_RECURSION_DEPTH) {
    throw new Error(`Sub-workflow: recursion depth limit (${MAX_RECURSION_DEPTH}) reached`);
  }

  const { workflowId } = config;
  if (!workflowId) throw new Error('Sub-workflow: workflowId is required');

  const { rows } = await db.query(
    'SELECT id, workspace_id, definition FROM workflows WHERE id = $1',
    [workflowId]
  );
  if (!rows.length) throw new Error(`Sub-workflow: workflow ${workflowId} not found`);

  const { workspace_id, definition } = rows[0];
  const { executionId, outputs } = await runWorkflow({
    workflowId,
    workspaceId: workspaceId ?? workspace_id,
    definition,
    input,
    triggerType: 'subworkflow',
    _recursionDepth: depth + 1,
  });

  // Collect the final outputs into a single merged object
  const finalOutput = {};
  for (const [, promise] of outputs) {
    const val = await promise;
    if (val && typeof val === 'object' && val !== Symbol.for('SKIP')) {
      Object.assign(finalOutput, val);
    }
  }

  return { ...finalOutput, _subExecutionId: executionId };
}
