// Tags API — tags in Otto are TEXT[] stored on each workflow row.
// This route exposes the distinct tags across the workspace so clients
// (including MCP) can enumerate available tags without fetching all workflows.

import { db } from '../db/client.js';

export async function tagRoutes(fastify) {
  fastify.get('/api/v1/tags', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT DISTINCT unnest(tags) AS name
       FROM workflows
       WHERE workspace_id = $1 AND tags IS NOT NULL
       ORDER BY name ASC`,
      [req.auth.workspaceId]
    );
    return reply.send({ tags: rows.map(r => r.name) });
  });
}
