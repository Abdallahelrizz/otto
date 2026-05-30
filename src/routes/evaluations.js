import { db } from '../db/client.js';
import { createExecution } from '../engine/logger.js';
import { executionQueue } from '../queue/client.js';

/**
 * Enqueue a single workflow execution for an eval case and return the executionId.
 */
async function enqueueEvalExecution({ workflowId, workspaceId, input, definition }) {
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

  return executionId;
}

export async function evaluationRoutes(fastify) {
  // ── Datasets ──────────────────────────────────────────────────────────────

  fastify.get('/api/v1/eval/datasets', async (req, reply) => {
    const { workspaceId } = req.auth;
    const { rows } = await db.query(
      `SELECT id, name, description, created_at, updated_at
       FROM eval_datasets
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [workspaceId]
    );
    return reply.send({ datasets: rows });
  });

  fastify.post('/api/v1/eval/datasets', async (req, reply) => {
    const { workspaceId } = req.auth;
    const { name, description } = req.body ?? {};

    if (!name || !String(name).trim()) {
      return reply.code(400).send({ error: 'name is required' });
    }

    const { rows } = await db.query(
      `INSERT INTO eval_datasets (workspace_id, name, description)
       VALUES ($1, $2, $3)
       RETURNING id, name, description, created_at, updated_at`,
      [workspaceId, String(name).trim(), description ? String(description).trim() : null]
    );
    return reply.code(201).send({ dataset: rows[0] });
  });

  fastify.delete('/api/v1/eval/datasets/:datasetId', async (req, reply) => {
    const { workspaceId } = req.auth;
    const datasetId = Number(req.params.datasetId);

    const { rows } = await db.query(
      'SELECT id FROM eval_datasets WHERE id = $1 AND workspace_id = $2',
      [datasetId, workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Dataset not found' });

    await db.query('DELETE FROM eval_datasets WHERE id = $1 AND workspace_id = $2', [datasetId, workspaceId]);
    return reply.send({ ok: true });
  });

  // ── Cases ─────────────────────────────────────────────────────────────────

  fastify.get('/api/v1/eval/datasets/:datasetId/cases', async (req, reply) => {
    const { workspaceId } = req.auth;
    const datasetId = Number(req.params.datasetId);

    // Ensure the dataset belongs to this workspace
    const { rows: ds } = await db.query(
      'SELECT id FROM eval_datasets WHERE id = $1 AND workspace_id = $2',
      [datasetId, workspaceId]
    );
    if (!ds.length) return reply.code(404).send({ error: 'Dataset not found' });

    const { rows } = await db.query(
      `SELECT id, dataset_id, input, expected_output, label, created_at
       FROM eval_cases
       WHERE dataset_id = $1
       ORDER BY created_at ASC`,
      [datasetId]
    );
    return reply.send({ cases: rows });
  });

  fastify.post('/api/v1/eval/datasets/:datasetId/cases', async (req, reply) => {
    const { workspaceId } = req.auth;
    const datasetId = Number(req.params.datasetId);
    const { input = {}, expected_output, label } = req.body ?? {};

    const { rows: ds } = await db.query(
      'SELECT id FROM eval_datasets WHERE id = $1 AND workspace_id = $2',
      [datasetId, workspaceId]
    );
    if (!ds.length) return reply.code(404).send({ error: 'Dataset not found' });

    const { rows } = await db.query(
      `INSERT INTO eval_cases (dataset_id, input, expected_output, label)
       VALUES ($1, $2, $3, $4)
       RETURNING id, dataset_id, input, expected_output, label, created_at`,
      [
        datasetId,
        JSON.stringify(input && typeof input === 'object' ? input : {}),
        expected_output !== undefined ? JSON.stringify(expected_output) : null,
        label ? String(label) : null,
      ]
    );
    return reply.code(201).send({ case: rows[0] });
  });

  fastify.delete('/api/v1/eval/datasets/:datasetId/cases/:caseId', async (req, reply) => {
    const { workspaceId } = req.auth;
    const datasetId = Number(req.params.datasetId);
    const caseId = Number(req.params.caseId);

    const { rows: ds } = await db.query(
      'SELECT id FROM eval_datasets WHERE id = $1 AND workspace_id = $2',
      [datasetId, workspaceId]
    );
    if (!ds.length) return reply.code(404).send({ error: 'Dataset not found' });

    const { rows: cs } = await db.query(
      'SELECT id FROM eval_cases WHERE id = $1 AND dataset_id = $2',
      [caseId, datasetId]
    );
    if (!cs.length) return reply.code(404).send({ error: 'Case not found' });

    await db.query('DELETE FROM eval_cases WHERE id = $1 AND dataset_id = $2', [caseId, datasetId]);
    return reply.send({ ok: true });
  });

  // ── Runs ──────────────────────────────────────────────────────────────────

  fastify.post('/api/v1/eval/runs', async (req, reply) => {
    const { workspaceId, userId } = req.auth;
    const { workflowId, datasetId } = req.body ?? {};

    if (!workflowId || !datasetId) {
      return reply.code(400).send({ error: 'workflowId and datasetId are required' });
    }

    // Validate dataset ownership
    const { rows: ds } = await db.query(
      'SELECT id FROM eval_datasets WHERE id = $1 AND workspace_id = $2',
      [Number(datasetId), workspaceId]
    );
    if (!ds.length) return reply.code(403).send({ error: 'Dataset not found or access denied' });

    // Validate workflow ownership and load definition
    const { rows: wf } = await db.query(
      'SELECT id, definition FROM workflows WHERE id = $1 AND workspace_id = $2',
      [workflowId, workspaceId]
    );
    if (!wf.length) return reply.code(404).send({ error: 'Workflow not found' });

    const definition = wf[0].definition;

    // Load all cases from the dataset
    const { rows: cases } = await db.query(
      'SELECT id, input FROM eval_cases WHERE dataset_id = $1 ORDER BY created_at ASC',
      [Number(datasetId)]
    );

    // Create the eval_run record
    const { rows: runRows } = await db.query(
      `INSERT INTO eval_runs (workspace_id, workflow_id, dataset_id, status, total_cases, created_by)
       VALUES ($1, $2, $3, 'running', $4, $5)
       RETURNING id`,
      [workspaceId, workflowId, Number(datasetId), cases.length, userId ?? null]
    );
    const evalRunId = runRows[0].id;

    // Fire each case asynchronously — don't await the enqueues en masse
    // We create result rows first so we have references, then enqueue
    for (const evalCase of cases) {
      const executionId = await enqueueEvalExecution({
        workflowId,
        workspaceId,
        input: evalCase.input ?? {},
        definition,
      });

      await db.query(
        `INSERT INTO eval_results (eval_run_id, eval_case_id, execution_id, status)
         VALUES ($1, $2, $3, 'pending')`,
        [evalRunId, evalCase.id, executionId]
      );
    }

    return reply.code(201).send({ evalRunId });
  });

  fastify.get('/api/v1/eval/runs/:runId', async (req, reply) => {
    const { workspaceId } = req.auth;
    const runId = Number(req.params.runId);

    const { rows: runRows } = await db.query(
      `SELECT id, workspace_id, workflow_id, dataset_id, status,
              total_cases, passed_cases, failed_cases, score,
              started_at, completed_at
       FROM eval_runs
       WHERE id = $1`,
      [runId]
    );
    if (!runRows.length) return reply.code(404).send({ error: 'Eval run not found' });

    const run = runRows[0];
    if (run.workspace_id !== workspaceId) return reply.code(403).send({ error: 'Access denied' });

    const { rows: results } = await db.query(
      `SELECT id, eval_case_id, execution_id, status, actual_output, score, notes, created_at
       FROM eval_results
       WHERE eval_run_id = $1
       ORDER BY created_at ASC`,
      [runId]
    );

    return reply.send({ run, results });
  });
}
