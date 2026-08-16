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
