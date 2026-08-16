/**
 * Error-status mapping and catalog resolution.
 *
 * Found by driving the running app (2026-08-16): `GET /workflows/not-a-uuid`
 * returned 500 because Postgres' 22P02 (invalid_text_representation) fell through
 * to the generic handler. Wrong status, and indistinguishable from a real fault in
 * monitoring. Infra-free — asserts the mapping table and the catalog candidates.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('server maps malformed-input Postgres codes to 400, not 500', async () => {
  const src = await readFile(path.join(root, 'src/server.js'), 'utf-8');
  // The class of "client sent something Postgres cannot parse" errors.
  for (const code of ['22P02', '22003', '22007', '22008', '22001']) {
    assert.ok(src.includes(`'${code}'`), `expected ${code} to map to a 4xx, not fall through to 500`);
  }
  assert.ok(src.includes('INVALID_INPUT'), 'expected an INVALID_INPUT error code');
});

test('the 400 mapping is evaluated before the generic 500 fallback', async () => {
  const src = await readFile(path.join(root, 'src/server.js'), 'utf-8');
  const mapIdx = src.indexOf('INVALID_INPUT');
  const fallbackIdx = src.indexOf("code: 'INTERNAL'");
  assert.ok(mapIdx !== -1 && fallbackIdx !== -1);
  assert.ok(mapIdx < fallbackIdx, 'INVALID_INPUT mapping must precede the generic 500');
});

test('credential catalog resolves in local dev (no canvas build required)', async () => {
  const src = await readFile(path.join(root, 'src/routes/credentials.js'), 'utf-8');
  assert.ok(
    src.includes('canvas/public/credential-catalog.json'),
    'expected a dev fallback to the canvas source, or /credentials/schema/:type 503s before a build',
  );
});

test('the catalog file the dev fallback points at actually exists and parses', async () => {
  const raw = await readFile(path.join(root, 'canvas/public/credential-catalog.json'), 'utf-8');
  const entries = JSON.parse(raw);
  assert.ok(Array.isArray(entries) && entries.length > 0, 'catalog should be a non-empty array');
  assert.ok(entries.every(e => e.id), 'every catalog entry needs an id');
});

test('API-key auth resolves the real workspace role (no invented defaults)', async () => {
  const src = await readFile(path.join(root, 'src/auth/api-key.js'), 'utf-8');
  assert.ok(
    src.includes('workspace_members'),
    'api-key auth must join workspace_members; without it callers invent conflicting defaults '
    + "(server.js assumed 'editor' → a viewer's key could write; audit.js assumed 'viewer' → "
    + 'the documented audit:read scope was unusable)',
  );
  assert.ok(src.includes('member_role'), 'expected the resolved role to be returned');
});

// Found by driving the app: every execution was written as execution_type
// 'production' — including manual canvas runs, which showed a "Production" badge.
// createExecution defaulted the literal and no caller ever overrode it. The save
// policy (saveManualExecutions), retention, redaction and production-vs-manual
// metrics all key off this column, so it is not cosmetic.
test('execution_type is derived from the trigger, not hardcoded to production', async () => {
  const { executionTypeFor } = await import('../src/engine/logger.js');
  assert.equal(executionTypeFor('manual'), 'manual');
  assert.equal(executionTypeFor('api'), 'api');
  assert.equal(executionTypeFor('schedule'), 'scheduled');
  assert.equal(executionTypeFor('sub_workflow'), 'sub_workflow');
  assert.equal(executionTypeFor('error_workflow'), 'error_workflow');
  assert.equal(executionTypeFor('resume'), 'resume');
  assert.equal(executionTypeFor('webhook'), 'production');
  assert.equal(executionTypeFor(undefined), 'production', 'unknown triggers stay production');
});

test('derived execution types all have a UI label (no raw value leaks to users)', async () => {
  const { executionTypeFor } = await import('../src/engine/logger.js');
  const panel = await readFile(
    path.join(root, 'canvas/src/components/panels/ExecutionPanel.tsx'), 'utf-8');
  for (const trigger of ['manual','api','schedule','sub_workflow','error_workflow','resume','webhook']) {
    const type = executionTypeFor(trigger);
    assert.ok(
      panel.includes(`${type}:`),
      `EXEC_TYPE_LABELS is missing "${type}" — the badge would render the raw value`,
    );
  }
});

// Node errors are persisted to node_executions AND streamed over SSE, so a raw URL in
// an error leaks any credential carried in its path or query. But an earlier fix removed
// the URL entirely, leaving "network request failed" with nothing to debug. safeUrlLabel
// is the middle ground: origin only.
test('safeUrlLabel keeps the origin and drops credential-bearing parts', async () => {
  const { safeUrlLabel } = await import('../src/utils/redact.js');
  assert.equal(safeUrlLabel('https://api.example.com/v1/x?token=SECRET'), 'https://api.example.com');
  assert.equal(safeUrlLabel('http://user:pw@internal:8080/path'), 'http://internal:8080');
  assert.equal(safeUrlLabel('https://h.example.com/a/SECRET-PATH-SEG'), 'https://h.example.com');
  assert.equal(safeUrlLabel('not a url'), '(invalid URL)');
  assert.equal(safeUrlLabel(undefined), '(invalid URL)');
});

test('safeUrlLabel output never contains a query string or userinfo', async () => {
  const { safeUrlLabel } = await import('../src/utils/redact.js');
  for (const u of [
    'https://a.example.com/p?token=abc123&k=v',
    'https://u:p@b.example.com/p#frag',
    'https://c.example.com/webhook/SECRETPATH',
  ]) {
    const label = safeUrlLabel(u);
    assert.ok(!label.includes('?'), `query leaked: ${label}`);
    assert.ok(!label.includes('@'), `userinfo leaked: ${label}`);
    assert.ok(!label.includes('SECRET'), `secret leaked: ${label}`);
    assert.ok(!label.includes('token'), `token leaked: ${label}`);
  }
});

test('network failures name the host so they stay diagnosable', async () => {
  // The executor persists only err.message, so putting detail in err.cause is not enough.
  const { requestJson } = await import('../src/nodes/service-utils.js');
  await assert.rejects(
    () => requestJson('https://no-such-host-zz-999.invalid/v1/x?token=LEAKME'),
    (err) => {
      assert.ok(!err.message.includes('LEAKME'), `token leaked into error: ${err.message}`);
      assert.ok(err.message.includes('no-such-host-zz-999.invalid'), `host missing: ${err.message}`);
      return true;
    },
  );
});

// The queue runs with attempts: 3. Rethrowing a workflow failure from the worker made
// BullMQ replay the ENTIRE workflow from node 1, re-running every node that had already
// succeeded — a workflow that emails at node 2 and fails at node 5 sent that email three
// times. Node-level retry (retryOnFail) is the right granularity for business-logic
// failures. This guards the fix, because the consequence is duplicate side effects.
test('worker does not replay a workflow that reached a terminal state', async () => {
  const src = await readFile(path.join(root, 'src/queue/worker.js'), 'utf-8');
  assert.ok(
    /catch\s*\(\s*err\s*\)/.test(src),
    'worker must catch runWorkflow failures, or BullMQ replays the whole workflow',
  );
  for (const status of ['success', 'error', 'cancelled', 'waiting']) {
    assert.ok(
      src.includes(`'${status}'`),
      `terminal status "${status}" must suppress the job-level retry`,
    );
  }
  assert.ok(
    src.includes('SELECT status FROM executions'),
    'the replay decision must be based on the recorded execution status',
  );
});

test('queue still retries, so the guard is load-bearing not decorative', async () => {
  const src = await readFile(path.join(root, 'src/queue/client.js'), 'utf-8');
  assert.match(src, /attempts:\s*[2-9]/, 'attempts > 1 is what makes the replay guard necessary');
});

// Found while building the benchmark harness: executions.trigger_type had a CHECK
// constraint that predated several features, so values the code writes were rejected.
// 'api' was a LIVE failure — every run started through the public API raised 23514 and
// could never create an execution. Migration 026 widened the constraint.
test('every trigger type the code writes is permitted by the schema', async () => {
  const migration = await readFile(path.join(root, 'migrations/026_trigger_type_align.sql'), 'utf-8');
  // These are written somewhere in src/ and must all be accepted.
  for (const t of ['webhook','manual','schedule','subworkflow','form','chat','error_workflow','api','resume','test']) {
    assert.ok(migration.includes(`'${t}'`), `trigger_type "${t}" is written by the code but not allowed by the CHECK`);
  }
});

// nodes/sub-workflow.js writes 'subworkflow' (no underscore — that is what the DB CHECK
// allows), but the mapping keyed only on 'sub_workflow', so sub-workflow runs were
// labelled 'production' and were indistinguishable from webhook runs.
test('both sub-workflow spellings map to the sub_workflow execution type', async () => {
  const { executionTypeFor } = await import('../src/engine/logger.js');
  assert.equal(executionTypeFor('subworkflow'), 'sub_workflow');
  assert.equal(executionTypeFor('sub_workflow'), 'sub_workflow');
  assert.equal(executionTypeFor('api'), 'api');
  assert.equal(executionTypeFor('resume'), 'resume');
});

// Human-in-the-loop approvals had NEVER worked, for two independent reasons:
//   1. executions.wait_type CHECK allowed only time/webhook/form, so a node emitting
//      waitType='approval' was rejected outright (migration 027 widened it).
//   2. human_approval inserts an approvals row keyed by its OWN token and returns it as
//      waitToken, but the executor minted a DIFFERENT resume token — so
//      POST /approvals/:token searched executions.resume_token and never matched.
test('the executor honours a wait token issued by the node', async () => {
  const src = await readFile(path.join(root, 'src/engine/executor.js'), 'utf-8');
  assert.match(
    src, /waitDescriptor\.waitToken\s*\?\?/,
    'suspend must reuse waitDescriptor.waitToken, or approval links can never resolve',
  );
});

test('wait_type CHECK permits every waitType a node emits', async () => {
  const migration = await readFile(path.join(root, 'migrations/027_approval_wait_and_query_indexes.sql'), 'utf-8');
  for (const wt of ['time', 'webhook', 'form', 'approval']) {
    assert.ok(migration.includes(`'${wt}'`), `waitType "${wt}" is emitted by a node but not allowed`);
  }
});
