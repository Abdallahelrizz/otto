// test/csrf.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { csrfPlugin } from '../src/middleware/csrf.js';

// Mirrors server.js: routes live in their own registered plugins, so the CSRF hooks only
// protect them if the plugin escapes its encapsulation scope.
async function buildApp() {
  const app = Fastify();
  await app.register(cookie);
  await app.register(csrfPlugin);
  await app.register(async (routes) => {
    routes.get('/api/v1/thing', async () => ({ ok: true }));
    routes.post('/api/v1/thing', async () => ({ ok: true }));
    routes.post('/api/v1/auth/login', async () => ({ ok: true }));
  });
  return app;
}

async function csrfToken(app) {
  const res = await app.inject({ method: 'GET', url: '/api/v1/thing' });
  const set = res.cookies.find((c) => c.name === 'otto-csrf');
  assert.ok(set, 'a CSRF cookie is issued on the first request');
  return set.value;
}

test('issues the CSRF cookie to routes registered in other plugins', async () => {
  const app = await buildApp();
  await csrfToken(app);
  await app.close();
});

test('rejects a state-changing request without a matching token', async () => {
  const app = await buildApp();
  const token = await csrfToken(app);
  const missing = await app.inject({ method: 'POST', url: '/api/v1/thing', cookies: { 'otto-csrf': token } });
  assert.equal(missing.statusCode, 403);
  const wrong = await app.inject({
    method: 'POST', url: '/api/v1/thing', cookies: { 'otto-csrf': token }, headers: { 'x-csrf-token': 'nope' },
  });
  assert.equal(wrong.statusCode, 403);
  await app.close();
});

test('accepts a state-changing request whose header matches the cookie', async () => {
  const app = await buildApp();
  const token = await csrfToken(app);
  const res = await app.inject({
    method: 'POST', url: '/api/v1/thing', cookies: { 'otto-csrf': token }, headers: { 'x-csrf-token': token },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('leaves safe methods and exempt paths alone', async () => {
  const app = await buildApp();
  assert.equal((await app.inject({ method: 'GET', url: '/api/v1/thing' })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v1/auth/login' })).statusCode, 200);
  await app.close();
});
