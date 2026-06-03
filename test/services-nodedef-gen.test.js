// test/services-nodedef-gen.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import { descriptorToNodeDef, humanize } from '../canvas/scripts/descriptor-to-nodedef.mjs';
import githubDescriptor from '../src/nodes/services/github.service.js';

test('humanize converts snake_case and camelCase to Title Case', () => {
  assert.equal(humanize('create_issue'), 'Create Issue');
  assert.equal(humanize('issueNumber'), 'Issue Number');
  assert.equal(humanize('owner'), 'Owner');
});

test('maps type/label/category', () => {
  const def = descriptorToNodeDef(githubDescriptor);
  assert.equal(def.type, 'github_api');
  assert.equal(def.label, 'GitHub');
  assert.equal(def.category, 'integrations');
});

test('defaultConfig uses the descriptor defaultOperation and empty credentialId', () => {
  const def = descriptorToNodeDef(githubDescriptor);
  assert.equal(def.defaultConfig.operation, 'get_repo');
  assert.equal(def.defaultConfig.credentialId, '');
});

test('operations are humanized and carry typed fields', () => {
  const def = descriptorToNodeDef(githubDescriptor);
  assert.equal(def.operations.create_issue.label, 'Create Issue');
  const owner = def.operations.create_issue.fields.find((f) => f.key === 'owner');
  assert.ok(owner, 'owner field present');
  assert.equal(owner.type, 'text');
  assert.equal(owner.label, 'Owner');
});

test('no generic operation', () => {
  const def = descriptorToNodeDef(githubDescriptor);
  assert.equal(def.operations.generic, undefined);
});

test('credentialTypes derived from auth.kind (bearer)', () => {
  const def = descriptorToNodeDef(githubDescriptor);
  assert.ok(def.credentialTypes.includes('bearer_token'));
});

test('serviceCatalog from credential.catalog', () => {
  const def = descriptorToNodeDef(githubDescriptor);
  assert.equal(def.serviceCatalog, 'githubApi');
});

test('output has no excess top-level keys beyond the NodeTypeDef shape', () => {
  const def = descriptorToNodeDef(githubDescriptor);
  const allowed = new Set(['type','category','label','description','color','tint','serviceColor','serviceCatalog','credentialTypes','operations','defaultConfig','fields','handles']);
  for (const k of Object.keys(def)) assert.ok(allowed.has(k), `unexpected key: ${k}`);
});
