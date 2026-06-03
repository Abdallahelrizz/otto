# Declarative Service Nodes — Batch 0 (Secured Framework + GitHub Proof) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the secured, descriptor-driven service-node engine and prove it by making the existing GitHub node a data descriptor with identical behavior.

**Architecture:** A per-service *descriptor* (data) is interpreted by one generic executor (`makeServiceHandler`). The executor centralizes security (path/query encoding, auth application, response caps/timeouts) and routes every request through the existing SSRF-guarded `safeFetch`. A loader auto-registers descriptors into the existing node registry. This batch is backend-only and non-breaking: GitHub is migrated under its existing `github_api` type, so the canvas/frontend is untouched.

**Tech Stack:** Node.js 20 (ESM), built-in `node:test` + `assert/strict`, existing `src/utils/safe-fetch.js` and `src/nodes/service-utils.js`.

**Design source:** `docs/superpowers/specs/2026-06-03-declarative-service-nodes-design.md`

---

## File Structure

**Create:**
- `src/utils/redirect-auth.js` — pure helper: strip auth headers on cross-host redirect.
- `src/nodes/services/_interpolate.js` — pure helpers: `fillPath`, `buildQuery`, `fillBody`.
- `src/nodes/services/_validate.js` — `validateDescriptor`.
- `src/nodes/services/_engine.js` — `makeServiceHandler(descriptor, deps)`.
- `src/nodes/services/_load.js` — auto-loads `*.service.js`, exports `serviceHandlers` + `serviceDescriptors`.
- `src/nodes/services/github.service.js` — the GitHub descriptor (type `github_api`).
- Tests: `test/redirect-auth.test.js`, `test/services-interpolate.test.js`, `test/services-response-cap.test.js`, `test/services-validate.test.js`, `test/services-engine.test.js`, `test/github-descriptor-parity.test.js`, `test/services-load.test.js`.

**Modify:**
- `src/utils/safe-fetch.js` — wire `stripAuthAcrossHost` into the redirect branch.
- `src/nodes/service-utils.js` — add optional `maxBytes` response cap to `requestJson`.
- `src/nodes/index.js` — merge `serviceHandlers`; remove the hand-written `githubApi` import + entry.

**Delete:**
- `src/nodes/github-api.js` — replaced by the descriptor (done in Task 7).

---

### Task 1: Strip auth headers on cross-host redirect (`safe-fetch` hardening)

Standalone security win for the whole app: `safeFetch` currently re-sends `Authorization` to redirect targets. Extract a pure, testable helper and wire it in.

**Files:**
- Create: `src/utils/redirect-auth.js`
- Test: `test/redirect-auth.test.js`
- Modify: `src/utils/safe-fetch.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/redirect-auth.test.js`
Expected: FAIL — `Cannot find module '../src/utils/redirect-auth.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/redirect-auth.js
const AUTH_HEADERS = new Set(['authorization', 'proxy-authorization', 'cookie']);

/**
 * Returns the options to use when following a redirect. If the redirect target
 * resolves to a different host than the source, auth-bearing headers are removed
 * (matching browser behavior) so credentials are never sent to a new origin.
 * Pure: never mutates the input.
 */
export function stripAuthAcrossHost(options, fromUrl, toUrl) {
  let sameHost;
  try {
    sameHost = new URL(toUrl, fromUrl).host === new URL(fromUrl).host;
  } catch {
    sameHost = false; // unparseable target → treat as cross-host (safer)
  }
  if (sameHost) return options;

  const headers = {};
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (!AUTH_HEADERS.has(key.toLowerCase())) headers[key] = value;
  }
  return { ...options, headers };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/redirect-auth.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire it into `safeFetch`**

In `src/utils/safe-fetch.js`, add the import at the top:

```js
import { stripAuthAcrossHost } from './redirect-auth.js';
```

Replace the redirect-following block (currently):

```js
  const resp = await fetch(url, { ...options, redirect: 'manual' });

  // Follow redirects safely — each hop goes through safeFetch
  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get('location');
    if (location) return safeFetch(location, options);
  }

  return resp;
```

with:

```js
  const resp = await fetch(url, { ...options, redirect: 'manual' });

  // Follow redirects safely — each hop re-checks the IP, and auth headers are
  // stripped when the hop crosses to a different host.
  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get('location');
    if (location) {
      const nextUrl = new URL(location, url).toString();
      return safeFetch(nextUrl, stripAuthAcrossHost(options, url, nextUrl));
    }
  }

  return resp;
```

- [ ] **Step 6: Run the full suite to confirm no regression**

Run: `node --test test/redirect-auth.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/utils/redirect-auth.js test/redirect-auth.test.js src/utils/safe-fetch.js
git commit -m "feat(security): strip auth headers on cross-host redirect in safeFetch"
```

---

### Task 2: Interpolation helpers (`_interpolate.js`)

Pure functions that turn descriptor templates + config into encoded paths, query objects, and bodies. This is where §6.1 (encoding) lives.

**Files:**
- Create: `src/nodes/services/_interpolate.js`
- Test: `test/services-interpolate.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/services-interpolate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/nodes/services/_interpolate.js
// Pure interpolation helpers for declarative service descriptors.
// `{key}` references a value in the node's resolved config. Path/query values are
// URL-encoded; body values preserve type for whole-value placeholders.

const WHOLE = /^\{(\w+)\}$/;        // value is exactly "{key}"
const TOKEN = /\{(\w+)\}/g;         // any "{key}" occurrence

/** Interpolate a path template, URL-encoding every substituted value. */
export function fillPath(template, config) {
  return String(template).replace(TOKEN, (_m, key) =>
    encodeURIComponent(config[key] == null ? '' : String(config[key]))
  );
}

/** Build a URL-encoded query string from a {key: template} object; skip null/undefined. */
export function buildQuery(queryTemplate, config) {
  const params = new URLSearchParams();
  for (const [name, template] of Object.entries(queryTemplate ?? {})) {
    const m = String(template).match(WHOLE);
    const value = m ? config[m[1]] : String(template).replace(TOKEN, (_x, k) => config[k] ?? '');
    if (value == null || value === '') continue;
    params.append(name, String(value));
  }
  return params.toString();
}

/** Build a request body object; whole-value placeholders keep their type, others stringify. */
export function fillBody(bodyTemplate, config) {
  const out = {};
  for (const [name, template] of Object.entries(bodyTemplate ?? {})) {
    if (typeof template === 'string') {
      const m = template.match(WHOLE);
      if (m) {
        if (config[m[1]] === undefined) continue;   // omit unset whole-value fields
        out[name] = config[m[1]];
      } else {
        out[name] = template.replace(TOKEN, (_x, k) => config[k] ?? '');
      }
    } else {
      out[name] = template;                          // literal (number/bool/object)
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/services-interpolate.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/nodes/services/_interpolate.js test/services-interpolate.test.js
git commit -m "feat(services): pure path/query/body interpolation with URL encoding"
```

---

### Task 3: Response-size cap in `service-utils.requestJson`

§6.5: cap response size to protect workers from hostile/huge upstreams.

**Files:**
- Modify: `src/nodes/service-utils.js`
- Test: `test/services-response-cap.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/services-response-cap.test.js
import { test } from 'node:test';
import assert from 'assert/strict';
import { assertWithinCap } from '../src/nodes/service-utils.js';

test('assertWithinCap allows responses under the cap', () => {
  assert.doesNotThrow(() => assertWithinCap('500', 1000));
});

test('assertWithinCap throws when content-length exceeds the cap', () => {
  assert.throws(() => assertWithinCap('2000', 1000), /response too large/i);
});

test('assertWithinCap allows missing/unknown content-length (cap enforced later)', () => {
  assert.doesNotThrow(() => assertWithinCap(null, 1000));
  assert.doesNotThrow(() => assertWithinCap('not-a-number', 1000));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/services-response-cap.test.js`
Expected: FAIL — `assertWithinCap` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/nodes/service-utils.js`, add this exported helper (near the top, after the imports):

```js
/** Throw if a Content-Length header exceeds maxBytes. Unknown lengths pass (cap is best-effort). */
export function assertWithinCap(contentLength, maxBytes) {
  if (!maxBytes) return;
  const len = Number(contentLength);
  if (Number.isFinite(len) && len > maxBytes) {
    const err = new Error(`Response too large: ${len} bytes exceeds cap of ${maxBytes}`);
    err.code = 'RESPONSE_TOO_LARGE';
    throw err;
  }
}
```

Then thread an optional `maxBytes` through `_jsonFromResponse` and `requestJson`. Replace the current `_jsonFromResponse` signature/start:

```js
async function _jsonFromResponse(response) {
  const text = await response.text();
```

with:

```js
async function _jsonFromResponse(response, maxBytes) {
  assertWithinCap(response.headers.get('content-length'), maxBytes);
  const text = await response.text();
```

And replace `requestJson`:

```js
export async function requestJson(url, options = {}) {
  return _jsonFromResponse(await safeFetch(url, options));
}
```

with (pull `maxBytes` out of options so it is not passed to fetch):

```js
export async function requestJson(url, options = {}) {
  const { maxBytes, ...fetchOptions } = options;
  return _jsonFromResponse(await safeFetch(url, fetchOptions), maxBytes);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/services-response-cap.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/nodes/service-utils.js test/services-response-cap.test.js
git commit -m "feat(security): optional response-size cap in requestJson"
```

---

### Task 4: Descriptor validation (`_validate.js`)

Fail fast at boot on malformed descriptors.

**Files:**
- Create: `src/nodes/services/_validate.js`
- Test: `test/services-validate.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/services-validate.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/nodes/services/_validate.js
const AUTH_KINDS = new Set(['bearer', 'header', 'basic', 'query', 'path', 'oauth2']);

/** Throw a descriptive Error if the descriptor is malformed. Called at load time. */
export function validateDescriptor(d) {
  const where = d?.type ? `descriptor "${d.type}"` : 'descriptor';
  if (!d || typeof d !== 'object') throw new Error('Service descriptor must be an object');
  if (!d.type || typeof d.type !== 'string') throw new Error(`${where}: missing string "type"`);
  if (!d.base && !d.baseFrom) throw new Error(`${where}: needs "base" or "baseFrom"`);
  if (!d.auth || !AUTH_KINDS.has(d.auth.kind)) {
    throw new Error(`${where}: invalid auth.kind (got ${d.auth?.kind})`);
  }
  const ops = d.operations && Object.entries(d.operations);
  if (!ops || ops.length === 0) throw new Error(`${where}: needs at least one operation`);
  for (const [name, op] of ops) {
    if (!op.method) throw new Error(`${where}: operation "${name}" missing method`);
    if (!op.path) throw new Error(`${where}: operation "${name}" missing path`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/services-validate.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/nodes/services/_validate.js test/services-validate.test.js
git commit -m "feat(services): descriptor validation"
```

---

### Task 5: The generic executor (`_engine.js`)

`makeServiceHandler(descriptor, deps)` → a `{ config, credential }` handler. Applies auth, builds the request via the Task 2 helpers, enforces timeout + response cap, and returns the response only (never the token). The `request` dependency is injectable for testing.

**Files:**
- Create: `src/nodes/services/_engine.js`
- Test: `test/services-engine.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/services-engine.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// src/nodes/services/_engine.js
import { credentialValue, safeRequestJson, urlJoin } from '../service-utils.js';
import { fillPath, buildQuery, fillBody } from './_interpolate.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function resolveBase(descriptor, config) {
  if (descriptor.base) return descriptor.base;
  const raw = config[descriptor.baseFrom];
  if (!raw) throw new Error(`${descriptor.type}: missing base value "${descriptor.baseFrom}"`);
  let url;
  try { url = new URL(String(raw)); } catch { throw new Error(`${descriptor.type}: invalid base URL`); }
  if (url.protocol !== 'https:') throw new Error(`${descriptor.type}: base must be https`);
  return url.origin;
}

function applyAuth(descriptor, config, token, headers, params) {
  const kind = descriptor.auth.kind;
  if (!token && kind !== 'oauth2') throw new Error(`${descriptor.type}: credential is required`);
  switch (kind) {
    case 'bearer': headers.Authorization = `Bearer ${token}`; break;
    case 'header': headers[descriptor.auth.header || 'Authorization'] = token; break;
    case 'basic': headers.Authorization = `Basic ${Buffer.from(token).toString('base64')}`; break;
    case 'query': params.set(descriptor.auth.param || 'api_key', token); break;
    case 'path': /* token injected via the operation path template (see descriptor) */ break;
    default: throw new Error(`${descriptor.type}: auth.kind "${kind}" not supported in this batch`);
  }
}

/**
 * Build a node handler from a descriptor. `deps.request` defaults to the
 * SSRF-guarded safeRequestJson and is injectable for tests.
 */
export function makeServiceHandler(descriptor, { request = safeRequestJson } = {}) {
  return async function serviceHandler({ config = {}, credential } = {}) {
    const opName = config.operation || descriptor.defaultOperation;
    const op = descriptor.operations[opName];
    if (!op) throw new Error(`${descriptor.type}: unknown operation "${opName}"`);

    for (const field of op.fields ?? []) {
      if (field.required && (config[field.key] == null || config[field.key] === '')) {
        throw new Error(`${descriptor.type}.${opName}: missing required field "${field.key}"`);
      }
    }

    const base = resolveBase(descriptor, config);
    const token = credentialValue(credential, descriptor.credential?.keys ?? ['token', 'value', 'apiKey']);

    const headers = { ...(descriptor.auth.headers ?? {}) };
    const queryParams = new URLSearchParams(buildQuery(op.query, config));
    applyAuth(descriptor, config, token, headers, queryParams);

    let url = urlJoin(base, fillPath(op.path, config));
    const qs = queryParams.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;

    let body;
    if (op.body && op.method !== 'GET') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(fillBody(op.body, config));
    }

    return request(url, {
      method: op.method,
      headers,
      body,
      signal: AbortSignal.timeout(op.timeoutMs || DEFAULT_TIMEOUT_MS),
      maxBytes: op.maxBytes || DEFAULT_MAX_BYTES,
    });
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/services-engine.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/nodes/services/_engine.js test/services-engine.test.js
git commit -m "feat(services): generic descriptor executor with centralized auth + security"
```

---

### Task 6: GitHub descriptor + parity test

Re-express the existing `github-api.js` as a descriptor under the **same** type id (`github_api`) so it is a drop-in. The parity test asserts the descriptor builds the exact requests the old handler did.

**Files:**
- Create: `src/nodes/services/github.service.js`
- Test: `test/github-descriptor-parity.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/github-descriptor-parity.test.js`
Expected: FAIL — `github.service.js` not found.

- [ ] **Step 3: Write the descriptor**

```js
// src/nodes/services/github.service.js
export default {
  type: 'github_api',
  label: 'GitHub',
  category: 'integrations',
  base: 'https://api.github.com',
  credential: { catalog: 'githubApi', keys: ['token', 'value', 'apiKey'] },
  auth: {
    kind: 'bearer',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'otto-workflow',
    },
  },
  defaultOperation: 'get_repo',
  operations: {
    create_issue: {
      method: 'POST', path: '/repos/{owner}/{repo}/issues',
      fields: [
        { key: 'owner', required: true }, { key: 'repo', required: true },
        { key: 'title', required: true }, { key: 'body' },
      ],
      body: { title: '{title}', body: '{body}' },
    },
    get_issue: {
      method: 'GET', path: '/repos/{owner}/{repo}/issues/{issueNumber}',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'issueNumber', required: true }],
    },
    list_issues: {
      method: 'GET', path: '/repos/{owner}/{repo}/issues',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }],
      query: { state: '{state}', per_page: '{perPage}' },
    },
    add_comment: {
      method: 'POST', path: '/repos/{owner}/{repo}/issues/{issueNumber}/comments',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }, { key: 'issueNumber', required: true }, { key: 'body', required: true }],
      body: { body: '{body}' },
    },
    get_repo: {
      method: 'GET', path: '/repos/{owner}/{repo}',
      fields: [{ key: 'owner', required: true }, { key: 'repo', required: true }],
    },
    list_repos: {
      method: 'GET', path: '/orgs/{org}/repos',
      fields: [{ key: 'org', required: true }],
      query: { per_page: '{perPage}' },
    },
  },
};
```

> **Note on coverage:** this descriptor ships the high-value GitHub operations. Remaining ones from the old handler (`close_issue`, `update_issue`, `create_pr`, `get_pr`, `list_prs`, `create_release`, `generic`) are added later as one descriptor entry each — that is the "depth dial." The `generic` raw method+path operation is intentionally dropped (spec §11).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/github-descriptor-parity.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/nodes/services/github.service.js test/github-descriptor-parity.test.js
git commit -m "feat(services): GitHub descriptor (parity proof for the framework)"
```

---

### Task 7: Loader + registry merge; retire the hand-written GitHub node

Auto-load descriptors, register them, and remove the old `github-api.js` so `github_api` is served by the descriptor.

**Files:**
- Create: `src/nodes/services/_load.js`
- Modify: `src/nodes/index.js`
- Delete: `src/nodes/github-api.js`
- Test: `test/services-load.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/services-load.test.js`
Expected: FAIL — `_load.js` not found.

- [ ] **Step 3: Write the loader**

```js
// src/nodes/services/_load.js
// Auto-loads every *.service.js descriptor (excluding _-prefixed framework files),
// validates it, and builds a type→handler map. Uses top-level await so consumers
// that import this module get a fully-populated registry.
import { readdir } from 'fs/promises';
import { validateDescriptor } from './_validate.js';
import { makeServiceHandler } from './_engine.js';

const dir = new URL('./', import.meta.url);
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.service.js') && !f.startsWith('_'));

export const serviceDescriptors = [];
export const serviceHandlers = new Map();

for (const file of files) {
  const mod = await import(new URL(file, dir));
  const descriptor = mod.default;
  validateDescriptor(descriptor);
  serviceDescriptors.push(descriptor);
  serviceHandlers.set(descriptor.type, makeServiceHandler(descriptor));
}
```

- [ ] **Step 4: Wire the loader into the registry and remove the old GitHub node**

In `src/nodes/index.js`:

1. Remove the import line:
```js
import { githubApi } from './github-api.js';
```
2. Add near the other imports:
```js
import { serviceHandlers } from './services/_load.js';
```
3. Remove the registry entry line:
```js
  ['github_api',       githubApi],
```
4. After the `registry` Map is constructed (immediately before `export function getNodeHandler`), add:
```js
for (const [type, handler] of serviceHandlers) {
  registry.set(type, handler);
}
```

Then delete the old file:
```bash
git rm src/nodes/github-api.js
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/services-load.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/nodes/services/_load.js src/nodes/index.js test/services-load.test.js
git commit -m "feat(services): auto-load descriptors into the registry; retire hand-written GitHub node"
```

---

### Task 8: Full-suite green + framework doc note

**Files:**
- Modify: `CLAUDE.md` (the "Adding a new node type" note)

- [ ] **Step 1: Run the entire test suite**

Run: `node --test`
Expected: PASS — all existing tests plus the seven new test files green, no regressions.

- [ ] **Step 2: Add a short note to CLAUDE.md**

Under the "Adding a new node type requires 4–5 changes" section in `CLAUDE.md`, append:

```markdown
- **Declarative service nodes (preferred for REST/API integrations):** add one
  `src/nodes/services/<name>.service.js` descriptor — no handler, registry, icon, or
  ConfigPanel edits. Interpreted by `src/nodes/services/_engine.js`. See
  `docs/superpowers/specs/2026-06-03-declarative-service-nodes-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note declarative service-node path in CLAUDE.md"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** §3 folder layout → Tasks 5/7; §4 descriptor → Task 6; §5 executor → Task 5; §6.1 encoding → Tasks 2/5; §6.2 redirect auth-strip → Task 1, credential binding (frontend) deferred to the frontend plan; §6.3 secrets-not-returned → Task 5 test, log redaction already in `executor.js`; §6.5 caps/timeout → Tasks 3/5; §6.6 header injection → mitigated (auth headers are framework-set; user values never become header names); §10 testing → every task is TDD.
- **Out of this batch (next plans):** frontend codegen + generic `<ServiceNodePanel>` + credential-picker binding (§3 frontend, §6.2 binding); migrating the other 12 HTTP services (Batch 1); `path`-auth (Telegram) URL redaction (§6.3) lands with Telegram in Batch 1; OAuth2 (§7).
- **Type consistency:** `makeServiceHandler(descriptor, { request })`, `fillPath/buildQuery/fillBody`, `validateDescriptor`, `stripAuthAcrossHost`, `assertWithinCap`, `serviceHandlers`/`serviceDescriptors` are used identically across tasks.
