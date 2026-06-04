# Service Engine Hardening + HubSpot Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the two engine features real services need (credential override, JSON-string body fields), then migrate HubSpot to a descriptor as the proof that the hardened engine handles a real service end-to-end.

**Architecture:** Extend the generic executor (`src/nodes/services/_engine.js`) with (1) an optional config-based credential override and (2) parsing of JSON-string fields before body construction. Then re-express the hand-written HubSpot node as a descriptor; the frontend regenerates automatically.

**Tech Stack:** Node 20 ESM, `node --test`. Reuses `parseJson`/`credentialValue` from `src/nodes/service-utils.js`.

**Spec:** `docs/superpowers/specs/2026-06-03-declarative-service-nodes-design.md`.

---

## Context

GitHub fit the declarative engine perfectly, but exploration of Slack/Stripe/HubSpot/SendGrid showed real services diverge in ways the engine doesn't cover yet:
- **Credential override** — every service handler does `config.<field> || credentialValue(...)` (paste a token, or use a saved credential). The engine only reads the saved credential.
- **JSON-string body fields** — services nest parsed JSON config under a body key (HubSpot `{ properties: <parsed properties> }`, Airtable `{ fields: <parsed fieldsJson> }`, Slack `blocks`). The engine substitutes the raw string, not a parsed object.

Decisions taken: **harden the engine for the common gaps, then migrate clean services**, and **standardize service-node output on `{ statusCode, headers, body }`** (so Slack/Stripe-style unwrapped `.body` output is intentionally changed — no unwrap feature). Services with bespoke shapes (Stripe/Twilio form-encoding, SendGrid nested body, Telegram path-auth, Discord/Salesforce configurable base, Linear GraphQL) stay bespoke for now.

HubSpot is the first migration: it needs only the JSON-field feature (body `{ properties: <parsed> }`), has no inline override, and has no dedicated ConfigPanel case (it already falls through to the generic panel), making it the cleanest real proof.

---

## Phase A — Engine hardening

### Task 1 — Config-based credential override

**Files:** Modify `src/nodes/services/_engine.js`; Test `test/services-engine.test.js` (extend).

- [ ] **Step 1: Add failing tests** to `test/services-engine.test.js` (append two tests):
```js
test('uses a config credential override when descriptor declares one', async () => {
  const request = fakeRequest();
  const d = { ...descriptor, credential: { catalog: 'demoApi', keys: ['token'], overrideField: 'tokenOverride' } };
  const handler = makeServiceHandler(d, { request });
  await handler({ config: { operation: 'get_thing', id: '1', tokenOverride: 'pasted' }, credential: { data: { token: 'stored' } } });
  assert.equal(request.calls[0].options.headers.Authorization, 'Bearer pasted');
});

test('falls back to the stored credential when no override value is present', async () => {
  const request = fakeRequest();
  const d = { ...descriptor, credential: { catalog: 'demoApi', keys: ['token'], overrideField: 'tokenOverride' } };
  const handler = makeServiceHandler(d, { request });
  await handler({ config: { operation: 'get_thing', id: '1' }, credential: { data: { token: 'stored' } } });
  assert.equal(request.calls[0].options.headers.Authorization, 'Bearer stored');
});
```
(`descriptor` and `fakeRequest` already exist at the top of this test file.)

- [ ] **Step 2:** Run `node --test --test-force-exit test/services-engine.test.js` → the two new tests FAIL.

- [ ] **Step 3:** In `_engine.js`, change the token resolution line inside `makeServiceHandler`:
```js
    const token = credentialValue(credential, descriptor.credential?.keys ?? ['token', 'value', 'apiKey']);
```
to:
```js
    const overrideField = descriptor.credential?.overrideField;
    const override = overrideField ? config[overrideField] : undefined;
    const token = override || credentialValue(credential, descriptor.credential?.keys ?? ['token', 'value', 'apiKey']);
```

- [ ] **Step 4:** Run `node --test --test-force-exit test/services-engine.test.js` → all PASS.
- [ ] **Step 5:** Commit `git add src/nodes/services/_engine.js test/services-engine.test.js` → `feat(services): config-based credential override in the executor`.

### Task 2 — JSON-string body fields

**Files:** Modify `src/nodes/services/_engine.js`; Test `test/services-engine.test.js` (extend).

- [ ] **Step 1: Add a failing test** (append):
```js
test('parses JSON-string fields marked json before building the body', async () => {
  const request = fakeRequest();
  const d = { ...descriptor, operations: { ...descriptor.operations, make: {
    method: 'POST', path: '/things',
    fields: [{ key: 'props', json: true }],
    body: { props: '{props}' },
  } } };
  const handler = makeServiceHandler(d, { request });
  await handler({ config: { operation: 'make', props: '{"a":1}' }, credential: { data: { token: 't' } } });
  assert.deepEqual(JSON.parse(request.calls[0].options.body), { props: { a: 1 } });
});
```

- [ ] **Step 2:** Run the test file → new test FAILS (body would be `{"props":"{\"a\":1}"}`).

- [ ] **Step 3:** In `_engine.js`: import `parseJson` (add to the existing `service-utils.js` import). Before the body is built, derive a parsed config:
```js
    const jsonKeys = (op.fields ?? []).filter((f) => f.json).map((f) => f.key);
    const bodyConfig = jsonKeys.length
      ? { ...config, ...Object.fromEntries(jsonKeys.map((k) => [k, parseJson(config[k], undefined)])) }
      : config;
```
and change the body build to use `bodyConfig`:
```js
      body = JSON.stringify(fillBody(op.body, bodyConfig));
```
(Path and query keep using `config` — JSON fields only appear in bodies.)

- [ ] **Step 4:** Run the test file → all PASS.
- [ ] **Step 5:** Commit `git add src/nodes/services/_engine.js test/services-engine.test.js` → `feat(services): parse JSON-string body fields in the executor`.

---

## Phase B — Migrate HubSpot

### Task 3 — HubSpot descriptor + parity test

**Files:** Create `src/nodes/services/hubspot.service.js`, `test/hubspot-descriptor-parity.test.js`.

HubSpot's hand-written handler (`src/nodes/hubspot-api.js`): base `https://api.hubapi.com`, bearer auth from `cred.data.accessToken ?? cred.data.token`, ops: `list_contacts` (GET `/crm/v3/objects/contacts?limit=`), `get_contact` (GET `/crm/v3/objects/contacts/{contactId}`), `create_contact` (POST `/crm/v3/objects/contacts`, body `{properties:<parsed properties>}`), `update_contact` (PATCH `/crm/v3/objects/contacts/{contactId}`, same body), `create_deal` (POST `/crm/v3/objects/deals`, body `{properties:<parsed dealProperties>}`), `list_deals` (GET `/crm/v3/objects/deals?limit=`).

- [ ] **Step 1:** Write `test/hubspot-descriptor-parity.test.js` (mirror `test/github-descriptor-parity.test.js`'s `fakeRequest` pattern) asserting, via `makeServiceHandler(hubspotDescriptor, { request })`: type `hubspot_api`; `list_contacts` → GET `https://api.hubapi.com/crm/v3/objects/contacts?limit=10`; `create_contact` with `properties: '{"email":"a@b.co"}'` → POST `/crm/v3/objects/contacts` with body `{"properties":{"email":"a@b.co"}}`; bearer header `Bearer hs_test` from credential `{ data: { accessToken: 'hs_test' } }`.
- [ ] **Step 2:** Run `node --test --test-force-exit test/hubspot-descriptor-parity.test.js` → FAIL (no descriptor).
- [ ] **Step 3:** Create `src/nodes/services/hubspot.service.js`:
```js
// src/nodes/services/hubspot.service.js
export default {
  type: 'hubspot_api',
  label: 'HubSpot',
  category: 'integrations',
  serviceColor: '#FF7A59',
  base: 'https://api.hubapi.com',
  credential: { catalog: 'hubspotApi', keys: ['accessToken', 'token', 'value'] },
  auth: { kind: 'bearer' },
  defaultOperation: 'list_contacts',
  operations: {
    list_contacts: { method: 'GET', path: '/crm/v3/objects/contacts',
      fields: [{ key: 'limit', label: 'Limit', type: 'number' }], query: { limit: '{limit}' } },
    get_contact: { method: 'GET', path: '/crm/v3/objects/contacts/{contactId}',
      fields: [{ key: 'contactId', required: true }] },
    create_contact: { method: 'POST', path: '/crm/v3/objects/contacts',
      fields: [{ key: 'properties', label: 'Properties (JSON)', type: 'code', json: true, required: true }],
      body: { properties: '{properties}' } },
    update_contact: { method: 'PATCH', path: '/crm/v3/objects/contacts/{contactId}',
      fields: [{ key: 'contactId', required: true }, { key: 'properties', label: 'Properties (JSON)', type: 'code', json: true, required: true }],
      body: { properties: '{properties}' } },
    create_deal: { method: 'POST', path: '/crm/v3/objects/deals',
      fields: [{ key: 'dealProperties', label: 'Deal properties (JSON)', type: 'code', json: true, required: true }],
      body: { properties: '{dealProperties}' } },
    list_deals: { method: 'GET', path: '/crm/v3/objects/deals',
      fields: [{ key: 'limit', label: 'Limit', type: 'number' }], query: { limit: '{limit}' } },
  },
};
```
Note: the `limit` query defaults (old handler used `?? 10`) are dropped — an unset limit simply omits the param (HubSpot defaults server-side). The parity test for `list_contacts` should pass `limit: 10` explicitly to assert the URL.
- [ ] **Step 4:** Run `node --test --test-force-exit test/hubspot-descriptor-parity.test.js` → PASS.
- [ ] **Step 5:** Commit `git add src/nodes/services/hubspot.service.js test/hubspot-descriptor-parity.test.js` → `feat(services): HubSpot descriptor`.

### Task 4 — Retire the hand-written HubSpot node (backend + frontend)

**Files:** Modify `src/nodes/index.js`; delete `src/nodes/hubspot-api.js`; modify `canvas/src/components/nodes/nodeConfig.ts`, `canvas/src/utils/workflowValidation.ts`, `canvas/src/components/ConfigPanel.tsx`; regenerate `canvas/src/generated/serviceNodeDefs.ts`.

- [ ] **Step 1 (backend):** In `src/nodes/index.js`, remove `import { hubspotApi } from './hubspot-api.js';` and the registry line `['hubspot_api', hubspotApi],` (the loader now provides `hubspot_api`). `git rm src/nodes/hubspot-api.js`.
- [ ] **Step 2 (backend sanity):** `node --test --test-force-exit test/services-load.test.js test/hubspot-descriptor-parity.test.js test/transform-nodes-smoke.js` → all pass (confirms `index.js` still loads and `getNodeHandler('hubspot_api')` resolves to the descriptor).
- [ ] **Step 3 (frontend):** In `canvas/src/components/nodes/nodeConfig.ts`, delete the hand-written `hubspot_api` object from `NODE_TYPE_DEFS`. In `canvas/src/utils/workflowValidation.ts`, delete the `hubspot_api:` entry from `NODE_SCHEMAS`. In `canvas/src/components/ConfigPanel.tsx`, delete any `hubspot_api` entries in `FIELD_HELP_BY_NODE`, `REQUIRED_FIELDS_BY_NODE`, and `NODE_CREDENTIAL_TYPE_HINTS` (HubSpot has no dedicated panel/case, so nothing to remove from the `NodePanel` switch — verify).
- [ ] **Step 4 (regenerate + typecheck):** `cd canvas && npm run gen:nodes && npx tsc --noEmit` → generated file now includes `hubspot_api`; tsc clean. Confirm `grep -c "type: 'hubspot_api'" src/components/nodes/nodeConfig.ts` is `0`.
- [ ] **Step 5: Commit** the backend + frontend changes + regenerated file (selective `git add` of: `src/nodes/index.js`, the deleted `src/nodes/hubspot-api.js`, `canvas/src/components/nodes/nodeConfig.ts`, `canvas/src/utils/workflowValidation.ts`, `canvas/src/components/ConfigPanel.tsx`, `canvas/src/generated/serviceNodeDefs.ts`) → `feat: migrate HubSpot to a declarative descriptor`.

---

## Verification
- `node --test --test-force-exit` on the service tests (engine, hubspot parity, load, github parity, nodedef-gen) → all green.
- `cd canvas && npm run build` → gen:nodes + tsc + vite all succeed; `serviceNodeDefs.ts` contains `github_api` and `hubspot_api`.
- Manual: `npm run dev`, drop a HubSpot node → brand logo, Credential picker, Operation dropdown (6 ops), and `create_contact` shows a "Properties (JSON)" code field; no validation errors on a fresh node.

## Follow-up services (subsequent runs, same recipe)
- **Need credential override** (now supported): SendGrid (`add_contact` only — `send_email` body is bespoke), Slack (`blocks` json field + note its `ok:false` success semantics aren't replicated), Notion (drop its `generic` op like GitHub), Airtable.
- **Need new engine features:** Stripe/Twilio (form-encoded bodies + service-specific basic auth), Telegram (`path` auth — token in URL + URL redaction), Discord/Salesforce (configurable `baseFrom` + a frontend base field), Linear/GraphQL (stay bespoke).
