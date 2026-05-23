/**
 * Webhook trigger routes.
 *
 * POST /webhooks/:path
 *   Receives an HTTP payload, finds the matching active workflow,
 *   enqueues the execution, and returns 202 Accepted immediately.
 */
import { db } from '../db/client.js';
import { executionQueue } from '../queue/client.js';

export async function webhookRoutes(fastify) {
  fastify.post('/webhooks/:path', async (req, reply) => {
    const { path } = req.params;
    const input = {
      body: req.body ?? {},
      headers: req.headers,
      query: req.query,
      method: req.method,
    };

    // Find an active workflow whose trigger node has this webhook path
    const { rows } = await db.query(
      `SELECT w.id, w.workspace_id
       FROM workflows w,
            jsonb_array_elements(w.definition->'nodes') node
       WHERE w.active = true
         AND node->>'type' = 'webhook_trigger'
         AND node->'config'->>'path' = $1
       LIMIT 1`,
      [path]
    );

    if (!rows.length) {
      return reply.code(404).send({ error: 'No active workflow found for this webhook path' });
    }

    const { id: workflowId, workspace_id: workspaceId } = rows[0];

    await executionQueue.add('run', { workflowId, workspaceId, triggerType: 'webhook', input });

    return reply.code(202).send({ message: 'Accepted', workflowId });
  });
}
