// test/services-load.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import { serviceHandlers, serviceDescriptors } from '../src/nodes/services/_load.js';
import { getNodeHandler } from '../src/nodes/index.js';

test('loader exposes the github_api descriptor handler', () => {
  assert.equal(typeof serviceHandlers.get('github_api'), 'function');
});

test('loader collects descriptor metadata', () => {
  const gh = serviceDescriptors.find((d) => d.type === 'github_api');
  assert.ok(gh);
  assert.equal(gh.label, 'GitHub');
});

test('the registry serves github_api from the loader', () => {
  assert.equal(typeof getNodeHandler('github_api'), 'function');
});
