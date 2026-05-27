import { db } from '../db/client.js';
import { hashPassword } from '../auth/session.js';
import { randomUUID } from 'crypto';
import { auditLog } from '../utils/audit.js';

const ROLES = new Set(['owner', 'admin', 'editor', 'viewer']);

export async function workspaceRoutes(fastify) {
  // GET /api/v1/workspace/members — list workspace members
  fastify.get('/api/v1/workspace/members', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name, wm.role
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1
       ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, u.email`,
      [req.auth.workspaceId]
    );
    return reply.send({ members: rows });
  });

  // POST /api/v1/workspace/members — create a new user and add to workspace
  fastify.post('/api/v1/workspace/members', async (req, reply) => {
    const { email, name, password, role = 'editor' } = req.body ?? {};
    if (!email || !password) return reply.code(400).send({ error: 'email and password are required' });
    if (!ROLES.has(role) || role === 'owner') return reply.code(400).send({ error: 'role must be admin, editor, or viewer' });

    const callerRole = req.auth.role ?? 'editor';
    if (!['owner', 'admin'].includes(callerRole)) return reply.code(403).send({ error: 'Insufficient permissions' });

    const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    let userId;
    if (existing.length) {
      userId = existing[0].id;
    } else {
      const hash = await hashPassword(password);
      userId = randomUUID();
      await db.query(
        `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)`,
        [userId, email.toLowerCase().trim(), name ?? null, hash]
      );
    }

    const { rows: alreadyMember } = await db.query(
      'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2',
      [req.auth.workspaceId, userId]
    );
    if (alreadyMember.length) return reply.code(409).send({ error: 'User is already a workspace member' });

    await db.query(
      'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
      [req.auth.workspaceId, userId, role]
    );
    await auditLog({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.userId,
      action: 'member.add',
      resourceType: 'workspace_member',
      resourceId: userId,
      metadata: { email, role },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.code(201).send({ id: userId, email, role });
  });

  // PUT /api/v1/workspace/members/:userId/role — change a member's role
  fastify.put('/api/v1/workspace/members/:userId/role', async (req, reply) => {
    const { userId } = req.params;
    const { role } = req.body ?? {};
    if (!role || !ROLES.has(role)) return reply.code(400).send({ error: 'Invalid role' });

    const callerRole = req.auth.role ?? 'editor';
    if (callerRole !== 'owner') return reply.code(403).send({ error: 'Only the owner can change roles' });
    if (userId === req.auth.userId) return reply.code(400).send({ error: 'Cannot change your own role' });

    const { rowCount } = await db.query(
      `UPDATE workspace_members SET role = $1 WHERE workspace_id = $2 AND user_id = $3`,
      [role, req.auth.workspaceId, userId]
    );
    if (!rowCount) return reply.code(404).send({ error: 'Member not found' });
    await auditLog({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.userId,
      action: 'member.role_change',
      resourceType: 'workspace_member',
      resourceId: userId,
      metadata: { newRole: role },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.send({ ok: true });
  });

  // DELETE /api/v1/workspace/members/:userId — remove a member from the workspace
  fastify.delete('/api/v1/workspace/members/:userId', async (req, reply) => {
    const { userId } = req.params;
    if (userId === req.auth.userId) return reply.code(400).send({ error: 'Cannot remove yourself' });

    const callerRole = req.auth.role ?? 'editor';
    if (!['owner', 'admin'].includes(callerRole)) return reply.code(403).send({ error: 'Insufficient permissions' });

    const { rowCount } = await db.query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2 AND role != 'owner'`,
      [req.auth.workspaceId, userId]
    );
    if (!rowCount) return reply.code(404).send({ error: 'Member not found or cannot remove owner' });
    await auditLog({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.userId,
      action: 'member.remove',
      resourceType: 'workspace_member',
      resourceId: userId,
      metadata: {},
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.send({ ok: true });
  });
}
