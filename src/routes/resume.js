import { db } from '../db/client.js';
import { executionQueue } from '../queue/client.js';
import { emitExecutionEvent } from '../engine/events.js';

export async function resumeRoutes(fastify) {
  // POST /api/v1/resume/:token — resumes a waiting execution (webhook or form resume type)
  fastify.post('/api/v1/resume/:token', async (req, reply) => {
    const { token } = req.params;
    const resumeInput = req.body ?? {};

    const { rows } = await db.query(
      `SELECT id, workflow_id, workspace_id, wait_node_id, wait_type, resume_payload
       FROM executions
       WHERE resume_token = $1 AND status = 'waiting'`,
      [token]
    );

    if (!rows.length) {
      return reply.code(404).send({ error: 'Resume token not found or execution is not waiting' });
    }

    const row = rows[0];
    const savedOutputs = row.resume_payload ?? {};
    const pinnedData = { ...savedOutputs, [row.wait_node_id]: resumeInput };

    await db.query(
      `UPDATE executions
       SET status = 'running', resumed_at = NOW(), resume_token = NULL
       WHERE id = $1`,
      [row.id]
    );

    emitExecutionEvent(row.id, 'execution:resume', { waitType: row.wait_type });

    await executionQueue.add('resume', {
      executionId: row.id,
      workflowId: row.workflow_id,
      workspaceId: row.workspace_id,
      mode: 'from_node',
      nodeId: row.wait_node_id,
      pinnedData,
      triggerType: 'resume',
    });

    return reply.code(202).send({ executionId: row.id, queued: true });
  });
}
