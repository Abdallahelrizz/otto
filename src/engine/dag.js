/**
 * DAG parser — takes a workflow definition (JSONB) and builds the dependency graph.
 *
 * Workflow definition shape:
 *   { nodes: [{ id, type, name, config }], edges: [{ id, source, target, sourceHandle, targetHandle }] }
 *
 * sourceHandle is used by IF nodes: 'true' | 'false'
 */

export function parseDAG(definition) {
  const nodes = new Map(); // id -> node
  const inEdges = new Map();  // nodeId -> [{ source, sourceHandle, edgeId }]
  const outEdges = new Map(); // nodeId -> [{ target, sourceHandle, edgeId }]

  for (const node of definition.nodes) {
    nodes.set(node.id, node);
    inEdges.set(node.id, []);
    outEdges.set(node.id, []);
  }

  for (const edge of definition.edges) {
    outEdges.get(edge.source)?.push({
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      edgeId: edge.id,
    });
    inEdges.get(edge.target)?.push({
      source: edge.source,
      sourceHandle: edge.sourceHandle ?? null,
      edgeId: edge.id,
    });
  }

  validate(nodes, inEdges);

  return { nodes, inEdges, outEdges };
}

function validate(nodes, inEdges) {
  // Detect cycles via DFS
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...nodes.keys()].map(id => [id, WHITE]));

  function dfs(id) {
    color.set(id, GRAY);
    for (const { source } of inEdges.get(id) ?? []) {
      if (color.get(source) === GRAY) throw new Error(`Cycle detected involving node "${source}"`);
      if (color.get(source) === WHITE) dfs(source);
    }
    color.set(id, BLACK);
  }

  for (const id of nodes.keys()) {
    if (color.get(id) === WHITE) dfs(id);
  }
}
