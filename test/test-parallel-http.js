import { parseDAG } from '../src/engine/dag.js';
import { httpRequest } from '../src/nodes/http-request.js';
import { resolveConfig } from '../src/engine/expressions.js';

const definition = {
  "nodes": [
    {
      "id": "99b0fe8c-9913-48f7-8642-c347cd9d01e8",
      "type": "manual_trigger",
      "name": "Manual Trigger",
      "config": {},
      "position": {
        "x": 452.1035714533498,
        "y": 232.20779042987988
      }
    },
    {
      "id": "09e191cd-aea3-43bf-bd0e-2e4c830df111",
      "type": "http_request",
      "name": "HTTP Request 1",
      "config": {
        "url": "https://httpbin.org/delay/5",
        "body": "",
        "method": "GET",
        "authKey": "",
        "headers": [],
        "authType": "none",
        "authValue": "",
        "authPassword": "",
        "authUsername": ""
      },
      "position": {
        "x": 690.3034460541817,
        "y": 144.08584205100638
      }
    },
    {
      "id": "87d11962-6c37-4992-b0e6-117851fcee40",
      "type": "http_request",
      "name": "HTTP Request 2",
      "config": {
        "url": "https://httpbin.org/delay/5",
        "body": "",
        "method": "GET",
        "authKey": "",
        "headers": [],
        "authType": "none",
        "authValue": "",
        "authPassword": "",
        "authUsername": ""
      },
      "position": {
        "x": 696.5315457314382,
        "y": 306.81610875422695
      }
    }
  ],
  "edges": [
    {
      "id": "reactflow__edge-99b0fe8c-9913-48f7-8642-c347cd9d01e8output-09e191cd-aea3-43bf-bd0e-2e4c830df111input",
      "source": "99b0fe8c-9913-48f7-8642-c347cd9d01e8",
      "target": "09e191cd-aea3-43bf-bd0e-2e4c830df111",
      "sourceHandle": "output",
      "targetHandle": "input"
    },
    {
      "id": "reactflow__edge-99b0fe8c-9913-48f7-8642-c347cd9d01e8output-87d11962-6c37-4992-b0e6-117851fcee40input",
      "source": "99b0fe8c-9913-48f7-8642-c347cd9d01e8",
      "target": "87d11962-6c37-4992-b0e6-117851fcee40",
      "sourceHandle": "output",
      "targetHandle": "input"
    }
  ],
  "pinnedData": {}
};

const events = [];
let globalStart;

function record(nodeId, name, type, startMs, endMs, status, output) {
  events.push({ nodeId, name, type, startMs, endMs, durationMs: endMs - startMs, status, output });
}

function getHandler(type) {
  if (type === 'manual_trigger') return async () => ({ triggered: true });
  if (type === 'http_request') return httpRequest;
  throw new Error(`Unknown type: ${type}`);
}

async function executeDAG(dag, triggerInput) {
  const nodePromises = new Map();

  function getOutput(nodeId) {
    if (nodePromises.has(nodeId)) return nodePromises.get(nodeId);

    const promise = (async () => {
      const node = dag.nodes.get(nodeId);
      const deps = dag.inEdges.get(nodeId) ?? [];

      const depResults = await Promise.all(deps.map(async dep => ({
        source: dep.source,
        sourceHandle: dep.sourceHandle,
        value: await getOutput(dep.source),
      })));

      const startMs = Date.now() - globalStart;
      console.log(`[Engine] Starting node: "${node.name}" (${nodeId}) at +${startMs}ms`);

      try {
        const resolvedConfig = resolveConfig(node.config ?? {}, { input: triggerInput });
        const handler = getHandler(node.type);
        const output = await handler({ input: triggerInput, rawInputs: [], config: resolvedConfig });
        const endMs = Date.now() - globalStart;
        console.log(`[Engine] Completed node: "${node.name}" (${nodeId}) at +${endMs}ms (took ${endMs - startMs}ms)`);
        record(nodeId, node.name, node.type, startMs, endMs, 'success', output);
        return output;
      } catch (err) {
        const endMs = Date.now() - globalStart;
        console.error(`[Engine] Failed node: "${node.name}" (${nodeId}) at +${endMs}ms: ${err.message}`);
        record(nodeId, node.name, node.type, startMs, endMs, 'error', { error: err.message });
        throw err;
      }
    })();

    nodePromises.set(nodeId, promise);
    return promise;
  }

  await Promise.all([...dag.nodes.keys()].map(id => getOutput(id)));
  return nodePromises;
}

const dag = parseDAG(definition);
globalStart = Date.now();

console.log('Starting parallel HTTP workflow directly on the engine...');
await executeDAG(dag, {});
const totalMs = Date.now() - globalStart;

console.log('\n======================================================');
console.log('Execution Timings Report:');
console.log('======================================================');
events.forEach(e => {
  console.log(`- ${e.name} (${e.nodeId}): Start = ${e.startMs}ms, End = ${e.endMs}ms, Duration = ${e.durationMs}ms`);
});
console.log('======================================================');
console.log(`Total Wall-Clock Time: ${totalMs}ms`);
const httpEvents = events.filter(e => e.type === 'http_request');
const sequentialSum = httpEvents.reduce((sum, e) => sum + e.durationMs, 0);
console.log(`Sequential Sum of HTTP Requests: ${sequentialSum}ms`);
console.log(`Parallel Savings: Saved ${sequentialSum - totalMs}ms!`);
console.log('======================================================');
