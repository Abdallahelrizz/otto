# Track F — First-class sub-workflows

Implementation plan for promoting `sub_workflow` from a thin pass-through to a real callable-workflow primitive: recursion-safe, DB-linked, with input mapping, navigable from the canvas, and visible as nested rows in History.

The plan stays inside the constraints from `CLAUDE.md`:

- No changes to the executor's pull model (`executeDAG` / `runWorkflow` signatures stay backward-compatible).
- `src/auth/api-key.js` is untouched.
- All UI changes live inside the single canvas layout.

---

## 0. Current behavior — quick recap of what's broken

`src/nodes/sub-workflow.js` (42 lines):

| Bug | Effect |
|---|---|
| `ctx` is destructured but the executor never passes it (`runNode` calls `handler({ input, rawInputs, config, credential, workspaceId })`). | `ctx?.recursionDepth ?? 0` is always `0`. A sub-workflow can recursively call itself forever. The 5-step guard never fires. |
| `_recursionDepth` is passed to `runWorkflow({...})` but `runWorkflow` doesn't accept it. | Silently dropped at the destructuring site. Even if the executor passed `ctx`, the child would still see depth 0. |
| The handler returns `{ ...finalOutput, _subExecutionId: executionId }`. | The sub-execution ID leaks into the parent's merged input downstream — `_subExecutionId` shows up in every successor node's input as a stray property. |
| No `parent_execution_id` / `parent_node_id` on `executions`. | History tab can't surface parent/child relationships; debugging across boundaries means manually grepping logs. |
| No input mapping: parent input is forwarded verbatim. | Callable-workflow reuse is awkward — every sub-workflow has to assume the parent's shape. |
| Workflow picker is a bare `<select>`. | Unusable at >20 workflows. |
| No "Open child workflow" affordance. | User has to manually copy the UUID, open the Workflows tab, find it, click it. |

---

## 1. Bug fixes (must land first, separately reviewable)

### 1.1 Recursion depth tracking

The executor's `runNode` signature is settled (CLAUDE.md: "no backend architecture changes"). We avoid touching the per-node handler contract.

**Chosen approach: thread `recursionDepth` through `runWorkflow` and `executeDAG` as ctx, and pass it to the sub-workflow handler via the existing per-node call surface using a closure-captured workflow context exposed on `ctx`.**

Two minimal, additive edits:

1. `src/engine/executor.js`:
   - `runWorkflow({...})` accepts a new optional argument `recursionDepth = 0`.
   - It is stored on the local `ctx` object passed to `executeDAG`: `{ executionId, workspaceId, workflowId, triggerInput, pinnedData, recursionDepth }`.
   - `runNode(node, input, rawInputs, ctx)` already receives the same `ctx`. Extend the handler invocation (one site, line ~318) from:
     ```js
     output = await handler({ input, rawInputs, config: resolvedConfig, credential, workspaceId });
     ```
     to:
     ```js
     output = await handler({
       input,
       rawInputs,
       config: resolvedConfig,
       credential,
       workspaceId,
       ctx: {
         executionId: ctx.executionId,
         workflowId: ctx.workflowId,
         nodeId: node.id,
         recursionDepth: ctx.recursionDepth ?? 0,
       },
     });
     ```
   - This is additive — every other handler keeps ignoring `ctx`.

2. `src/nodes/sub-workflow.js`:
   - `const depth = ctx?.recursionDepth ?? 0;` is now real.
   - When delegating to `runWorkflow`, pass `recursionDepth: depth + 1` (not `_recursionDepth`).

3. `src/queue/worker.js`:
   - The BullMQ worker calls `runWorkflow({ executionId, ... })` for top-level jobs. It does NOT need to pass `recursionDepth` — the default of `0` is correct. No change needed, but call out that **only `subWorkflow` should increment depth**, never the queue.

**Alternative considered — depth on BullMQ job data:** rejected. Sub-workflows currently run **in-process** via `runWorkflow`, not via the queue (see `sub-workflow.js:22` calling `runWorkflow` directly). Putting depth in job data would either force a queue round-trip per sub-call (latency tax, breaks the synchronous return contract) or leave the in-process path uncovered. The closure/ctx approach is the smaller change.

### 1.2 Stop leaking `_subExecutionId` into downstream input

Today: `return { ...finalOutput, _subExecutionId: executionId };` — the sub-execution UUID gets merged into every downstream node's input via `collectInput`.

Fix: separate **data** from **metadata** in the node's output object. Two options:

- **Option A (chosen): namespace metadata under a non-enumerable key.** Return `{ ...finalOutput }`, then `Object.defineProperty(result, '_subExecution', { value: { id: executionId }, enumerable: false })`. Spread (`{...x}`) and `Object.assign` skip non-enumerable keys, so it never leaks into downstream inputs but is still inspectable in `node.output` if logger serializes it (it does not — `JSON.stringify` skips non-enumerable too).
- **Option B: return a `data` envelope `{ data: finalOutput, _subExecution: {...} }`.** Cleaner, but changes the output shape and breaks expressions like `{{ nodes.subA.someField }}`. Rejected.

Verify with Option A:
- `JSON.stringify` will not serialize `_subExecution` → it won't show in History's `output` column. Acceptable cost; the sub-execution link is captured in DB (Section 2) so we don't need it in the JSON output.
- If we DO want it visible in the History UI's node output, we can do **Option A + log it through a side channel**: persist the sub-execution ID into `node_executions` via a new `metadata` JSONB column (avoid; out of scope) OR emit it on the SSE `node:end` event (clean, see Section 4).

**Decision:** Option A + SSE event field `subExecutionId` on `node:end` for sub-workflow nodes. Logger writes the raw `output` (clean, no leak). DB linkage (Section 2) is the source of truth for parent/child navigation.

---

## 2. Database changes

### 2.1 Migration `012_sub_workflow_linking.sql`

Numbering: `migrations/` currently has both `010_error_workflow_trigger.sql` and `010_workflow_tags.sql` (collision already happened) plus likely 011 from a parallel agent. Use **`012_sub_workflow_linking.sql`** to avoid further collisions.

```sql
-- 012_sub_workflow_linking.sql
ALTER TABLE executions
  ADD COLUMN IF NOT EXISTS parent_execution_id UUID
    REFERENCES executions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_node_id TEXT;

CREATE INDEX IF NOT EXISTS idx_executions_parent
  ON executions(parent_execution_id)
  WHERE parent_execution_id IS NOT NULL;
```

Notes:

- `ON DELETE SET NULL` — if the parent gets retention-purged later, the child remains queryable as an orphan. Avoid `ON DELETE CASCADE` so we never silently destroy child run history.
- The partial index keeps the table fast for the 99% case (top-level executions) while making "find children of X" cheap.
- `parent_node_id` is `TEXT` because node IDs in `node_executions.node_id` are already `TEXT` (canvas-generated UUIDs / slugs, not FK-able).

### 2.2 Wire `parent_execution_id` / `parent_node_id` into the create path

`src/engine/logger.js` — `createExecution` signature gains two optional params:

```js
export async function createExecution({
  workflowId, workspaceId, triggerType, input,
  status = 'running', mode = 'full', focusNodeId = null, pinnedData = {},
  parentExecutionId = null,     // NEW
  parentNodeId = null,          // NEW
}) { ... }
```

Update the `INSERT` to include both columns (defaults are `NULL`).

`src/nodes/sub-workflow.js` — when calling `runWorkflow`, also include parent linkage. But `runWorkflow` doesn't accept these directly; it creates its own execution. Two clean options:

- **Option A (chosen): pre-create the child execution in the handler, then pass `existingExecutionId` to `runWorkflow`.** `runWorkflow` already supports `existingExecutionId` (line 39) for the queue path. The handler does:
  ```js
  const childExecutionId = await createExecution({
    workflowId, workspaceId, triggerType: 'subworkflow',
    input: triggerInput, status: 'pending',
    parentExecutionId: ctx.executionId,
    parentNodeId: ctx.nodeId,
  });
  await runWorkflow({
    executionId: childExecutionId,
    workflowId, workspaceId, definition,
    input: triggerInput, triggerType: 'subworkflow',
    recursionDepth: depth + 1,
  });
  ```
  This keeps `runWorkflow`'s contract unchanged (no new params for parent linkage — that lives in `createExecution`).

- Option B: thread `parentExecutionId` / `parentNodeId` into `runWorkflow` and forward them to `createExecution` only when `existingExecutionId` is not provided. Slightly fewer SQL round-trips but adds two parameters to the public entry point. Rejected for surface-area minimization.

---

## 3. Input mapping design

Three modes on the sub-workflow config object. Default stays **pass-through** for backward compatibility — any existing sub-workflow node with no `inputMode` keeps working.

### 3.1 Config shape

```ts
// canvas/src/types.ts (illustrative)
type SubWorkflowConfig = {
  workflowId: string;
  inputMode?: 'passthrough' | 'fields' | 'schema';   // default 'passthrough'

  // mode === 'fields'
  fieldMap?: Array<{
    sourcePath: string;   // dot-path into parent input, or {{ expr }}
    targetPath: string;   // dot-path into the child trigger input
  }>;

  // mode === 'schema'
  inputSchema?: {
    fields: Array<{
      name: string;
      type: 'string' | 'number' | 'boolean' | 'json';
      required?: boolean;
      defaultValue?: string;        // can be a {{ }} expression
    }>;
  };
};
```

### 3.2 Handler logic (in `src/nodes/sub-workflow.js`)

```js
function buildTriggerInput({ inputMode = 'passthrough', fieldMap, inputSchema, parentInput, expressionCtx }) {
  if (inputMode === 'passthrough' || !inputMode) {
    return parentInput;
  }

  if (inputMode === 'fields' && Array.isArray(fieldMap)) {
    const out = {};
    for (const { sourcePath, targetPath } of fieldMap) {
      if (!targetPath) continue;
      const value = resolveExpressionOrPath(sourcePath, expressionCtx);
      setByPath(out, targetPath, value);
    }
    return out;
  }

  if (inputMode === 'schema' && inputSchema?.fields) {
    const out = {};
    for (const f of inputSchema.fields) {
      const raw = parentInput?.[f.name] ?? evalExpr(f.defaultValue, expressionCtx);
      if (raw == null && f.required) throw new Error(`Sub-workflow: required input "${f.name}" missing`);
      out[f.name] = coerce(raw, f.type);
    }
    return out;
  }

  return parentInput;
}
```

Notes:

- Expression resolution already happens for the top-level config in `runNode` via `resolveConfig`. The nested `fieldMap[i].sourcePath` and `inputSchema.fields[i].defaultValue` will pass through `resolveConfig` automatically because `resolveConfig` recurses (per `src/engine/expressions.js`). So `{{ input.userId }}` inside a `sourcePath` resolves before the handler runs. Verify by reading `expressions.js` recursion — if it doesn't recurse into arrays-of-objects deeply enough, fall back to evaluating expressions inside the handler with the `expressionCtx` we'd need to plumb through ctx (out of scope; should work as-is).
- `setByPath` is a small utility — co-locate in `src/utils/path.js` (already has `getByPath`).
- `coerce` is trivial — handles type tags from the schema; throws on bad numeric input only when required.

### 3.3 Resulting `triggerInput`

Whatever `buildTriggerInput` returns is what arrives at the child workflow's trigger node as `ctx.triggerInput` (see `executeDAG`, line 73). The child sees this as `input` at its trigger — same shape it would see from a webhook payload.

---

## 4. Output return contract

### 4.1 What the node returns to its successors

Today: merged outputs of all child terminal nodes + `_subExecutionId` mixed in.

New contract:

- **Data:** identical to today — `Object.assign({}, ...terminalOutputs)`. This is what flows into downstream inputs.
- **Metadata:** sub-execution ID is **not** spread into the data. It's available via:
  1. **SSE event:** `node:end` for sub-workflow nodes carries `subExecutionId` in its payload. Frontend uses this to render the "view child execution" link in `ExecutionPanel`.
  2. **DB:** `executions.parent_execution_id` makes child rows queryable from the parent. The History tab uses this (Section 6).
  3. **Non-enumerable property on the returned object:** `_subExecution: { id }` defined with `enumerable: false`. Inspection-friendly in JS but never serialized into JSON, never spread into downstream inputs.

### 4.2 Emit the SSE field

`src/engine/executor.js` — `runNode` emits `node:end` with `{ status, usage, model }`. Extend to also emit `subExecutionId` when the handler exposes one. Cleanest path:

- The handler returns its data object as today.
- Detect the non-enumerable `_subExecution` after the call:
  ```js
  const subExecutionId = Object.getOwnPropertyDescriptor(output, '_subExecution')?.value?.id ?? null;
  emitExecutionEvent(executionId, 'node:end', {
    ..., subExecutionId,
  });
  ```
- Only emitted when truthy. No new event type, no new contract for unrelated nodes.

### 4.3 What about `node_executions.output`?

The logger calls `JSON.stringify(output ?? null)` for the `output` column. Non-enumerable `_subExecution` won't serialize → output column stays clean. Parent/child linkage is on `executions`, not `node_executions`. This is the right place — sub-execution is a relationship between two execution rows, not a property of one node's output.

---

## 5. Frontend — `SubWorkflowPanel`

Replace the current 24-line panel (`canvas/src/components/ConfigPanel.tsx`, ~line 2117) with a richer form. All state changes go through the existing `onChange(key, value)` pattern.

### 5.1 Layout (top to bottom)

1. **Workflow picker** (searchable dropdown)
   - Reuse pattern from `ModelSelect.tsx` — `<input>` with autocomplete from `workflowList`, click-to-select.
   - Shows workflow name + small UUID tail.
   - "Refresh" icon button calls `fetchWorkflows(true)`.
   - Validation: if `workflowId` is set but no workflow with that ID is in `workflowList`, show a soft warning ("Workflow not found — it may have been deleted or belongs to another workspace") with an input box to paste/keep the raw UUID.
   - **Self-reference warning:** if `workflowId === savedWorkflowId`, show an inline yellow chip: "This sub-workflow calls the current workflow. Recursion is limited to depth 5." (Doesn't block — recursion is sometimes intentional.)

2. **"Open child workflow" button** (just below the picker)
   - Disabled if `workflowId` is empty or not in `workflowList`.
   - Clicking calls a new store action `openChildWorkflow(id)` that:
     1. Prompts to save current workflow if `isDirty` (or just calls `saveWorkflow()` silently — match existing toolbar behavior).
     2. Calls `loadWorkflow(id)` (already in store).
     3. Sets `activeSidebarTab` to `'workflows'` (optional — gives visual confirmation).
   - This is the canvas navigation primitive: there is one canvas, you swap which workflow it's editing.

3. **Input mode selector** (tab strip)
   - Three pills: "Pass-through" / "Field mapping" / "Schema".
   - Default `passthrough` if `config.inputMode` is undefined.
   - Switching modes doesn't clear the other modes' data (so toggling back and forth doesn't lose work).

4. **Mode-specific body**

   - **Pass-through:** Static helper text: "The current node's input is forwarded as-is to the sub-workflow's trigger."

   - **Field mapping:**
     - A table with two columns: Source (`{{ input.foo }}`) and Target (`user.id`).
     - Each row has a delete button.
     - "Add row" button appends `{ sourcePath: '', targetPath: '' }`.
     - Source column uses `ExpressionInput` (consistent with other panels).
     - Target column is a plain input — it's a dot-path, not an expression.
     - Validation: warn on duplicate `targetPath`; warn on empty `targetPath`.

   - **Schema:**
     - List of typed field rows: name, type select (`string|number|boolean|json`), required checkbox, default value (expression input).
     - "Add field" button.
     - Same delete-row UX.

5. **Output preview** (collapsible, optional)
   - If the selected child workflow has trigger samples available (the `trigger_samples` table from migration 009 stores webhook/form/chat samples — sub-workflow doesn't have samples), this is N/A for now.
   - Instead: show **terminal nodes** of the child workflow (nodes with no outgoing edges). Lets the user know what shape to expect.
   - Implementation: when the user picks a workflow, fetch its full definition via `api.getWorkflow(id)`, compute terminal nodes client-side, render their names/types. Cache by `workflowId`. Cheap, no new API.

### 5.2 New store actions

```ts
// canvas/src/store.ts
openChildWorkflow: async (id: string) => {
  await get().saveWorkflow();
  await get().loadWorkflow(id);
  set({ activeSidebarTab: 'workflows' });
},

// optional preview cache
childWorkflowPreviews: Record<string, { terminalNodes: Array<{ id: string; name: string; type: string }> }>;
fetchChildPreview: (id: string) => Promise<void>;
```

### 5.3 Types

Extend `OttoNodeData['config']` typing for sub-workflow nodes via a discriminated `SubWorkflowConfig` (Section 3.1) — but keep `config: Record<string, unknown>` at the store level to avoid a wide refactor. Cast inside `SubWorkflowPanel`.

---

## 6. History tab — parent/child execution linking

### 6.1 API changes

`GET /api/v1/executions/:id` (in `src/routes/executions.js` line 285):

Add a third query for children:

```js
const childResult = await db.query(
  `SELECT id, workflow_id, status, started_at, completed_at, trigger_type,
          parent_node_id, error
   FROM executions
   WHERE parent_execution_id = $1 AND workspace_id = $2
   ORDER BY started_at ASC, id ASC`,
  [id, req.auth.workspaceId]
);
```

Response shape:

```json
{
  "execution": { ... existing ... },
  "nodes": [ ... existing ... ],
  "childExecutions": [
    { "id": "...", "workflow_id": "...", "status": "success",
      "started_at": "...", "completed_at": "...", "trigger_type": "subworkflow",
      "parent_node_id": "node_42", "error": null }
  ]
}
```

Also: extend the list endpoint (`GET /api/v1/executions`) to optionally filter on `parentExecutionId` (`?parent=null` to show only top-level, `?parent=<uuid>` to show direct children). Default behavior **unchanged** to avoid breaking existing UI calls. Then update `HistoryTab.tsx` to pass `parent=null` so top-level history isn't cluttered with sub-runs.

### 6.2 UI changes — `HistoryTab` (canvas/src/components/Sidebar.tsx, line 461)

- Each top-level execution row gets an expand chevron if it has any children (signal via a new column on the list endpoint: `child_count INT` computed via `SELECT COUNT(*) FROM executions WHERE parent_execution_id = e.id` — subquery is fine at this volume, can be denormalized later).
- Expanding fetches `/api/v1/executions/:id` (the detail call) and renders nested rows underneath. Each child row is indented with a vertical line.
- Clicking a child row opens that execution's detail in the existing `ExecutionPanel`. Selecting a child row could also offer "Jump to child workflow" → calls `openChildWorkflow(child.workflow_id)`.

### 6.3 `ExecutionPanel` — "View child execution" links

`canvas/src/components/panels/ExecutionPanel.tsx`:

- When inspecting a sub-workflow node, if its `node:end` event carried `subExecutionId`, show a "View child execution →" button below the node output.
- Button switches the panel to that execution (it already supports inspecting any execution ID; just update the selected ID).

---

## 7. Implementation order

Land in small, independently testable chunks. Each is one PR-sized commit.

| # | File(s) | What |
|---|---|---|
| 1 | `migrations/012_sub_workflow_linking.sql` | Add `parent_execution_id`, `parent_node_id`, partial index. |
| 2 | `src/engine/logger.js` | `createExecution` accepts `parentExecutionId`, `parentNodeId`; INSERT writes them. |
| 3 | `src/engine/executor.js` | `runWorkflow` accepts `recursionDepth`; `runNode` passes `ctx: { executionId, workflowId, nodeId, recursionDepth }` to handlers. Backward-compatible — every handler that ignores `ctx` keeps working. |
| 4 | `src/nodes/sub-workflow.js` | Read `ctx.recursionDepth`, pre-create child execution with parent linkage, call `runWorkflow({ existingExecutionId, recursionDepth: depth + 1 })`, return data with non-enumerable `_subExecution` (no leak). |
| 5 | `src/engine/executor.js` | `runNode` reads non-enumerable `_subExecution` after handler call, includes `subExecutionId` in the `node:end` SSE event. |
| 6 | `src/utils/path.js` | Add `setByPath(obj, dotPath, value)` next to existing `getByPath`. |
| 7 | `src/nodes/sub-workflow.js` | Implement `buildTriggerInput` for `passthrough` / `fields` / `schema` modes. |
| 8 | `src/utils/workflow-validation.js` | Extend `sub_workflow` validation: when `inputMode === 'schema'`, require `inputSchema.fields[].name` for each; when `'fields'`, require `targetPath` for each row. |
| 9 | `src/routes/executions.js` | Detail endpoint returns `childExecutions`; list endpoint accepts `parent` query param and returns `child_count`. |
| 10 | `canvas/src/api.ts` | Add `getExecution` return type for `childExecutions`; add `parent` query to list call. |
| 11 | `canvas/src/types.ts` | Add `SubWorkflowConfig` discriminated type; add `childExecutions`, `child_count` to existing exec types. |
| 12 | `canvas/src/store.ts` | Add `openChildWorkflow(id)` action; (optional) `fetchChildPreview` + cache. |
| 13 | `canvas/src/components/ConfigPanel.tsx` | Rewrite `SubWorkflowPanel`: searchable picker, mode tabs, field-mapping table, schema editor, "Open child workflow" button, optional output preview. |
| 14 | `canvas/src/components/Sidebar.tsx` (`HistoryTab`) | Pass `parent=null` to list call; expand chevron for rows with children; nested child rows on expand. |
| 15 | `canvas/src/components/panels/ExecutionPanel.tsx` | Show "View child execution →" link when the inspected sub-workflow node's SSE `node:end` carried `subExecutionId`. |
| 16 | `test/` (manual) | End-to-end: build parent workflow that calls a child via field-mapping; run; verify child appears nested in History, "Open child workflow" navigates, recursion limit fires at depth 5, no `_subExecutionId` in downstream inputs. |

Optional later (not in this track):

- A `code_count`-style migration to denormalize `child_count` onto `executions` (avoid the subquery if list query latency becomes a problem).
- Promote sub-workflow execution to a BullMQ job for crash-resilience — currently a process crash mid-sub kills both parent and child cleanly via the executor's promise rejection, which is acceptable.

---

## 8. Risks and open questions

1. **Expression resolution depth inside arrays-of-objects in config.** `resolveConfig` (in `expressions.js`) needs to recurse into `fieldMap: [{ sourcePath: '{{ input.x }}', ... }]` for the field-mapping mode to work without handler-side eval. If it doesn't, we need to either deepen `resolveConfig` (low risk — it's a JSON walker) or evaluate inside the handler with an `expressionCtx` plumbed via `ctx`. Verify by reading `expressions.js` before writing tests.

2. **Backward compatibility of `_subExecutionId` removal.** Any existing user workflow that downstream-references `{{ nodes.subA._subExecutionId }}` will break silently. Mitigations: (a) keep `_subExecutionId` as a non-enumerable but `JSON.stringify`-skippable property — but expressions resolve via `getByPath`, which uses bracket access and will find non-enumerable keys. So expressions would still work but JSON serialization wouldn't. (b) Add a one-line release note: "If you referenced `_subExecutionId` in expressions, switch to `_subExecution.id`." Likely zero users today.

3. **Multi-workspace sub-workflow calls.** Today `sub-workflow.js` looks up the child workflow by ID without checking `workspace_id`. A user with a leaked workflow UUID from another workspace could invoke it. Fix: scope the lookup to `workspaceId`. Strictly a security bug, fold into this track.

4. **Recursion guard is per-call, not per-execution.** Depth 5 in a chain (A→A→A→A→A) is caught. But if A fans out to A 100 times at depth 1, depth never exceeds 1 but you've spawned 100 child executions per parent. Open question: add a `subWorkflowCallCount` guard on `ctx`? n8n caps at 100 calls per execution. Recommend adding a `MAX_TOTAL_SUB_CALLS = 100` counter on the parent execution row or in-process via a `WeakMap<executionId, count>`. Out of scope for v1, ticket for follow-up.

5. **Child workflow could be `active: false`.** Should we still allow calling it? Today: yes (no active-flag check). n8n only requires `active` for trigger-based runs, not for sub-workflow callability. Keep current behavior, but document explicitly in the panel helper text.

---

```
TRACK_F_DONE
File created: docs/plans/sub-workflows.md
```
