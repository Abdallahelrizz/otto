/**
 * Cortex Brain workflow demo — runs against the real Otto DAG engine.
 * Uses mock node handlers with realistic delays instead of live APIs/DB.
 * No database or Redis required.
 *
 * Run: node test/cortex-brain-demo.js [--low-confidence]
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseDAG } from '../src/engine/dag.js';
import { SKIP } from '../src/engine/skip.js';
import { ifNode } from '../src/nodes/if.js';
import { mergeNode } from '../src/nodes/merge.js';
import { setNode } from '../src/nodes/set.js';
import { resolveConfig } from '../src/engine/expressions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const LOW_CONFIDENCE = args.includes('--low-confidence');
const DEBUG = args.includes('--debug');

// ─── Simulated delays (ms) matching realistic API latencies ─────────────────
const DELAYS = {
  embed:          150,  // OpenAI text-embedding-3-small
  hippocampus:    120,  // Vector DB search (Supabase pgvector)
  subconscious:   380,  // GPT-4o-mini fast reasoning
  consciousness:  820,  // GPT-4o deep reasoning (only on low-confidence path)
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Mock node handlers ──────────────────────────────────────────────────────

const MOCK_HTTP = async ({ config }) => {
  switch (config._mock) {
    case 'embed': {
      await sleep(DELAYS.embed);
      return {
        object: 'list',
        data: [{ embedding: Array(8).fill(0).map(() => +(Math.random()).toFixed(4)), index: 0 }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 6, total_tokens: 6 },
      };
    }
    case 'hippocampus': {
      await sleep(DELAYS.hippocampus);
      return {
        memories: [
          { content: 'User prefers concise, technical answers.', similarity: 0.91 },
          { content: 'User timezone: UTC+3.', similarity: 0.74 },
        ],
        retrieved: 2,
        search_ms: 18,
      };
    }
    default:
      throw new Error(`Unknown HTTP mock: ${config._mock}`);
  }
};

const MOCK_LLM = async ({ input, config }) => {
  switch (config._mock) {
    case 'subconscious': {
      await sleep(DELAYS.subconscious);
      const confidence = LOW_CONFIDENCE ? 0.61 : 0.82;
      return {
        text: LOW_CONFIDENCE
          ? 'I have a candidate answer but I am not fully certain. Escalating to Consciousness.'
          : 'Based on retrieved memories and embeddings, I can answer with high confidence.',
        confidence,
        model: 'gpt-4o-mini',
        usage: { prompt_tokens: 112, completion_tokens: 38, total_tokens: 150 },
        finish_reason: 'stop',
      };
    }
    case 'consciousness': {
      await sleep(DELAYS.consciousness);
      return {
        text: 'After careful deliberation and cross-referencing the subconscious candidate against all available context: [detailed, high-quality answer with full reasoning chain].',
        confidence: 0.97,
        model: 'gpt-4o',
        usage: { prompt_tokens: 284, completion_tokens: 96, total_tokens: 380 },
        finish_reason: 'stop',
      };
    }
    default:
      throw new Error(`Unknown LLM mock: ${config._mock}`);
  }
};

function getHandler(type) {
  switch (type) {
    case 'webhook_trigger': return async ({ input }) => input;
    case 'http_request':    return MOCK_HTTP;
    case 'llm_call':        return MOCK_LLM;
    case 'if':              return ifNode;
    case 'merge':           return mergeNode;
    case 'set':             return setNode;
    default: throw new Error(`Unknown node type: ${type}`);
  }
}

// ─── Timing log ──────────────────────────────────────────────────────────────

const events = [];   // { nodeId, name, type, startMs, endMs, status, output }
let globalStart;

function record(nodeId, name, type, startMs, endMs, status, output) {
  events.push({ nodeId, name, type, startMs, endMs, durationMs: endMs - startMs, status, output });
}

// ─── Mini executor (same pull model as src/engine/executor.js, DB-free) ──────

function collectInput(depResults) {
  if (depResults.length === 0) return { input: {}, rawInputs: [], skipped: false };

  const activeInputs = [];
  const rawInputs = [];

  for (const dep of depResults) {
    const raw = dep.value;
    if (raw === SKIP) continue;

    let resolved;
    if (dep.sourceHandle && typeof raw === 'object' && raw !== null && '_ifBranches' in raw) {
      const branch = raw._ifBranches[dep.sourceHandle];
      if (branch === SKIP || branch === undefined) continue;
      resolved = branch;
    } else {
      resolved = raw;
    }

    activeInputs.push(resolved);
    rawInputs.push({ source: dep.source, data: resolved });
  }

  if (activeInputs.length === 0) return { input: null, rawInputs: [], skipped: true };
  return { input: Object.assign({}, ...activeInputs), rawInputs, skipped: false };
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

      const { input, rawInputs, skipped } = deps.length === 0
        ? { input: triggerInput, rawInputs: [], skipped: false }
        : collectInput(depResults);

      const startMs = Date.now() - globalStart;

      if (skipped) {
        const endMs = Date.now() - globalStart;
        record(nodeId, node.name, node.type, startMs, endMs, 'skipped', null);
        return SKIP;
      }

      try {
        const resolvedConfig = resolveConfig(node.config ?? {}, { input });
        const handler = getHandler(node.type);
        const output = await handler({ input, rawInputs, config: resolvedConfig });
        const endMs = Date.now() - globalStart;
        if (DEBUG) console.error(`[debug] ${nodeId} output:`, JSON.stringify(output)?.slice(0, 120));
        record(nodeId, node.name, node.type, startMs, endMs, 'success', output);
        return output;
      } catch (err) {
        const endMs = Date.now() - globalStart;
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

// ─── Main ─────────────────────────────────────────────────────────────────────

const definition = JSON.parse(
  readFileSync(join(__dirname, 'cortex-brain-workflow.json'), 'utf8')
);

const triggerInput = {
  message: 'What time is it in Dubai right now?',
  sessionId: 'sess-demo-001',
  userId:    'user-abdallah',
};

console.log('\n' + '═'.repeat(72));
console.log(' Otto — Cortex Brain Workflow Demo');
console.log(' Mode:', LOW_CONFIDENCE ? 'LOW CONFIDENCE (routes to Consciousness)' : 'HIGH CONFIDENCE (direct response)');
console.log('═'.repeat(72));
console.log(' Input:', JSON.stringify(triggerInput, null, 2).replace(/\n/g, '\n '));

const dag = parseDAG(definition);
globalStart = Date.now();

await executeDAG(dag, triggerInput);

const totalMs = Date.now() - globalStart;

// ─── Print execution table ────────────────────────────────────────────────────

const COL = { name: 28, start: 8, end: 8, dur: 9, status: 10 };
const hr = '─'.repeat(72);

function pad(s, n) { return String(s).padEnd(n); }
function lpad(s, n) { return String(s).padStart(n); }

console.log('\n' + hr);
console.log(
  ' ' + pad('Node', COL.name) +
  lpad('Start', COL.start) +
  lpad('End', COL.end) +
  lpad('Duration', COL.dur) +
  '  ' + 'Status'
);
console.log(hr);

// Sort by start time
const sorted = [...events].sort((a, b) => a.startMs - b.startMs);

// Find the two parallel branches to highlight
const parallelNodes = new Set(['embed', 'hippocampus']);

for (const e of sorted) {
  const isParallel = parallelNodes.has(e.nodeId);
  const statusLabel = e.status === 'success' ? '✓ success' :
                      e.status === 'skipped' ? '↷ skipped' : '✗ error';
  const parallel = isParallel ? ' ◀ PARALLEL' : '';

  console.log(
    ' ' + pad(e.name, COL.name) +
    lpad(e.startMs + 'ms', COL.start) +
    lpad(e.endMs   + 'ms', COL.end) +
    lpad(e.durationMs + 'ms', COL.dur) +
    '  ' + statusLabel + parallel
  );
}

console.log(hr);
console.log(` Total wall-clock time: ${totalMs}ms`);

// Show parallelism savings
const embedDur       = events.find(e => e.nodeId === 'embed')?.durationMs ?? 0;
const hippoDur       = events.find(e => e.nodeId === 'hippocampus')?.durationMs ?? 0;
const sequentialCost = embedDur + hippoDur;
const parallelCost   = Math.max(embedDur, hippoDur);
console.log(` Parallel branch savings: ${sequentialCost}ms → ${parallelCost}ms (saved ${sequentialCost - parallelCost}ms)`);

// Show start-time proof
const embedStart = events.find(e => e.nodeId === 'embed')?.startMs ?? 0;
const hippoStart = events.find(e => e.nodeId === 'hippocampus')?.startMs ?? 0;
console.log(` embed startMs=${embedStart}  hippocampus startMs=${hippoStart}  Δ=${Math.abs(embedStart - hippoStart)}ms`);
console.log(hr);

// ─── Final output ─────────────────────────────────────────────────────────────
const outputEvent = events.find(e => e.nodeId === 'output');
console.log('\n Final workflow output:');
console.log(JSON.stringify(outputEvent?.output ?? null, null, 2));

// Show per-node outputs in debug mode
if (DEBUG) {
  console.log('\n [debug] All node outputs:');
  for (const e of sorted) {
    console.log(`  [${e.nodeId}]`, JSON.stringify(e.output)?.slice(0, 160));
  }
}

console.log();
