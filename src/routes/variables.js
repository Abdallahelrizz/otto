import { db } from '../db/client.js';

const VALID_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const VALID_TYPES = new Set(['string', 'number', 'boolean', 'json']);

export async function variableRoutes(fastify) {
  fastify.get('/api/v1/variables', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT id, name, value, type, description
       FROM variables
       WHERE workspace_id = $1
       ORDER BY name ASC`,
      [req.auth.workspaceId]
    );
    return reply.send({ variables: rows });
  });

  fastify.post('/api/v1/variables', async (req, reply) => {
    const { name, value = '', type = 'string', description } = req.body ?? {};

    if (!name) return reply.code(400).send({ error: 'name is required' });
    if (!VALID_NAME_RE.test(name)) {
      return reply.code(400).send({ error: 'name must be a valid identifier (letters, digits, underscores; cannot start with a digit)' });
    }
    if (!VALID_TYPES.has(type)) {
      return reply.code(400).send({ error: 'type must be one of: string, number, boolean, json' });
    }

    try {
      const { rows } = await db.query(
        `INSERT INTO variables (workspace_id, name, value, type, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, value, type, description`,
        [req.auth.workspaceId, name, String(value), type, description ?? null]
      );
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'Variable name already exists' });
      }
      throw err;
    }
  });

  fastify.put('/api/v1/variables/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, value, type, description } = req.body ?? {};

    const setParts = [];
    const params = [];

    if (name !== undefined) {
      if (!VALID_NAME_RE.test(name)) {
        return reply.code(400).send({ error: 'name must be a valid identifier (letters, digits, underscores; cannot start with a digit)' });
      }
      params.push(name);
      setParts.push(`name = $${params.length}`);
    }

    if (value !== undefined) {
      params.push(String(value));
      setParts.push(`value = $${params.length}`);
    }

    if (type !== undefined) {
      if (!VALID_TYPES.has(type)) {
        return reply.code(400).send({ error: 'type must be one of: string, number, boolean, json' });
      }
      params.push(type);
      setParts.push(`type = $${params.length}`);
    }

    if (description !== undefined) {
      params.push(description);
      setParts.push(`description = $${params.length}`);
    }

    if (!setParts.length) return reply.code(400).send({ error: 'No changes provided' });

    setParts.push(`updated_at = NOW()`);

    params.push(id, req.auth.workspaceId);
    try {
      const { rows } = await db.query(
        `UPDATE variables
         SET ${setParts.join(', ')}
         WHERE id = $${params.length - 1} AND workspace_id = $${params.length}
         RETURNING id, name, value, type, description`,
        params
      );
      if (!rows.length) return reply.code(404).send({ error: 'Variable not found' });
      return reply.send(rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'Variable name already exists' });
      }
      throw err;
    }
  });

  fastify.delete('/api/v1/variables/:id', async (req, reply) => {
    const { rows } = await db.query(
      'DELETE FROM variables WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Variable not found' });
    return reply.send({ ok: true });
  });
}
