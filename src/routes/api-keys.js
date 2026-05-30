import { db } from '../db/client.js';
import { generateApiKey } from '../auth/api-key.js';
import { VALID_SCOPES } from '../auth/scopes.js';
import { auditLog } from '../utils/audit.js';

function requireSessionAuth(req, reply) {
  if (req.auth?.authMethod === 'api_key') {
    reply.code(403).send({ error: 'Use a session to manage API keys' });
    return false;
  }
  return true;
}

function validateScopes(scopes) {
  if (!Array.isArray(scopes)) return 'scopes must be an array';
  for (const s of scopes) {
    if (!VALID_SCOPES.has(s)) return `Unknown scope: "${s}"`;
  }
  return null;
}

export async function apiKeyRoutes(fastify) {
  fastify.get('/api/v1/api-keys', async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;

    const includeRevoked = req.query.includeRevoked === 'true';
    const { rows } = await db.query(
      `SELECT id, name, key_prefix, scopes, expires_at, last_used_at, last_used_ip, revoked_at, created_at
       FROM api_keys
       WHERE workspace_id = $1 ${includeRevoked ? '' : 'AND revoked_at IS NULL'}
       ORDER BY created_at DESC`,
      [req.auth.workspaceId]
    );
    return reply.send({ apiKeys: rows });
  });

  fastify.post('/api/v1/api-keys', async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;

    const name = String(req.body?.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const rawScopes = req.body?.scopes;
    const scopes = rawScopes !== undefined ? rawScopes : ['*'];
    const scopeError = validateScopes(scopes);
    if (scopeError) return reply.code(400).send({ error: scopeError });

    const expiresInDays = req.body?.expiresInDays != null ? Number(req.body.expiresInDays) : null;
    if (expiresInDays !== null && (isNaN(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) {
      return reply.code(400).send({ error: 'expiresInDays must be between 1 and 365' });
    }

    const { key, keyHash, keyPrefix } = generateApiKey();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
      : null;

    const { rows } = await db.query(
      `INSERT INTO api_keys (workspace_id, user_id, key_hash, key_prefix, name, scopes, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, key_prefix, scopes, expires_at, last_used_at, created_at`,
      [
        req.auth.workspaceId,
        req.auth.userId ?? null,
        keyHash,
        keyPrefix,
        name,
        scopes,
        expiresAt,
        req.auth.userId ?? null,
      ]
    );

    await auditLog({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.userId,
      action: 'api_key.create',
      resourceType: 'api_key',
      resourceId: rows[0].id,
      metadata: { name, scopes, keyPrefix, expiresInDays },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Return the plaintext key ONCE — never stored, never returned again
    return reply.code(201).send({ apiKey: rows[0], key });
  });

  fastify.delete('/api/v1/api-keys/:id', async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;

    const { rows } = await db.query(
      `UPDATE api_keys
       SET revoked_at = NOW(), revoked_by = $3
       WHERE id = $1 AND workspace_id = $2 AND revoked_at IS NULL
       RETURNING id, name`,
      [req.params.id, req.auth.workspaceId, req.auth.userId ?? null]
    );
    if (!rows.length) return reply.code(404).send({ error: 'API key not found or already revoked' });

    await auditLog({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.userId,
      action: 'api_key.revoke',
      resourceType: 'api_key',
      resourceId: rows[0].id,
      metadata: { name: rows[0].name },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return reply.send({ ok: true });
  });
}
