// test/services-interpolate.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import { fillPath, buildQuery, fillBody } from '../src/nodes/services/_interpolate.js';

test('fillPath substitutes and URL-encodes each value', () => {
  assert.equal(
    fillPath('/repos/{owner}/{repo}/issues', { owner: 'octo', repo: 'hello' }),
    '/repos/octo/hello/issues'
  );
});

test('fillPath encodes path-traversal and slashes inside a segment', () => {
  assert.equal(
    fillPath('/repos/{owner}/x', { owner: '../../etc' }),
    '/repos/..%2F..%2Fetc/x'
  );
});

test('fillPath treats a missing key as empty', () => {
  assert.equal(fillPath('/a/{missing}/b', {}), '/a//b');
});

test('buildQuery encodes values and skips null/undefined', () => {
  const qs = buildQuery({ state: '{state}', q: '{q}', page: '{page}' },
    { state: 'open', q: 'a&b', page: undefined });
  assert.equal(qs, 'state=open&q=a%26b');
});

test('fillBody substitutes a whole-value placeholder preserving type', () => {
  const body = fillBody({ title: '{title}', count: '{count}' }, { title: 'Hi', count: 5 });
  assert.deepEqual(body, { title: 'Hi', count: 5 });
});

test('fillBody does string substitution for embedded placeholders', () => {
  const body = fillBody({ msg: 'hello {name}' }, { name: 'Ada' });
  assert.deepEqual(body, { msg: 'hello Ada' });
});

test('fillBody omits keys whose whole-value placeholder is undefined', () => {
  const body = fillBody({ a: '{a}', b: '{b}' }, { a: 1 });
  assert.deepEqual(body, { a: 1 });
});
