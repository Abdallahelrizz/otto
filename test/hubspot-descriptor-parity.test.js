// test/hubspot-descriptor-parity.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import hubspotDescriptor from '../src/nodes/services/hubspot.service.js';
import { makeServiceHandler } from '../src/nodes/services/_engine.js';

function fakeRequest() {
  const calls = [];
  const fn = async (url, options) => { calls.push({ url, options }); return { statusCode: 200, body: {} }; };
  fn.calls = calls;
  return fn;
}
const cred = { data: { accessToken: 'hs_test' } };

test('descriptor type is hubspot_api', () => {
  assert.equal(hubspotDescriptor.type, 'hubspot_api');
});

test('list_contacts → GET /crm/v3/objects/contacts?limit=10', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(hubspotDescriptor, { request });
  await handler({ config: { operation: 'list_contacts', limit: 10 }, credential: cred });
  assert.equal(request.calls[0].url, 'https://api.hubapi.com/crm/v3/objects/contacts?limit=10');
  assert.equal(request.calls[0].options.method, 'GET');
});

test('create_contact → POST /crm/v3/objects/contacts with parsed properties body', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(hubspotDescriptor, { request });
  await handler({ config: { operation: 'create_contact', properties: '{"email":"a@b.co"}' }, credential: cred });
  assert.equal(request.calls[0].url, 'https://api.hubapi.com/crm/v3/objects/contacts');
  assert.equal(request.calls[0].options.method, 'POST');
  const body = JSON.parse(request.calls[0].options.body);
  assert.deepEqual(body, { properties: { email: 'a@b.co' } });
});

test('bearer header is set from credential accessToken', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(hubspotDescriptor, { request });
  await handler({ config: { operation: 'list_contacts', limit: 5 }, credential: cred });
  assert.equal(request.calls[0].options.headers.Authorization, 'Bearer hs_test');
});

test('get_contact → GET /crm/v3/objects/contacts/:contactId', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(hubspotDescriptor, { request });
  await handler({ config: { operation: 'get_contact', contactId: '123' }, credential: cred });
  assert.equal(request.calls[0].url, 'https://api.hubapi.com/crm/v3/objects/contacts/123');
  assert.equal(request.calls[0].options.method, 'GET');
});

test('create_deal → POST /crm/v3/objects/deals with parsed dealProperties body', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(hubspotDescriptor, { request });
  await handler({ config: { operation: 'create_deal', dealProperties: '{"dealname":"Big Deal"}' }, credential: cred });
  assert.equal(request.calls[0].url, 'https://api.hubapi.com/crm/v3/objects/deals');
  assert.equal(request.calls[0].options.method, 'POST');
  const body = JSON.parse(request.calls[0].options.body);
  assert.deepEqual(body, { properties: { dealname: 'Big Deal' } });
});

test('list_deals → GET /crm/v3/objects/deals?limit=10', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(hubspotDescriptor, { request });
  await handler({ config: { operation: 'list_deals', limit: 10 }, credential: cred });
  assert.equal(request.calls[0].url, 'https://api.hubapi.com/crm/v3/objects/deals?limit=10');
  assert.equal(request.calls[0].options.method, 'GET');
});
