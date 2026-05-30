import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateUsage, dailyTokens, monthBounds } from '../src/engine/usage-stats.js';

test('aggregateUsage groups by workflow, sums tokens, counts runs, lists models', () => {
  const tokenRows = [
    { workflow_id: 'w1', workflow_name: 'Cortex', model: 'gpt-4o', prompt_tokens: 1_000_000, completion_tokens: 200_000 },
    { workflow_id: 'w1', workflow_name: 'Cortex', model: 'claude-sonnet', prompt_tokens: 500_000, completion_tokens: 0 },
    { workflow_id: 'w2', workflow_name: 'Digest', model: 'gpt-4o', prompt_tokens: 100_000, completion_tokens: 0 },
  ];
  const runRows = [{ workflow_id: 'w1', runs: 3 }, { workflow_id: 'w2', runs: 1 }];
  const r = aggregateUsage(tokenRows, runRows);
  assert.equal(r.byWorkflow.length, 2);
  assert.equal(r.byWorkflow[0].workflowId, 'w1');               // most tokens first
  assert.equal(r.byWorkflow[0].totalTokens, 1_700_000);
  assert.equal(r.byWorkflow[0].runs, 3);
  assert.equal(r.byWorkflow[0].byModel.length, 2);
  assert.equal(r.byWorkflow[0].byModel[0].model, 'gpt-4o');     // bigger model first
  assert.equal(r.totals.totalTokens, 1_800_000);
  assert.equal(r.totals.runs, 4);
  assert.deepEqual([...r.models].sort(), ['claude-sonnet', 'gpt-4o']);
});

test('aggregateUsage counts runs for workflows with no token rows', () => {
  const r = aggregateUsage(
    [{ workflow_id: 'w1', workflow_name: 'A', model: 'gpt-4o', prompt_tokens: 1000, completion_tokens: 0 }],
    [{ workflow_id: 'w1', runs: 2 }, { workflow_id: 'w2', runs: 5 }]
  );
  assert.equal(r.byWorkflow.length, 1);    // w2 has no tokens → not in breakdown
  assert.equal(r.byWorkflow[0].workflowId, 'w1');
  assert.equal(r.totals.runs, 7);          // 2 + 5, both counted
});

test('dailyTokens collapses per-day token totals', () => {
  const r = dailyTokens([
    { day: '2026-05-01', prompt_tokens: 1000, completion_tokens: 500 },
    { day: '2026-05-01', prompt_tokens: 200, completion_tokens: 0 },
    { day: '2026-05-02', prompt_tokens: 100, completion_tokens: 100 },
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].day, '2026-05-01');
  assert.equal(r[0].totalTokens, 1700);
  assert.equal(r[1].totalTokens, 200);
});

test('monthBounds returns [first, next-first) in UTC', () => {
  const { from, to } = monthBounds(2026, 4); // May (0-based month index)
  assert.equal(from.toISOString(), '2026-05-01T00:00:00.000Z');
  assert.equal(to.toISOString(), '2026-06-01T00:00:00.000Z');
});
