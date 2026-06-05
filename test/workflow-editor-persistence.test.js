import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard opens workflows through the canonical editor id route', () => {
  const source = read('canvas/src/pages/WorkflowsDashboard.tsx');

  assert.match(source, /navigate\(`\/app\/editor\/\$\{workflow\.id\}`\)/);
  assert.match(source, /navigate\(`\/app\/editor\/\$\{id\}`\)/);
  assert.doesNotMatch(source, /otto-last-workflow/);
});

test('auth gate does not restore editor workflow state for dashboard pages', () => {
  const source = read('canvas/src/components/AuthGate.tsx');

  assert.doesNotMatch(source, /restoreLastWorkflow/);
});

test('editor loads the workflow id from the route and enables autosave', () => {
  const source = read('canvas/src/pages/CanvasApp.tsx');

  assert.match(source, /useParams/);
  assert.match(source, /loadWorkflow\(id\)/);
  assert.match(source, /WorkflowAutosave/);
});

test('toolbar exposes autosave state instead of a manual save button', () => {
  const source = read('canvas/src/components/Toolbar.tsx');

  assert.match(source, /saveStatus/);
  assert.doesNotMatch(source, /onClick=\{handleSave\}/);
});

test('autosave writes are marked and workflow versions use a rolling snapshot', () => {
  const store = read('canvas/src/store.ts');
  const route = read('src/routes/workflows.js');
  const migration = read('migrations/023_workflow_autosave_versions.sql');

  assert.match(store, /autosave: true/);
  assert.match(route, /latest\?\.is_autosave/);
  assert.match(migration, /is_autosave BOOLEAN NOT NULL DEFAULT false/);
});
