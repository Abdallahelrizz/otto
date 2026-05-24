import { db } from '../db/client.js';
import { importN8n } from '../utils/n8n-importer.js';
import { randomUUID } from 'crypto';

export async function importRoutes(fastify) {
  fastify.post('/api/v1/import/n8n', async (req, reply) => {
    const { n8nJson, json, name } = req.body ?? {};
    const payload = n8nJson ?? json;
    if (!payload) return reply.code(400).send({ error: 'n8nJson is required' });

    let parsed;
    try {
      parsed = importN8n(payload);
    } catch (err) {
      return reply.code(422).send({ error: `Failed to parse n8n export: ${err.message}` });
    }

    const { nodes, edges, warnings } = parsed;
    const workflowName = name
      ?? (typeof payload === 'object' ? payload.name : null)
      ?? 'Imported from n8n';

    const definition = { nodes, edges };
    const id = randomUUID();

    await db.query(
      `INSERT INTO workflows (id, workspace_id, name, definition, active)
       VALUES ($1, $2, $3, $4, false)`,
      [id, req.auth.workspaceId, workflowName, JSON.stringify(definition)]
    );

    return reply.code(201).send({ id, warnings });
  });
}
