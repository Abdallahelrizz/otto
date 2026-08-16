# Changelog

All notable changes to Otto are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security

- **Critical — expression sandbox escape (RCE) closed.** `{{ }}` expressions ran in a Node
  `vm` context whose sandbox object was a plain `{}`. Because the context global resolves
  unknown lookups against that object, it inherited the **host realm's** `Object.prototype`,
  putting host intrinsics (`this.hasOwnProperty`, `this.valueOf`, …) one lookup from the
  expression — and each is a host function whose `.constructor` is the host `Function`.
  `codeGeneration: { strings: false }` binds the vm context, not the host realm, so that
  constructor still compiled. A crafted expression could therefore execute arbitrary code in
  the server process and read `process.env` (credential encryption key, API-key pepper,
  database URL). The evaluator now passes an `Object.create(null)` sandbox, removing the
  entire class of handle, and serializes results **inside** the context so no vm-realm object
  — and no expression-controlled `toJSON`/getter — is ever touched by host code.
  `test/expression-sandbox.test.js` probes the boundary with the identifier denylist
  deliberately out of the path, so it verifies the sandbox rather than the regex. The preview
  worker also scrubs secret environment variables before evaluating.

  **Known gap:** an expression can still defer work onto the host event loop
  (`async () => { while (true) {} }`), which the evaluation timeout does not bound. Closing it
  requires a terminable execution context; tracked in `HARDENING.md` item 3.
- **Postgres node no longer defaults to the control-plane database.** A credential-less
  `postgres_query` used to run arbitrary SQL against Otto's own database (cross-workspace
  exposure of users, API-key hashes, and credentials). A credential is now required; set
  `POSTGRES_NODE_ALLOW_SYSTEM_DB=true` to opt back into the legacy shared-DB behaviour on a
  trusted single-tenant instance.
- **Code node public-Piston fallback is now opt-in.** It no longer silently ships user code
  and input data to `emkc.org` when a local Piston is unreachable; enable with
  `PISTON_ALLOW_PUBLIC=true`.
- **CORS default-deny in production.** With `ALLOWED_ORIGINS` unset, the server no longer
  reflects arbitrary origins with credentials — it restricts to same-origin in production.
- ⚠️ **BREAKING — `postgres_query` now requires a credential.** It previously fell back to
  the server's own `DATABASE_URL`, which let any workflow author run arbitrary SQL against
  Otto's own tables (`users`, `api_keys`, `credentials`) — a cross-tenant data-exposure
  path. A `postgres_query` node with no credential now errors instead of silently
  connecting. **Migration:** create a Postgres credential and select it on each
  `postgres_query` node. Pointing that credential at Otto's own database restores the old
  behavior, but do so deliberately.
- ⚠️ **BREAKING — the public Piston fallback is now opt-in.** When `PISTON_URL` is
  unreachable, the `code` node previously fell back to the public `emkc.org` instance,
  which sends your **code and input data off-box**. That fallback now requires
  `PISTON_ALLOW_PUBLIC=true`; otherwise the node fails with an actionable message.
  **Migration:** run your own Piston and set `PISTON_URL`, or set `PISTON_ALLOW_PUBLIC=true`
  if sending code and data to a third party is acceptable for your use case.
- **Execution type is now recorded correctly.** Every execution was previously written as
  `execution_type: 'production'` — including manual canvas runs, which displayed a
  "Production" badge. It is now derived from the trigger (`manual`, `api`, `scheduled`,
  `sub_workflow`, `error_workflow`, `resume`, else `production`). This affects the save
  policy (`saveManualExecutions`), retention, and production-vs-manual metrics.
  ⚠️ Rows created before this fix keep their old `production` value; see
  `migrations/025_backfill_execution_type.sql`.
- **Cancelling an execution now actually stops it.** Previously `POST /executions/:id/cancel`
  removed a queued job and marked the row `cancelled`, but manual runs execute in-process,
  so in-flight HTTP/LLM requests kept running and downstream nodes kept executing. An
  `AbortSignal` is now threaded from the execution through every node: SDK calls receive
  `{ signal }`, and `http_request`/service nodes combine it with their per-request timeout
  via `AbortSignal.any` so neither disables the other. Cancellations are not retried, are
  not swallowed by `continueOnError`, and do not trigger the error workflow.
  ⚠️ Limits: cancellation is **in-process** (a run owned by another worker is not aborted),
  and it stops future work rather than undoing past work — side effects already sent are not
  rolled back, and providers may still bill for tokens already generated.
- **DNS-rebinding hardening for outbound fetches.** `safeFetch` validates every resolved
  address and pins the connection to a validated IP, re-checked at connect time via an
  `undici` dispatcher with a guarded DNS lookup. If that dispatcher cannot be constructed
  (e.g. `undici` missing), `safeFetch` now **fails closed** and refuses the request rather
  than silently downgrading to the pre-check alone, which is TOCTOU-vulnerable.
  `undici` is a declared dependency, so this path indicates a broken install.
- **`SSRF_ALLOW_PRIVATE` cannot be used in a hosted build.** The total-bypass switch is
  ignored when `OTTO_HOSTED=true`, so a multi-tenant deployment cannot turn egress
  filtering off.
- **API keys default-deny on empty scopes.** A key row with no scopes now grants nothing
  instead of full access. ⚠️ Note the migration direction: `020_api_key_security.sql` adds
  `scopes TEXT[] NOT NULL DEFAULT ARRAY['*']`, so keys that existed **before** the upgrade
  are back-filled to full access (`['*']`) rather than being revoked. Audit and reissue
  pre-existing keys if you want them scoped down.
- **`GET /metrics` can be gated** behind `METRICS_TOKEN`.

### Added

- **License** — Otto is now released under the Business Source License 1.1 (source-available;
  free to self-host, no competing hosted service; converts to Apache-2.0 on 2030-07-06).
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.dockerignore`, and a CI
  workflow that runs the unit suite and the canvas typecheck on every PR.

### Changed

- **Breaking — expression results now cross the sandbox boundary as JSON.** Previously they
  were `structuredClone`d. Consequences: `{{ $now }}` and `{{ $today }}` return ISO date
  **strings** rather than `Date` objects; `NaN` and `Infinity` become `null`; a `BigInt`
  result now throws instead of serializing. Ordinary data (numbers, strings, booleans,
  arrays, nested objects) is unaffected.

### Fixed

- `npm audit` — patched the nodemailer advisory (send-email node).
