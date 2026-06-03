// test/github-descriptor-parity.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import githubDescriptor from '../src/nodes/services/github.service.js';
import { makeServiceHandler } from '../src/nodes/services/_engine.js';

function fakeRequest() {
  const calls = [];
  const fn = async (url, options) => { calls.push({ url, options }); return { statusCode: 200, body: {} }; };
  fn.calls = calls;
  return fn;
}
const cred = { data: { token: 'ghp_test' } };

test('descriptor type matches the existing node id', () => {
  assert.equal(githubDescriptor.type, 'github_api');
});

test('create_issue → POST /repos/:owner/:repo/issues with JSON body', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(githubDescriptor, { request });
  await handler({ config: { operation: 'create_issue', owner: 'octo', repo: 'hello', title: 'Bug' }, credential: cred });
  assert.equal(request.calls[0].url, 'https://api.github.com/repos/octo/hello/issues');
  assert.equal(request.calls[0].options.method, 'POST');
  assert.equal(request.calls[0].options.headers.Authorization, 'Bearer ghp_test');
  assert.equal(JSON.parse(request.calls[0].options.body).title, 'Bug');
});

test('get_issue → GET /repos/:owner/:repo/issues/:issueNumber', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(githubDescriptor, { request });
  await handler({ config: { operation: 'get_issue', owner: 'octo', repo: 'hello', issueNumber: 42 }, credential: cred });
  assert.equal(request.calls[0].url, 'https://api.github.com/repos/octo/hello/issues/42');
  assert.equal(request.calls[0].options.method, 'GET');
});

test('list_issues → GET with state + per_page query', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(githubDescriptor, { request });
  await handler({ config: { operation: 'list_issues', owner: 'octo', repo: 'hello', state: 'closed' }, credential: cred });
  assert.match(request.calls[0].url, /^https:\/\/api\.github\.com\/repos\/octo\/hello\/issues\?/);
  assert.match(request.calls[0].url, /state=closed/);
});

test('sends the GitHub static headers', async () => {
  const request = fakeRequest();
  const handler = makeServiceHandler(githubDescriptor, { request });
  await handler({ config: { operation: 'get_issue', owner: 'o', repo: 'r', issueNumber: 1 }, credential: cred });
  assert.equal(request.calls[0].options.headers.Accept, 'application/vnd.github+json');
  assert.equal(request.calls[0].options.headers['X-GitHub-Api-Version'], '2022-11-28');
});
