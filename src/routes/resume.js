import { db } from '../db/client.js';
import { executionQueue } from '../queue/client.js';
import { emitExecutionEvent } from '../engine/events.js';

export async function resumeRoutes(fastify) {
  // POST /api/v1/resume/:token — resumes a waiting execution (webhook or form resume type)
  fastify.post('/api/v1/resume/:token', async (req, reply) => {
    const { token } = req.params;
    const resumeInput = req.body ?? {};

    // Atomic compare-and-set: claim the token in the SAME statement that reads it.
    //
    // This was a SELECT ... WHERE status='waiting' followed by a separate UPDATE, which is
    // a check-then-act race. Two concurrent requests carrying the same token both passed
    // the SELECT and both enqueued a resume job, so the workflow resumed TWICE and every
    // node after the wait ran twice — duplicate side effects. This endpoint is public and
    // self-authenticating, so a double-clicked approval link or a retried webhook delivery
    // is enough to trigger it; it needs no attacker.
    //
    // Postgres evaluates WHERE against the pre-update row, so matching on resume_token
    // while also nulling it is correct and makes the token strictly single-use: exactly
    // one caller gets a row back, everyone else gets zero.
    const { rows } = await db.query(
      `UPDATE executions
          SET status = 'running', resumed_at = NOW(), resume_token = NULL
        WHERE resume_token = $1 AND status = 'waiting'
      RETURNING id, workflow_id, workspace_id, wait_node_id, wait_type, resume_payload`,
      [token]
    );

    if (!rows.length) {
      // Either the token never existed, or another request already claimed it.
      return reply.code(404).send({ error: 'Resume token not found or execution is not waiting' });
    }

    const row = rows[0];
    const savedOutputs = row.resume_payload ?? {};
    const pinnedData = { ...savedOutputs, [row.wait_node_id]: resumeInput };

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
