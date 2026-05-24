import { db } from '../db/client.js';
import { encryptCredential } from '../utils/encrypt.js';

export async function credentialRoutes(fastify) {
  fastify.post('/api/v1/credentials', async (req, reply) => {
    const { name, type, data } = req.body ?? {};
    if (!name) return reply.code(400).send({ error: 'name is required' });
    if (!type) return reply.code(400).send({ error: 'type is required' });
    if (!data || typeof data !== 'object') return reply.code(400).send({ error: 'data must be an object' });

    const encrypted = encryptCredential(data);

    const { rows } = await db.query(
      `INSERT INTO credentials (workspace_id, name, type, data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, type, created_at`,
      [req.auth.workspaceId, name, type, JSON.stringify(encrypted)]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.get('/api/v1/credentials', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT id, name, type, created_at
       FROM credentials
       WHERE workspace_id = $1
       ORDER BY name ASC`,
      [req.auth.workspaceId]
    );
    return reply.send({ credentials: rows });
  });

  fastify.delete('/api/v1/credentials/:id', async (req, reply) => {
    const { rows } = await db.query(
      'DELETE FROM credentials WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Credential not found' });
    return reply.send({ ok: true });
  });
}
