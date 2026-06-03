// test/services-validate.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import { validateDescriptor } from '../src/nodes/services/_validate.js';

const valid = {
  type: 'demo', label: 'Demo', category: 'integrations',
  base: 'https://api.demo.test',
  credential: { catalog: 'demoApi', keys: ['token'] },
  auth: { kind: 'bearer' },
  operations: { ping: { method: 'GET', path: '/ping' } },
};

test('accepts a well-formed descriptor', () => {
  assert.doesNotThrow(() => validateDescriptor(valid));
});

test('rejects a missing type', () => {
  assert.throws(() => validateDescriptor({ ...valid, type: undefined }), /type/);
});

test('rejects an unknown auth kind', () => {
  assert.throws(() => validateDescriptor({ ...valid, auth: { kind: 'magic' } }), /auth\.kind/);
});

test('rejects a descriptor with no base and no baseFrom', () => {
  const d = { ...valid }; delete d.base;
  assert.throws(() => validateDescriptor(d), /base/);
});

test('rejects an operation missing method or path', () => {
  assert.throws(
    () => validateDescriptor({ ...valid, operations: { bad: { method: 'GET' } } }),
    /path/
  );
});

test('rejects a descriptor with no operations', () => {
  assert.throws(() => validateDescriptor({ ...valid, operations: {} }), /operation/i);
});
