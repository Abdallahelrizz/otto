import { db } from '../db/client.js';
import { encryptCredential } from '../utils/encrypt.js';

export async function credentialRoutes(fastify) {
  // Create a credential (data is encrypted at rest)
  fastify.post('/api/v1/credentials', async (req, reply) => {
    const { workspaceId, name, type, data } = req.body ?? {};
    if (!workspaceId) return reply.code(400).send({ error: 'workspaceId is required' });
    if (!name) return reply.code(400).send({ error: 'name is required' });
    if (!type) return reply.code(400).send({ error: 'type is required' });
    if (!data || typeof data !== 'object') return reply.code(400).send({ error: 'data must be an object' });

    const encrypted = encryptCredential(data);

    const { rows } = await db.query(
      `INSERT INTO credentials (workspace_id, name, type, data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, type`,
      [workspaceId, name, type, JSON.stringify(encrypted)]
    );
    return reply.code(201).send(rows[0]);
  });

  // List credentials for a workspace (never returns data)
  fastify.get('/api/v1/credentials', async (req, reply) => {
    const { workspaceId } = req.query;
    if (!workspaceId) return reply.code(400).send({ error: 'workspaceId is required' });

    const { rows } = await db.query(
      `SELECT id, name, type, created_at
       FROM credentials
       WHERE workspace_id = $1
       ORDER BY name ASC`,
      [workspaceId]
    );
    return reply.send({ credentials: rows });
  });

  // Delete a credential
  fastify.delete('/api/v1/credentials/:id', async (req, reply) => {
    const { rows } = await db.query(
      'DELETE FROM credentials WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Credential not found' });
    return reply.send({ ok: true });
  });
}
