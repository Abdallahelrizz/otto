// test/services-engine.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import { makeServiceHandler } from '../src/nodes/services/_engine.js';

const descriptor = {
  type: 'demo', label: 'Demo', category: 'integrations',
  base: 'https://api.demo.test',
  credential: { catalog: 'demoApi', keys: ['token', 'value'] },
  auth: { kind: 'bearer', headers: { Accept: 'application/json' } },
  defaultOperation: 'get_thing',
  operations: {
    get_thing: { method: 'GET', path: '/things/{id}',
      fields: [{ key: 'id', required: true }] },
    create_thing: { method: 'POST', path: '/things',
      fields: [{ key: 'name', required: true }], body: { name: '{name}' } },
    list_things: { method: 'GET', path: '/things',
      query: { state: '{state}' } },
  },
};

// Capturing fake request: records args, returns a canned response.
function fakeRequest() {
  const calls = [];
  const fn = async (url, options) => { calls.push({ url, options }); return { statusCode: 200, body: { ok: true } }; };
  fn.calls = calls;
  return fn;
}

test('builds a GET with bearer auth and encoded path', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(descriptor, { request });
  const out = await handler({ config: { operation: 'get_thing', id: 'a/b' }, credential: { data: { token: 'secret' } } });
  assert.equal(request.calls[0].url, 'https://api.demo.test/things/a%2Fb');
  assert.equal(request.calls[0].options.method, 'GET');
  assert.equal(request.calls[0].options.headers.Authorization, 'Bearer secret');
  assert.equal(request.calls[0].options.headers.Accept, 'application/json');
  assert.deepEqual(out, { statusCode: 200, body: { ok: true } });
});

test('never returns the credential token in the output', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(descriptor, { request });
  const out = await handler({ config: { operation: 'get_thing', id: '1' }, credential: { data: { token: 'secret' } } });
  assert.equal(JSON.stringify(out).includes('secret'), false);
});

test('throws on a missing required field', async () => {
  const handler = makeServiceHandler(descriptor, { request: fakeRequest() });
  await assert.rejects(
    handler({ config: { operation: 'get_thing' }, credential: { data: { token: 't' } } }),
    /id/
  );
});

test('builds a POST body from the operation template', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(descriptor, { request });
  await handler({ config: { operation: 'create_thing', name: 'Otto' }, credential: { data: { token: 't' } } });
  assert.equal(request.calls[0].options.method, 'POST');
  assert.equal(request.calls[0].options.body, JSON.stringify({ name: 'Otto' }));
});

test('appends an encoded query string', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(descriptor, { request });
  await handler({ config: { operation: 'list_things', state: 'open' }, credential: { data: { token: 't' } } });
  assert.equal(request.calls[0].url, 'https://api.demo.test/things?state=open');
});

test('uses defaultOperation when none is given', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(descriptor, { request });
  await handler({ config: { id: '1' }, credential: { data: { token: 't' } } });
  assert.equal(request.calls[0].url, 'https://api.demo.test/things/1');
});

test('throws on an unknown operation', async () => {
  const handler = makeServiceHandler(descriptor, { request: fakeRequest() });
  await assert.rejects(
    handler({ config: { operation: 'nope' }, credential: { data: { token: 't' } } }),
    /unknown operation/i
  );
});

test('passes a response cap and an abort signal to the request', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(descriptor, { request });
  await handler({ config: { operation: 'get_thing', id: '1' }, credential: { data: { token: 't' } } });
  assert.equal(typeof request.calls[0].options.maxBytes, 'number');
  assert.ok(request.calls[0].options.signal instanceof AbortSignal);
});

test('configurable base: rejects a non-https baseFrom value', async () => {
  const cfgDescriptor = { ...descriptor, base: undefined, baseFrom: 'instanceUrl' };
  const handler = makeServiceHandler(cfgDescriptor, { request: fakeRequest() });
  await assert.rejects(
    handler({ config: { operation: 'get_thing', id: '1', instanceUrl: 'http://insecure.test' }, credential: { data: { token: 't' } } }),
    /https/i
  );
});
