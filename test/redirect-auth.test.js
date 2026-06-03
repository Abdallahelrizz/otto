// test/redirect-auth.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import { stripAuthAcrossHost } from '../src/utils/redirect-auth.js';

test('keeps headers when redirect stays on the same host', () => {
  const opts = { headers: { Authorization: 'Bearer secret', Accept: 'application/json' } };
  const out = stripAuthAcrossHost(opts, 'https://api.github.com/a', 'https://api.github.com/b');
  assert.equal(out.headers.Authorization, 'Bearer secret');
  assert.equal(out.headers.Accept, 'application/json');
});

test('drops auth headers when redirect crosses to another host', () => {
  const opts = { headers: { Authorization: 'Bearer secret', cookie: 'x=1', Accept: 'application/json' } };
  const out = stripAuthAcrossHost(opts, 'https://api.github.com/a', 'https://evil.example/b');
  assert.equal(out.headers.Authorization, undefined);
  assert.equal(out.headers.cookie, undefined);
  assert.equal(out.headers.Accept, 'application/json');
});

test('is case-insensitive about auth header names', () => {
  const opts = { headers: { authorization: 'Bearer secret', 'Proxy-Authorization': 'x' } };
  const out = stripAuthAcrossHost(opts, 'https://a.test/', 'https://b.test/');
  assert.equal(Object.keys(out.headers).length, 0);
});

test('resolves relative redirect targets against the source url (same host kept)', () => {
  const opts = { headers: { Authorization: 'Bearer secret' } };
  const out = stripAuthAcrossHost(opts, 'https://api.github.com/a', '/relative/path');
  assert.equal(out.headers.Authorization, 'Bearer secret');
});

test('does not mutate the original options', () => {
  const opts = { headers: { Authorization: 'Bearer secret' } };
  stripAuthAcrossHost(opts, 'https://a.test/', 'https://b.test/');
  assert.equal(opts.headers.Authorization, 'Bearer secret');
});
