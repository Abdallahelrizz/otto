import { randomBytes } from 'crypto';
import { db } from '../db/client.js';
import { WAIT } from '../engine/wait.js';

const MAX_TIMEOUT_HOURS = 168; // 7 days
const DEFAULT_TIMEOUT_HOURS = 24;

export async function humanApproval({ config, input, workspaceId, executionId, nodeId, ctx }) {
  const resolvedExecutionId = executionId ?? ctx?.executionId;
  const resolvedNodeId = nodeId ?? ctx?.nodeId;

  if (!resolvedExecutionId || !workspaceId) {
    throw new Error('Human approval requires execution and workspace context');
  }

  const subject = config.subject ?? 'Approval required';
  const message = config.message ?? '';
  const approvers = config.approvers ?? '';
  const timeoutHours = Math.min(
    Math.max(1, Number(config.timeoutHours) || DEFAULT_TIMEOUT_HOURS),
    MAX_TIMEOUT_HOURS,
  );

  const approvalToken = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + timeoutHours * 3_600_000).toISOString();

  // Persist approval record so the GET /api/v1/approvals/:token endpoint can serve it
  await db.query(
    `INSERT INTO approvals
       (token, execution_id, workspace_id, node_id, subject, message, approvers, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)`,
    [
      approvalToken,
      resolvedExecutionId,
      workspaceId,
      resolvedNodeId ?? null,
      subject,
      message,
      approvers,
      expiresAt,
    ],
  );

  return {
    [WAIT]: true,
    waitType: 'approval',
    waitToken: approvalToken,
    waitExpiresAt: expiresAt,
    resumeWebhookPath: `/api/v1/approvals/${approvalToken}`,
  };
}
