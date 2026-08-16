import { db } from '../db/client.js';
import { executionQueue } from '../queue/client.js';
import { emitExecutionEvent } from '../engine/events.js';

export async function approvalRoutes(fastify) {
  // GET /api/v1/approvals/:token — return approval status + metadata
  fastify.get('/api/v1/approvals/:token', async (req, reply) => {
    const { token } = req.params;

    const { rows } = await db.query(
      `SELECT token, subject, message, status, created_at, resolved_at, approver, comment, expires_at
       FROM approvals
       WHERE token = $1`,
      [token],
    );

    if (!rows.length) {
      return reply.code(404).send({ error: 'Approval token not found' });
    }

    const row = rows[0];
    return reply.send({
      token: row.token,
      subject: row.subject,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
      resolvedAt: row.resolved_at,
      approver: row.approver,
      comment: row.comment,
      expiresAt: row.expires_at,
    });
  });

  // POST /api/v1/approvals/:token/approve — body: { approver, comment }
  fastify.post('/api/v1/approvals/:token/approve', async (req, reply) => {
    const { token } = req.params;
    const { approver = 'unknown', comment = '' } = req.body ?? {};

    // Atomic compare-and-set, matching routes/resume.js. This was a SELECT followed by
    // a separate UPDATE — check-then-act. Two concurrent approve/reject requests (a
    // double-clicked approval link, a retried delivery) could both pass the SELECT and
    // both enqueue a resume job, resuming the workflow twice and re-running every node
    // after the approval. Claiming the token in the same statement that reads it makes
    // it strictly single-use: exactly one caller gets a row.
    const { rows: execRows } = await db.query(
      `UPDATE executions
          SET status = 'running', resumed_at = NOW(), resume_token = NULL
        WHERE resume_token = $1 AND status = 'waiting'
      RETURNING id, workflow_id, workspace_id, wait_node_id, wait_type, resume_payload`,
      [token],
    );

    if (!execRows.length) {
      return reply.code(404).send({ error: 'Approval token not found or execution is not waiting' });
    }

    const exec = execRows[0];

    // Mark approval as resolved
    await db.query(
      `UPDATE approvals
       SET status = 'approved', resolved_at = NOW(), approver = $2, comment = $3
       WHERE token = $1`,
      [token, approver, comment],
    );

    // Build resume payload that the node handler will receive back as input
    const savedOutputs = exec.resume_payload ?? {};
    const resumeInput = {
      approved: true,
      approver,
      comment,
    };
    const pinnedData = { ...savedOutputs, [exec.wait_node_id]: resumeInput };

    // (status/resume_token already claimed by the compare-and-set above)

    emitExecutionEvent(exec.id, 'execution:resume', { waitType: exec.wait_type });

    await executionQueue.add('resume', {
      executionId: exec.id,
      workflowId: exec.workflow_id,
      workspaceId: exec.workspace_id,
      mode: 'from_node',
      nodeId: exec.wait_node_id,
      pinnedData,
      triggerType: 'resume',
    });

    return reply.code(202).send({ executionId: exec.id, queued: true, approved: true });
  });

  // POST /api/v1/approvals/:token/reject — body: { reason }
  fastify.post('/api/v1/approvals/:token/reject', async (req, reply) => {
    const { token } = req.params;
    const { reason = '' } = req.body ?? {};

    // Atomic compare-and-set, matching routes/resume.js. This was a SELECT followed by
    // a separate UPDATE — check-then-act. Two concurrent approve/reject requests (a
    // double-clicked approval link, a retried delivery) could both pass the SELECT and
    // both enqueue a resume job, resuming the workflow twice and re-running every node
    // after the approval. Claiming the token in the same statement that reads it makes
    // it strictly single-use: exactly one caller gets a row.
    const { rows: execRows } = await db.query(
      `UPDATE executions
          SET status = 'running', resumed_at = NOW(), resume_token = NULL
        WHERE resume_token = $1 AND status = 'waiting'
      RETURNING id, workflow_id, workspace_id, wait_node_id, wait_type, resume_payload`,
      [token],
    );

    if (!execRows.length) {
      return reply.code(404).send({ error: 'Approval token not found or execution is not waiting' });
    }

    const exec = execRows[0];

    // Mark approval as rejected
    await db.query(
      `UPDATE approvals
       SET status = 'rejected', resolved_at = NOW(), reason = $2
       WHERE token = $1`,
      [token, reason],
    );

    // Build resume payload indicating rejection
    const savedOutputs = exec.resume_payload ?? {};
    const resumeInput = {
      approved: false,
      reason,
    };
    const pinnedData = { ...savedOutputs, [exec.wait_node_id]: resumeInput };

    // (status/resume_token already claimed by the compare-and-set above; the node
    //  will output approved:false)

    emitExecutionEvent(exec.id, 'execution:resume', { waitType: exec.wait_type });

    await executionQueue.add('resume', {
      executionId: exec.id,
      workflowId: exec.workflow_id,
      workspaceId: exec.workspace_id,
      mode: 'from_node',
      nodeId: exec.wait_node_id,
      pinnedData,
      triggerType: 'resume',
    });

    return reply.code(202).send({ executionId: exec.id, queued: true, approved: false });
  });
}
