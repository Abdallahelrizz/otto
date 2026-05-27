# Track E — Durable Wait/Resume

> Implementation plan for the `wait` node and the persistence/resume machinery that lets a workflow pause for time, webhook, or form input, free its BullMQ worker slot, survive process restarts, and resume seamlessly.

---

## Goals and non-goals

**Goals**
- Add a `wait` node that pauses workflow execution at that node.
- Free the BullMQ worker concurrency slot while paused (unlike `delay`, which blocks).
- Persist enough state to survive a server restart.
- Resume on (a) time elapsed, (b) unique webhook hit, (c) form submission.
- Reuse the existing `pinnedData` + `mode: 'from_node'` resume path in `src/engine/executor.js` so we do not invent a new execution model.

**Non-goals**
- No changes to the executor's pull-model semantics, the DAG parser, the node registry contract, or the route layering.
- No multi-tenant resume-token sharing — tokens are workspace-scoped.
- Not removing `delay`; `delay` stays as the in-worker sub-5-minute pause. `wait` is the durable variant.

---

## 1. Database changes

### 1.1 New status value on `executions`

Today, `executions.status` is constrained to `('pending','running','success','error','cancelled')` (`migrations/001_initial.sql:64`). We need a `'waiting'` value.

Postgres CHECK constraints cannot be altered in place; the migration must drop the existing constraint and recreate it.

```sql
ALTER TABLE executions DROP CONSTRAINT IF EXISTS executions_status_check;
ALTER TABLE executions
  ADD CONSTRAINT executions_status_check
  CHECK (status IN ('pending','running','success','error','cancelled','waiting'));
```

The same status value should be exposed in the existing `/metrics` Prometheus counter list in `src/server.js` (add `'waiting'` to the `statuses` array).

### 1.2 New columns on `executions`

Rather than create a separate `suspended_executions` table, store the suspension state on the execution row itself. This keeps reads cheap (single row to render an exec) and reuses the existing `pinned_data` JSONB column for accumulated upstream outputs.

```sql
ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS wait_node_id     TEXT,
  ADD COLUMN IF NOT EXISTS wait_type        TEXT
    CHECK (wait_type IN ('time','webhook','form')),
  ADD COLUMN IF NOT EXISTS wait_until       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resume_token     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS resume_payload   JSONB,   -- payload from webhook/form on resume
  ADD COLUMN IF NOT EXISTS resumed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_executions_resume_token
  ON executions(resume_token) WHERE resume_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_executions_wait_until
  ON executions(wait_until) WHERE status = 'waiting' AND wait_type = 'time';

CREATE INDEX IF NOT EXISTS idx_executions_status_waiting
  ON executions(status) WHERE status = 'waiting';
```

### 1.3 Reuse existing columns — no new persistence shape needed

| Need | Reuse |
|---|---|
| Which node is paused | `executions.wait_node_id` (new) + `focus_node_id` set at resume |
| Accumulated outputs of nodes that ran before the wait | `executions.pinned_data` (already exists, `migrations/006_execution_debugging.sql:5`) |
| Workflow snapshot at suspend time | `workflows.definition` (re-read at resume; if user edited mid-wait, the resumed run uses the latest definition — acceptable for v1) |
| Trigger input that started the run | `executions.input` (already exists) |

**Cursor:** `wait_node_id` *is* the cursor. Resume re-enqueues with `mode: 'from_node', nodeId: wait_node_id, pinnedData: <snapshot + wait-node output>`.

### 1.4 Pinning the wait node's output

When the wait resumes, the wait node itself must not re-pause. We achieve this by pinning the **wait node's output** (the resume payload) into `pinned_data[wait_node_id]`. The executor's existing `hasPinned()` branch in `src/engine/executor.js:133-158` returns the pinned value without invoking the handler. That is exactly the behavior we want.

---

## 2. Wait node design

### 2.1 New file: `src/nodes/wait.js`

The handler does **not** sleep, poll, or call BullMQ directly. It returns a sentinel signaling the executor to suspend.

**Config fields:**

| Field | Type | Notes |
|---|---|---|
| `wait_type` | `'time' \| 'webhook' \| 'form'` | required |
| `duration_seconds` | number | required when `wait_type='time'` (no 5-minute cap; up to a config-driven max, default 30 days) |
| `resume_url_base` | string | for `wait_type='webhook'`; defaults to the public host. The generated URL is `${base}/webhooks/resume/${token}` |
| `form_path` | string | for `wait_type='form'`; used to render a form (`/forms/resume/${token}`) |
| `form_fields` | array | reuse `form_trigger` field shape (label, name, type, required) |
| `timeout_seconds` | number | optional outer timeout for webhook/form waits; falls through with `{ timedOut: true }` on expiry instead of throwing |
| `resume_authentication` | `'none' \| 'header_token' \| 'basic_auth'` | optional auth on the resume URL |
| `limit_one_resume` | boolean | default true; if false, additional hits are ignored (we still only resume once — only useful for idempotent retry shaping) |

**Handler contract:**

```js
import { WAIT } from '../engine/wait.js';

export async function waitNode({ config }) {
  // Validate config (throw on bad shape — the executor catches and marks node error)
  // Return the WAIT sentinel wrapped in a descriptor that the executor reads.
  return {
    [WAIT]: true,
    waitType: config.wait_type,
    durationSeconds: config.wait_type === 'time' ? Number(config.duration_seconds) : null,
    timeoutSeconds: config.timeout_seconds ?? null,
    resumeAuth: config.resume_authentication ?? 'none',
    formPath: config.form_path ?? null,
    formFields: config.form_fields ?? null,
  };
}
```

### 2.2 New file: `src/engine/wait.js`

Mirrors `src/engine/skip.js` — a single symbol export plus a small type guard:

```js
export const WAIT = Symbol('WAIT');

export function isWaitDescriptor(value) {
  return value != null && typeof value === 'object' && value[WAIT] === true;
}
```

### 2.3 Why a descriptor, not a thrown exception

A thrown `WaitSignal` would short-circuit `Promise.all` in `executeDAG` and we would lose the outputs of other parallel branches that completed successfully. Returning a value lets the executor finish whatever else was already running, collect every completed node's output into `pinnedData`, then suspend. This matches how `SKIP` is propagated as a value, not an exception.

---

## 3. Executor changes

### 3.1 New custom error: `WaitSignal`

`runNode` returning a wait descriptor needs to bubble out to `executeDAG`. The cleanest path:

- Add `WaitSignal extends Error` at top of `src/engine/executor.js` (or in `src/engine/wait.js`).
- In `runNode`, after `await handler(...)`, if the output is a wait descriptor, **log the node as `'waiting'`** (new `node_executions.status` value — see 3.4), emit an `execution:wait` SSE event, and `throw new WaitSignal({ nodeId, descriptor, partialOutputs })`.

### 3.2 `executeDAG` — collect partial state on WaitSignal

Today `executeDAG` runs `await Promise.all([...dag.nodes.keys()].map(getOutput))`. To gather as many sibling branches as possible before suspending, switch the top-level await to `Promise.allSettled` **only when we detect a `WaitSignal`**:

- Wrap each top-level `getOutput(id)` so a settled result is `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`.
- If any rejection is a `WaitSignal`, return `{ waited: true, waitNodeId, descriptor, outputs: nodePromises }`.
- Otherwise behave exactly as today (re-throw the first non-wait rejection — preserves current error semantics).

Concretely: replace the final `await Promise.all(...)` with a helper that returns either the existing `nodePromises` map or a `{ waited: true, ... }` envelope.

### 3.3 `runWorkflow` — branch on suspend

Inside the `try { ... }` block, after `await dagPromise`:

```js
if (result?.waited) {
  // 1. Snapshot all completed node outputs into pinnedData
  const pinned = await snapshotCompletedOutputs(result.outputs, dag);
  // pinned merges existing ctx.pinnedData + every settled node's output
  // (but NOT the wait node itself yet — that gets pinned only on resume)

  // 2. Persist suspension
  await suspendExecution(executionId, {
    waitNodeId: result.waitNodeId,
    descriptor: result.descriptor,
    pinnedData: pinned,
  });

  // 3. Emit wait event for live SSE consumers
  emitExecutionEvent(executionId, 'execution:wait', {
    waitNodeId: result.waitNodeId,
    waitType: result.descriptor.waitType,
    waitUntil: ..., // computed in suspendExecution
    resumeToken: ...,
  });

  // 4. Return cleanly — DO NOT call completeExecution()
  return { executionId, status: 'waiting' };
}
await completeExecution(executionId, { status: 'success' });
```

`suspendExecution` (new helper in `src/engine/logger.js`):

- Generates a `resume_token` via `crypto.randomBytes(32).toString('base64url')`.
- Computes `wait_until = NOW() + (durationSeconds * INTERVAL '1 second')` when `wait_type='time'`, otherwise from `timeout_seconds`.
- `UPDATE executions SET status='waiting', wait_node_id=$1, wait_type=$2, wait_until=$3, resume_token=$4, pinned_data=$5, suspended_at=NOW() WHERE id=$6`.
- For `wait_type='time'`, schedule a BullMQ delayed job (see §4.1) inside the same function so persistence and scheduling are atomic from the worker's POV.

### 3.4 `node_executions.status` value

We want the wait node to render with a distinct "waiting" pill in the panel. Add `'waiting'` to the CHECK constraint:

```sql
ALTER TABLE node_executions DROP CONSTRAINT IF EXISTS node_executions_status_check;
ALTER TABLE node_executions
  ADD CONSTRAINT node_executions_status_check
  CHECK (status IN ('pending','running','success','error','skipped','waiting'));
```

`logger.js` gets a `logNodeWait(logId, { ... })` helper that sets `status='waiting'`, leaves `completed_at` null, and writes a small `{ waitType, waitUntil, resumeToken }` blob into `output`.

### 3.5 Resumed run does not re-pause

Because the resume re-enqueue includes `pinnedData[waitNodeId] = <resume payload>`, the wait node's `getOutput()` short-circuits via `hasPinned()` and never calls `waitNode()` again. The downstream DAG runs from there. No new mechanism needed.

---

## 4. Resume mechanism

### 4.1 Time-based resume (preferred: BullMQ delayed job)

A single BullMQ `delayed` job is simpler and cheaper than a job scheduler:

- Scheduler is repeating; we want one-shot.
- `executionQueue.add('resume', { executionId, resumeToken }, { delay: ms })` is durable in Redis.
- BullMQ delays survive Redis restarts (data persisted) and worker restarts (delayed set is reloaded).
- We do NOT need a polling cron.

Why not BullMQ JobScheduler: schedulers are for recurring patterns. A wait expiry is a single fire-at-time.

The worker (§5) gets a second job name `'resume'` whose handler calls `resumeExecution(executionId, { resumeToken, payload: null })`.

### 4.2 Webhook resume

New route in `src/routes/webhooks.js` (or a new sibling `src/routes/resume.js` to keep concerns clean — recommend the latter):

```
ALL /webhooks/resume/:token
```

Logic:
1. Look up execution by `resume_token` (single indexed query).
2. If not found or status != 'waiting' → 404.
3. Validate auth (header_token / basic_auth) per `wait` node config snapshot — store this in `resume_payload` or refetch from the workflow definition via `wait_node_id`.
4. Build `resumePayload` from `{ method, headers, query, body }` (same shape as `webhook_trigger` produces via `buildTriggerInput`).
5. Call `resumeExecution(executionId, { resumeToken: token, payload: resumePayload })`.
6. Reply `{ status: 'accepted', executionId }` with HTTP 202.

### 4.3 Form resume

Reuse the existing form rendering machinery in `src/routes/webhooks.js`. Two new routes:

```
GET  /forms/resume/:token    → render form HTML using stored form_fields
POST /forms/resume/:token    → same logic as webhook resume, with form-encoded body
```

Form fields come from the wait node config snapshot (read by joining `executions.workflow_id` → `workflows.definition` → find node by `wait_node_id`). Cache the field list at suspend time inside `executions.resume_payload` to avoid re-reading the workflow if the user edited it mid-wait.

### 4.4 `resumeExecution(executionId, { resumeToken, payload })` — new function

Lives in `src/engine/resume.js` (new file) to keep `executor.js` lean.

```js
export async function resumeExecution(executionId, { resumeToken, payload, timedOut = false }) {
  // 1. SELECT FOR UPDATE the row to prevent double-resume races (two
  //    webhook calls in flight, or webhook + time expiry colliding).
  // 2. Validate status='waiting' AND resume_token matches.
  // 3. UPDATE executions SET status='pending', resumed_at=NOW(),
  //    resume_token=NULL (so it cannot be reused), resume_payload=$payload.
  //    Add (timedOut ? { timedOut: true } : {}) to the payload.
  // 4. Read workflow definition + execution row to rebuild job data.
  // 5. Merge pinned_data with [waitNodeId]: payload so the wait node is
  //    pinned to the resume payload on the next run.
  // 6. executionQueue.add('run', {
  //        executionId,
  //        workflowId,
  //        workspaceId,
  //        triggerType: original triggerType,
  //        input: original input,
  //        definition,
  //        mode: 'from_node',
  //        nodeId: wait_node_id,
  //        pinnedData: mergedPinned,
  //      }, { jobId: `${executionId}:resume:${Date.now()}` });
  //    Note: jobId differs from executionId here so the new job doesn't
  //    collide with the original — see "Risks" §9.
}
```

### 4.5 Race: time expiry fires after webhook resume

When a webhook resume succeeds it clears `resume_token`. The delayed time-expiry job arrives later; its first action is to look up the row by `executionId` and check `status='waiting' AND resume_token=$token`. If either check fails, it logs and returns silently. No-op.

### 4.6 What the re-enqueued job looks like

Exactly the shape that `src/routes/executions.js:43-47` already enqueues for manual retries — `enqueueManualExecution()` is essentially what we want, but with `mode='from_node'` and the wait node pinned. We reuse the existing `worker.js` handler with no branch needed: it already plumbs `mode`, `nodeId`, and `pinnedData` to `runWorkflow`.

---

## 5. Worker changes

### 5.1 Two job names

`src/queue/worker.js` currently handles a single job name (implicitly any name). We extend it to dispatch on `job.name`:

```js
async (job) => {
  if (job.name === 'resume') {
    // Time-expiry resume — payload was null at scheduling time
    return resumeExecution(job.data.executionId, {
      resumeToken: job.data.resumeToken,
      payload: null,
      timedOut: true,
    });
  }
  // existing 'run' / 'execute' path
  ...
}
```

This means a delayed `'resume'` job triggers `resumeExecution()`, which immediately enqueues a fresh `'run'` job. The slot held by the resume handler is released within milliseconds — no execution actually runs inside the resume handler.

### 5.2 Reconciliation on boot

The existing `reconcileActiveSchedules()` in `src/server.js:201` is a model to follow. Add `reconcileWaitingExecutions()` in `src/schedules/service.js` (or a new `src/engine/wait-reconcile.js`):

For every `status='waiting' AND wait_type='time'` execution:
- Compute remaining ms = `wait_until - NOW()`.
- If ≤ 0, immediately call `resumeExecution(..., { timedOut: true })`.
- Otherwise, ensure a delayed `'resume'` BullMQ job exists for this execution. Use `jobId = 'wait-resume:${executionId}'` so reconciliation is idempotent — re-adding the same jobId is a no-op for a still-delayed job.

Webhook/form waits need no reconciliation — they wait passively on Postgres + the HTTP route.

Hook this into `src/server.js` next to the existing `reconcileActiveSchedules()` call.

### 5.3 Worker concurrency interaction

The wait node returns the descriptor in microseconds. The worker job completes successfully (returns void). BullMQ frees the slot. Concurrency stays at 10 even with hundreds of suspended executions because none of them occupy a slot.

---

## 6. Frontend changes

### 6.1 `ExecutionPanel.tsx`

- Extend the `executionPhase` mapping in `canvas/src/store.ts` (and `ExecutionPanel.tsx:38-41`) to recognize a `'waiting'` phase.
- Add a `'WAITING'` execLabel + amber pill colour (reuse `--node-running` `#f59e0b`).
- When `executionPhase === 'waiting'`, show a "Resume" section above the inspector:
  - Type: time / webhook / form
  - Time → countdown to `wait_until`, plus "Resume now" button (admin override → POST `/api/v1/executions/:id/resume`)
  - Webhook → display the resume URL with a copy button; show the auth requirement if any
  - Form → display the form URL with a "Open form" link
  - Show "Cancel wait" → calls the existing cancel endpoint (which already transitions to `'cancelled'`)
- The per-node sidebar list should render a node with `status === 'waiting'` using an amber pulse (reuse `otto-pulse` keyframes — currently keyed off `step.status === 'running'`).

### 6.2 New admin resume endpoint

`POST /api/v1/executions/:id/resume` — workspace-scoped, calls `resumeExecution()` with `payload = req.body ?? {}` and `resumeToken` looked up from the row. Lets the canvas force-resume any waiting execution regardless of wait_type.

### 6.3 History tab (Sidebar.tsx)

- Add `'waiting'` to the status filter dropdown.
- Render waiting executions with the amber pill; sort them to the top of the list (or split into a "Waiting" section).
- No new API needed — `GET /api/v1/executions` already accepts `?status=waiting`.

### 6.4 Node config panel

In `ConfigPanel.tsx`, add a `case 'wait'` block:
- Radio for `wait_type` (Time / Webhook / Form)
- Conditional fields per type
- For webhook/form, show the **template** resume URL with `{token}` placeholder — the real token only exists at run time
- Add to `canvas/src/components/nodes/nodeConfig.ts` registry under category `core` (or a new "Flow" category) with the `Clock` Phosphor icon
- Add icon mapping in `canvas/src/components/NodeIcon.tsx`

---

## 7. Migration plan

In order:

1. **`migrations/011_durable_wait.sql`**
   - Drop+recreate `executions_status_check` to include `'waiting'`
   - Drop+recreate `node_executions_status_check` to include `'waiting'`
   - `ALTER TABLE executions ADD COLUMN` for `wait_node_id`, `wait_type`, `wait_until`, `resume_token`, `resume_payload`, `resumed_at`, `suspended_at`
   - Three indexes: `idx_executions_resume_token`, `idx_executions_wait_until`, `idx_executions_status_waiting`

2. **`schema.sql` patch** — apply the same column additions and CHECK changes so fresh `docker compose up` containers start with the schema. Otto's CLAUDE.md notes that `schema.sql` mirrors all migrations.

No data backfill needed — existing rows default to NULL for the new columns and stay in their existing statuses.

---

## 8. Implementation order

| # | File | Change |
|---|---|---|
| 1 | `migrations/011_durable_wait.sql` | New migration (schema in §1, §3.4) |
| 2 | `schema.sql` | Mirror the migration so fresh installs match |
| 3 | `src/engine/wait.js` | New: `WAIT` symbol + `isWaitDescriptor` helper (§2.2) |
| 4 | `src/nodes/wait.js` | New: handler that returns the WAIT descriptor (§2.1) |
| 5 | `src/nodes/index.js` | Register `['wait', waitNode]` in the registry |
| 6 | `src/engine/logger.js` | Add `suspendExecution()`, `logNodeWait()`, `markExecutionResuming()` (§3.3, §3.4) |
| 7 | `src/engine/resume.js` | New: `resumeExecution()` with `SELECT FOR UPDATE` race protection (§4.4) |
| 8 | `src/engine/executor.js` | Add `WaitSignal`, `snapshotCompletedOutputs()`; modify `runNode` to throw `WaitSignal` on wait descriptor; modify `executeDAG` final-await to capture `WaitSignal` via `Promise.allSettled`; modify `runWorkflow` to short-circuit on `result.waited` (§3.1–§3.3) |
| 9 | `src/queue/worker.js` | Dispatch on `job.name`; handle `'resume'` job by calling `resumeExecution(..., timedOut: true)` (§5.1) |
| 10 | `src/schedules/service.js` (or new `src/engine/wait-reconcile.js`) | `reconcileWaitingExecutions()` (§5.2) |
| 11 | `src/server.js` | Call `reconcileWaitingExecutions()` next to `reconcileActiveSchedules()`; add `'waiting'` to metrics statuses (§1.1) |
| 12 | `src/routes/resume.js` | New: `POST /webhooks/resume/:token` and form variants (§4.2, §4.3) |
| 13 | `src/server.js` | Register the new resume route module |
| 14 | `src/routes/executions.js` | Add `POST /api/v1/executions/:id/resume` admin override (§6.2) |
| 15 | `canvas/src/components/nodes/nodeConfig.ts` | Add `wait` node type definition + fields |
| 16 | `canvas/src/components/NodeIcon.tsx` | Map `wait` → `Clock` icon |
| 17 | `canvas/src/components/ConfigPanel.tsx` | New `case 'wait'` inspector panel |
| 18 | `canvas/src/store.ts` | Add `'waiting'` to `executionPhase` mapping; new selector for wait metadata |
| 19 | `canvas/src/components/panels/ExecutionPanel.tsx` | Render WAITING pill, resume URL block, countdown, "Resume now" + "Cancel wait" buttons (§6.1) |
| 20 | `canvas/src/components/Sidebar.tsx` (History tab) | Surface `'waiting'` status filter + amber pill (§6.3) |
| 21 | `canvas/src/api.ts` | New `resumeExecution(executionId, payload)` helper |
| 22 | Manual verification | Build a wait→time, wait→webhook, wait→form workflow; confirm restart-survival by `docker compose restart otto` mid-wait |

---

## 9. Risks and open questions

1. **Job ID collision on resume.** Today `enqueueManualExecution()` uses `jobId: executionId`. A resumed execution reuses the same `executionId` but is a different job. Reusing the same `jobId` while the old completed job still exists in `removeOnComplete` history will fail with `Job already exists`. We must namespace the resume `jobId` (e.g. `${executionId}:resume:${attemptCount}`) and store the attempt count on the row, or rely on `removeOnComplete` having already evicted the old one (fragile). **Decision needed:** drop the unique-per-execution invariant for jobs, or add a `resume_count INTEGER` column.

2. **`Promise.allSettled` vs. error semantics.** Switching to `allSettled` for the top-level wait-detect means a non-wait error in branch A no longer aborts a slower branch B. We mitigate by re-throwing the first non-`WaitSignal` rejection, but in practice branch B will still run to completion. Today's behaviour also runs B to completion (the rejection only short-circuits `Promise.all`'s await, not the underlying promises) — so this is mostly a no-op, but worth a unit test.

3. **Workflow definition mutated during a long wait.** A user could edit the workflow while an execution is suspended for 7 days. On resume we re-read the latest `workflows.definition`, so the resumed run may execute a different DAG than the one that suspended. Alternatives: snapshot the whole definition into the execution row at suspend time, or version-pin via `workflow_versions`. **Recommendation:** v1 reads latest (matches n8n behaviour), document the gotcha. v2 snapshots.

4. **Webhook resume auth.** The resume URL is unguessable (32-byte base64url token), but the workflow may also require additional header auth. We must decide how the wait node stores the auth config so the resume route can validate without re-reading the workflow definition. Storing a small auth blob inside `resume_payload` at suspend time is simplest but means `resume_payload` carries config AND eventually carries the actual resume body — name it more carefully (`resume_meta` for config, `resume_payload` for body) or merge.

5. **Time-wait max duration.** BullMQ delayed jobs work up to Number.MAX_SAFE_INTEGER ms in theory, but very long delays (months) increase the chance of Redis eviction or migration losing the job. Reconciliation in §5.2 covers this: on boot we always re-derive delays from `wait_until` in Postgres, treating Redis as a cache. Worth documenting that Postgres is the source of truth for wait state.

---

```
TRACK_E_DONE
File created: docs/plans/durable-wait-resume.md
```
