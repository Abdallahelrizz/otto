# Declarative Service Nodes — Design

**Date:** 2026-06-03
**Status:** Approved design (pre-implementation)
**Owner:** Otto canvas/engine

---

## 1. Problem & Context

Otto ships ~17 service/integration nodes, but the credential catalog
(`canvas/public/credential-catalog.json`) advertises **398 services** with brand
logos. So ~380 services are "ghosts" — a logo and a name with no node to use them
in a request. This is the documented *Node and Credential Ecosystem Breadth Gap*
(`docs/n8n-vs-otto-gap-analysis.md`).

**Decision (made during brainstorming):** close the gap by building **native nodes
for all services, in batches**. To make "all" tractable and to defer the
MVP-vs-full-depth question, nodes are not hand-written. Instead we introduce a
**declarative node framework**: each service is a *data descriptor*, interpreted by
one shared generic executor, with an escape hatch for anything that doesn't fit.

### Why declarative

Every existing service handler is the same shape: `{config, credential}` → resolve
token → `switch(operation)` → interpolate path/body → `safeRequestJson(...)`. That
shape is pure boilerplate around data. Moving the data into a descriptor and the
logic into one executor means:

- **"All in batches"** becomes trivial — a batch is a folder of descriptors.
- **MVP vs full depth** stops being a decision — start a node with one operation,
  add operations later; each is one object entry, zero refactor ("depth dial").
- **Security is implemented once** in the executor and inherited by every service
  (vs. 400 chances to get it wrong independently).
- Reuses all existing infrastructure: `safeFetch` (SSRF guard), `credentialValue`,
  `safeRequestJson`, the encrypted credential store, `ServiceLogo`.

---

## 2. Goals / Non-Goals

**Goals**
- A descriptor-driven framework where adding a service = writing one descriptor file
  + running codegen. No per-node handler/registry/icon/ConfigPanel edits.
- Behavior-preserving migration of the existing HTTP service nodes.
- Security controls centralized in the executor (see §6).
- Incremental operation depth per service.

**Non-Goals (this spec)**
- OAuth2 services (Google, Microsoft). They require an OAuth2 credential subsystem,
  scoped to a later batch. The framework reserves `auth.kind: 'oauth2'` for them.
- Non-HTTP services (`postgres_query`, `redis_get/set`, `s3_object`) — they stay
  bespoke (the escape hatch).
- User-supplied / community descriptors at runtime (explicit trust-boundary
  decision; see §6).

---

## 3. Architecture

Three pieces:

1. **Descriptor** (`src/nodes/services/<name>.service.js`) — pure data: `base` URL,
   `auth`, `credential` mapping, and an `operations` map.
2. **Generic executor** (`src/nodes/services/_engine.js`) —
   `makeServiceHandler(descriptor)` returns a `{config, credential}` handler.
3. **Escape hatch** — a descriptor may set `handler: customFn`, or a service may
   remain a hand-written node entirely (non-HTTP, OAuth2, binary, odd pagination).

### Backend folder layout

```
src/nodes/
  services/
    _engine.js        # makeServiceHandler(descriptor) — the one executor
    _load.js          # auto-loads *.service.js, validates, builds handler map
    _validate.js      # descriptor schema validation (fail fast at boot)
    github.service.js # descriptor
    slack.service.js  # descriptor
    …
  index.js            # spreads the service handler map into the existing registry
```

`index.js` stops growing per service: it imports the auto-loaded service map once
and merges it into the registry. Hand-written nodes are untouched.

### Frontend integration (kills the other file-edits)

- Descriptors are the **single source of truth**. A codegen script
  (`npm run gen:nodes`) reads `*.service.js` and emits
  `canvas/src/components/nodes/nodeConfig.generated.ts` with the integration
  `NodeTypeDef` entries — preserving the current **static** nodeConfig architecture,
  generated instead of hand-typed.
- **One generic `<ServiceNodePanel>`** in `ConfigPanel.tsx` renders *any* descriptor:
  an operation dropdown + the selected operation's `fields`. Replaces per-service
  ConfigPanel cases.
- **Icon is free** — the descriptor's `credential.catalog` already flows through the
  `ServiceLogo` path now wired into `OttoNode`. No `NodeIcon.tsx` edits.

Net: adding a service = write one descriptor + `npm run gen:nodes`.

---

## 4. Descriptor Schema

```js
// src/nodes/services/github.service.js
export default {
  type: 'github',                 // node type id (unique)
  label: 'GitHub',
  category: 'integrations',
  base: 'https://api.github.com', // FIXED. Never user-substitutable.
  credential: { catalog: 'githubApi', keys: ['token', 'value', 'apiKey'] },
  auth: {
    kind: 'bearer',               // bearer | header | basic | query | oauth2(deferred)
    headers: {                    // static headers applied to every request
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'otto-workflow',
    },
  },
  defaultOperation: 'get_repo',
  operations: {
    create_issue: {
      label: 'Create issue',
      method: 'POST',
      path: '/repos/{owner}/{repo}/issues',  // {x} interpolates config.x (encoded)
      fields: [
        { key: 'owner', label: 'Owner', required: true },
        { key: 'repo',  label: 'Repo',  required: true },
        { key: 'title', label: 'Title', required: true },
        { key: 'body',  label: 'Body',  type: 'textarea' },
        { key: 'labels', label: 'Labels', type: 'code', json: true },
      ],
      body: { title: '{title}', body: '{body}', labels: '{labels}' },
      // optional: query: { state: '{state}' }
    },
    get_issue: {
      label: 'Get issue', method: 'GET',
      path: '/repos/{owner}/{repo}/issues/{issueNumber}',
      fields: [
        { key: 'owner', required: true }, { key: 'repo', required: true },
        { key: 'issueNumber', type: 'number', required: true },
      ],
    },
    // add an operation = add one entry (the "depth dial")
  },
};
```

**Field types** mirror the existing `FieldDef` union in `nodeConfig.ts`
(`text | textarea | number | select | code`), plus `json: true` to mark a value that
should be parsed before sending.

---

## 5. Generic Executor Behavior

`makeServiceHandler(descriptor)` returns `async ({ config, credential }) => result`:

1. Select operation: `descriptor.operations[config.operation] ?? descriptor.operations[descriptor.defaultOperation]`.
2. Validate required fields for that operation; throw a clear error if missing.
3. Resolve token: `config.<override> || credentialValue(credential, descriptor.credential.keys)`.
4. Build URL: `urlJoin(base, interpolate(op.path, config))` — **base is fixed**,
   interpolated values are `encodeURIComponent`-d (see §6.1).
5. Build query (if any) and body from `op.body`/`op.query` via the same interpolation;
   `json: true` fields are parsed with `parseJson`.
6. Build headers: static `auth.headers` + the auth header derived from `auth.kind`.
7. Call `safeRequestJson(url, { method, headers, body, signal })` with a timeout and
   a response-size cap.
8. Return `{ statusCode, headers, body }` (response only — never the request/creds).

The descriptor's `{field}` interpolation is **plain substitution** — distinct from
Otto's `{{ }}` expression resolver (which runs earlier in `runNode`). No eval, no
templating engine, reads only this node's config.

---

## 6. Security Requirements

Centralizing the executor means each control is implemented once and inherited by
every service. The following are **required engine behaviors**, not optional.

### 6.1 Interpolation — injection & SSRF
- `encodeURIComponent` every interpolated **path segment** and **query value**.
- `base`/host is **descriptor-fixed**, never user-substitutable.
- `urlJoin`'s absolute-URL passthrough (`^https?://`) applies only to descriptor
  *literals*, never to interpolated user values — so a user value cannot become the
  host or an absolute URL.
- This blocks path traversal (`../`), query injection (`&admin=true`), and
  absolute-URL override.

### 6.2 Credential leakage
- **Cross-origin redirect:** `safe-fetch.js` currently re-sends the same options
  (incl. `Authorization`) to redirect targets. **Harden it to strip auth headers when
  the redirect host differs from the original host.** (Concrete change to
  `safe-fetch.js`.)
- **Credential binding:** the config credential picker only offers credentials whose
  type matches the descriptor's `credential.catalog`.

### 6.3 Secrets never logged
- The resolved token and auth headers must never appear in node `output`,
  `node_executions` rows, or error messages. Redact auth fields before logging;
  return response body only.

### 6.4 No SSTI / expression collision
- `{field}` substitution is literal, no eval, scoped to this node's config; must not
  re-enter the `{{ }}` expression context.

### 6.5 Response cap + timeout
- `AbortController` timeout per request and a max-bytes response cap in the executor
  (hundreds of nodes amplify OOM/DoS risk from hostile upstreams).

### 6.6 Header injection
- Reject CRLF in any interpolated header value; never interpolate into header names.

### 6.7 Trust boundary
- Descriptors are **in-repo, code-reviewed, build-time only**. End users cannot
  supply descriptors at runtime — no user-controlled-descriptor SSRF/RCE. If
  community/custom service nodes are ever added, that is a separate sandboxing
  decision and out of scope here.

### Already solid (must keep using)
- `safeFetch` SSRF guard: blocks loopback/RFC1918/link-local + cloud-metadata
  `169.254/16` + `100.64/10` (IPv4 & IPv6 incl. `::ffff:` mapped) and re-checks every
  redirect hop. The executor must use `safeRequestJson`/`safeFetch` only — never raw
  `fetch`.

### Residual platform gaps (noted, not fixed here)
- **DNS-rebinding TOCTOU** in `safeFetch` (checks one resolved IP, `fetch` resolves
  independently). Low risk here because service hosts are descriptor-fixed; mostly
  matters for credential-supplied hosts (postgres/redis). Real fix = resolve-once +
  pin-IP. Already on Otto's deferred SSRF list.
- OAuth2 batch brings its own surface (PKCE/state, redirect-URI allowlist, refresh
  token storage, scope minimization).

---

## 7. Credentials Mapping

- `auth.kind` ∈ `{ bearer, header, basic, query }` for batch 1; the existing generic
  credential store already covers all of these — **no new credential code**.
- `auth.kind: 'oauth2'` is reserved; implementing it is a later foundational batch.
- Credentials remain workspace-scoped and AES-256-GCM encrypted; the executor reads
  values via `credentialValue` and never returns them.

---

## 8. Existing Nodes

- **Migrate to descriptors (HTTP REST, 13):** Slack, Discord, Telegram, GitHub,
  Notion, Airtable, GraphQL, Stripe, SendGrid, Twilio, Salesforce, HubSpot, Linear.
  Behavior-preserving; existing tests are the oracle.
- **Stay bespoke (non-HTTP, escape hatch):** `postgres_query`, `redis_get`,
  `redis_set`, `s3_object`.
- Hand-written core/AI/trigger nodes are unaffected.

---

## 9. Batching Roadmap

- **Batch 0 — Framework.** `_engine.js`, `_load.js`, `_validate.js`, registry merge,
  `gen:nodes` codegen, generic `<ServiceNodePanel>`, credential-picker binding,
  `safe-fetch` redirect auth-strip. Convert **GitHub** as proof; assert identical
  behavior.
- **Batch 1 — Migrate the 13 HTTP services** to descriptors; delete the old handlers.
- **Batch 2+ — New API-key services,** grouped ~8–12 per batch (dev tools, support,
  commerce, …).
- **Batch N — OAuth2 foundation,** then Google Workspace / Microsoft as descriptors.

---

## 10. Testing Strategy

- **Descriptor validation at boot** (`_validate.js`): malformed descriptor → server
  fails fast.
- **Engine unit tests:** interpolation encoding, path-traversal blocked,
  host-not-substitutable, auth application, body building, response cap + timeout,
  redirect auth-strip.
- **Per-service smoke (table-driven, `safeFetch` mocked):** each operation asserts the
  exact URL/method/headers/body; no live network. Adding an operation adds a row.
- **Migration regression:** for the 13 migrated nodes, assert descriptor output
  matches the old handler on representative operations.
- Precedent: `test/transform-nodes-smoke.js`.

---

## 11. Open Decisions

- **Generic operation per service?** The current GitHub node exposes a raw
  `method+path` operation. Recommend **omitting** it by default in descriptors
  (smaller surface); allow opt-in per descriptor when genuinely useful.
- **Catalog provenance.** The 398-entry catalog mirrors n8n's credential list and
  brushes against the "no n8n source" constraint. Decide whether to keep, curate, or
  trim to a self-owned set (separate from this framework, but related).
