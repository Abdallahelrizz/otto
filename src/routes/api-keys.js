import { db } from '../db/client.js';
import { generateApiKey } from '../auth/api-key.js';

function requireSessionAuth(req, reply) {
  if (req.auth?.authMethod === 'api_key') {
    reply.code(403).send({ error: 'Use a session to manage API keys' });
    return false;
  }
  return true;
}

export async function apiKeyRoutes(fastify) {
  fastify.get('/api/v1/api-keys', async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;

    const { rows } = await db.query(
      `SELECT id, name, key_prefix, last_used_at, created_at
       FROM api_keys
       WHERE workspace_id = $1
       ORDER BY created_at DESC`,
      [req.auth.workspaceId]
    );
    return reply.send({ apiKeys: rows });
  });

  fastify.post('/api/v1/api-keys', async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;

    const name = String(req.body?.name ?? '').trim();
    if (!name) return reply.code(400).send({ error: 'name is required' });

    const { key, keyHash, keyPrefix } = generateApiKey();
    const { rows } = await db.query(
      `INSERT INTO api_keys (workspace_id, user_id, key_hash, key_prefix, name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, key_prefix, last_used_at, created_at`,
      [req.auth.workspaceId, req.auth.userId ?? null, keyHash, keyPrefix, name]
    );

    return reply.code(201).send({ apiKey: rows[0], key });
  });

  fastify.delete('/api/v1/api-keys/:id', async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;

    const { rows } = await db.query(
      'DELETE FROM api_keys WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'API key not found' });
    return reply.send({ ok: true });
  });
}
