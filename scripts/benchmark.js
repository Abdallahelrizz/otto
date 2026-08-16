#!/usr/bin/env node
/**
 * Otto scheduler benchmark — the honest replacement for the withdrawn "78×" claim.
 *
 * WHAT THIS MEASURES, precisely: how much wall-clock time Otto's DAG scheduler saves by
 * running independent branches concurrently, compared with the same total node work
 * arranged in a chain. It compares Otto against ITSELF.
 *
 * WHAT IT DOES NOT MEASURE — and why the old number was withdrawn:
 *   - It is not a comparison against n8n or any other tool. The previous claim compared a
 *     MOCKED Otto run against a real-network n8n run, which is not a benchmark. If you want
 *     a cross-tool number, you must instrument both sides identically and publish the
 *     method; until then, do not publish a ratio.
 *   - It is not an end-to-end API benchmark. Nodes here sleep for a known duration so the
 *     result isolates the SCHEDULER. Real workflows are dominated by provider latency.
 *
 * Amdahl bounds the whole thing: parallelism can only remove the time of branches that
 * overlap, so the ceiling is the critical path. Two independent 5s branches is 2×, not 78×.
 * The linear control below exists to show the honest null result — a chain gains nothing.
 *
 *   node scripts/benchmark.js            # both shapes + Gantt
 *   node scripts/benchmark.js --json     # machine-readable
 *
 * Requires DATABASE_URL (timings are read back from node_executions, the same rows the
 * execution panel shows — so the numbers are auditable, not self-reported by this script).
 */
import 'dotenv/config';
import { runWorkflow } from '../src/engine/executor.js';
import { db } from '../src/db/client.js';

const BRANCH_MS = 400;   // per-branch work
const BRANCHES  = 3;     // independent branches in the parallel shape

/** N independent delay branches fanning out from one trigger, then merged. */
function parallelShape() {
  const nodes = [
    { id: 'trigger', type: 'manual_trigger', name: 'Trigger', config: {} },
    ...Array.from({ length: BRANCHES }, (_, i) => ({
      id: `b${i}`, type: 'delay', name: `Branch ${i + 1}`,
      config: { amount: BRANCH_MS, unit: 'ms' },
    })),
    { id: 'merge', type: 'merge', name: 'Merge', config: { mode: 'merge-object' } },
  ];
  const edges = [
    ...Array.from({ length: BRANCHES }, (_, i) => ({ source: 'trigger', target: `b${i}` })),
    ...Array.from({ length: BRANCHES }, (_, i) => ({ source: `b${i}`, target: 'merge' })),
  ];
  return { nodes, edges };
}

/** The SAME total node work, chained. This is the null result: no branch can overlap. */
function linearShape() {
  const nodes = [
    { id: 'trigger', type: 'manual_trigger', name: 'Trigger', config: {} },
    ...Array.from({ length: BRANCHES }, (_, i) => ({
      id: `s${i}`, type: 'delay', name: `Step ${i + 1}`,
      config: { amount: BRANCH_MS, unit: 'ms' },
    })),
  ];
  const edges = [
    { source: 'trigger', target: 's0' },
    ...Array.from({ length: BRANCHES - 1 }, (_, i) => ({ source: `s${i}`, target: `s${i + 1}` })),
  ];
  return { nodes, edges };
}

async function run(label, definition, ctx) {
  const started = Date.now();
  const { executionId } = await runWorkflow({
    workflowId: ctx.workflowId,
    workspaceId: ctx.workspaceId,
    definition,
    input: {},
    triggerType: 'test',
  });
  const wallMs = Date.now() - started;

  // Read timings back from the DB rather than trusting in-process numbers.
  const { rows } = await db.query(
    `SELECT node_name, status,
            EXTRACT(EPOCH FROM started_at)   * 1000 AS start_ms,
            EXTRACT(EPOCH FROM completed_at) * 1000 AS end_ms,
            duration_ms
       FROM node_executions
      WHERE execution_id = $1
      ORDER BY started_at`,
    [executionId],
  );

  const t0 = Math.min(...rows.map(r => Number(r.start_ms)));
  const nodes = rows.map(r => ({
    name: r.node_name,
    status: r.status,
    start: Math.round(Number(r.start_ms) - t0),
    end: Math.round(Number(r.end_ms) - t0),
    durationMs: Math.round(Number(r.duration_ms ?? 0)),
  }));

  const sumNodeMs = nodes.reduce((a, n) => a + n.durationMs, 0);
  const spanMs = Math.max(...nodes.map(n => n.end));
  return { label, executionId, wallMs, sumNodeMs, spanMs, nodes };
}

/** Text Gantt. The bar OVERLAP is the actual argument — not a headline ratio. */
function gantt(result, width = 52) {
  const scale = width / Math.max(result.spanMs, 1);
  const lines = result.nodes.map(n => {
    const off = Math.round(n.start * scale);
    const len = Math.max(1, Math.round((n.end - n.start) * scale));
    const bar = ' '.repeat(off) + '█'.repeat(len);
    return `  ${n.name.padEnd(12).slice(0, 12)} |${bar.padEnd(width)}| ${String(n.durationMs).padStart(5)}ms`;
  });
  return lines.join('\n');
}

function report(r) {
  // The honest headline: how much of the summed node time the scheduler removed.
  const saved = r.sumNodeMs - r.spanMs;
  const pct = r.sumNodeMs > 0 ? (saved / r.sumNodeMs) * 100 : 0;
  console.log(`\n${r.label}`);
  console.log(gantt(r));
  console.log(`  ${'─'.repeat(72)}`);
  console.log(`  sum(node_ms)      ${String(r.sumNodeMs).padStart(6)} ms   <- total work performed`);
  console.log(`  critical path     ${String(r.spanMs).padStart(6)} ms   <- what you actually waited for`);
  console.log(`  wall clock        ${String(r.wallMs).padStart(6)} ms   <- includes engine overhead`);
  console.log(`  saved by overlap  ${String(saved).padStart(6)} ms   (${pct.toFixed(1)}% of node time)`);
}

const asJson = process.argv.includes('--json');

const { rows: wf } = await db.query('SELECT id, workspace_id FROM workflows LIMIT 1');
if (!wf.length) {
  console.error('benchmark: needs at least one workflow row to borrow ids from. Create one first.');
  process.exit(1);
}
const ctx = { workflowId: wf[0].id, workspaceId: wf[0].workspace_id };

const par = await run(`PARALLEL — ${BRANCHES} independent ${BRANCH_MS}ms branches`, parallelShape(), ctx);
const lin = await run(`LINEAR (control) — the same ${BRANCHES}×${BRANCH_MS}ms, chained`, linearShape(), ctx);

if (asJson) {
  console.log(JSON.stringify({ parallel: par, linear: lin }, null, 2));
} else {
  report(par);
  report(lin);
  const speedup = lin.spanMs / Math.max(par.spanMs, 1);
  console.log('\n' + '='.repeat(74));
  console.log(`  Same work, two shapes: ${speedup.toFixed(2)}× faster when the branches are independent.`);
  console.log('  The linear control gains nothing — that is the point. Parallelism cannot');
  console.log('  beat the critical path, so publish the shape of the graph, never a bare ratio.');
  console.log('  This compares Otto to ITSELF. It is NOT a comparison against any other tool.');
  console.log('='.repeat(74) + '\n');
}

await db.pool?.end?.().catch(() => {});
process.exit(0);
