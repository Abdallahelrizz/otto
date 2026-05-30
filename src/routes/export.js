// Export route — serialises an Otto workflow to n8n-compatible JSON.
// Inverse of src/utils/n8n-importer.js.

import { db } from '../db/client.js';

function toN8nWorkflow(workflow) {
  const def = workflow.definition ?? { nodes: [], edges: [] };
  const nodes = (def.nodes ?? []).map(n => ({
    id: n.id,
    name: n.data?.label ?? n.id,
    type: `n8n-nodes-base.${n.data?.nodeType ?? 'unknown'}`,
    typeVersion: 1,
    position: [n.position?.x ?? 0, n.position?.y ?? 0],
    parameters: n.data?.config ?? {},
    credentials: {},
    disabled: n.data?.disabled ?? false,
    notes: n.data?.notes ?? '',
  }));

  const connections = {};
  for (const edge of (def.edges ?? [])) {
    if (!connections[edge.source]) connections[edge.source] = { main: [[]] };
    connections[edge.source].main[0].push({ node: edge.target, type: 'main', index: 0 });
  }

  return {
    name: workflow.name,
    active: workflow.active ?? false,
    nodes,
    connections,
    settings: def.settings ?? {},
    tags: workflow.tags ?? [],
    updatedAt: workflow.updated_at,
    createdAt: workflow.created_at,
  };
}

export async function exportRoutes(fastify) {
  fastify.get('/api/v1/export/n8n', async (req, reply) => {
    const { workflowId } = req.query;

    if (workflowId) {
      const { rows } = await db.query(
        `SELECT id, name, definition, active, tags, created_at, updated_at
         FROM workflows WHERE id = $1 AND workspace_id = $2`,
        [workflowId, req.auth.workspaceId]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Workflow not found' });
      return reply.send(toN8nWorkflow(rows[0]));
    }

    const { rows } = await db.query(
      `SELECT id, name, definition, active, tags, created_at, updated_at
       FROM workflows WHERE workspace_id = $1 ORDER BY updated_at DESC`,
      [req.auth.workspaceId]
    );
    return reply.send({ workflows: rows.map(toN8nWorkflow) });
  });
}
