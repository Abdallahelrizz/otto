# Otto — AI-Native Workflow Orchestrator

> This project was originally named **Synapse** in the product spec (`cortex_orchestrator_product_idea.pdf`).
> The name is **Otto** everywhere — code, docs, UI, conversation. Never use Synapse.

---

## PRODUCT

### What Otto Is

Otto is an AI-native workflow orchestration platform built from the ground up for AI-first workloads. It is **not** Zapier, n8n, or Make with AI bolted on. AI is a first-class citizen: LLM calls, agents, memory, embeddings, and vector search are platform primitives, not plugins.

**Core differentiators:**
- **True parallel execution** — DAG analysis + `Promise.all()`. Independent branches fire simultaneously, no serialization unless there is an actual data dependency.
- **Memory as a platform primitive** — session, semantic, episodic, and working memory designed in from day one (schema exists; engine not yet wired).
- **AI-native node types** — LLM Call, AI Agent, Embed, Vector Search, Reranker, Memory Read/Write, Confidence Gate, Parallel AI, Stream Response.
- **Visual canvas** — React Flow with real-time execution visualization per node.
- **Full per-node execution logs** — inputs, outputs, timing, token usage, error messages written to Postgres for every node.

### The Benchmark

**Cortex Brain on n8n: 1 minute 49 seconds. Otto: 1.4 seconds.**

Cortex Brain is a biologically-inspired AI cognitive architecture. It has two parallel branches (OpenAI Embed + Hippocampus retrieval running simultaneously), a subconscious LLM (gpt-4o-mini), a confidence gate (IF ≥ 0.75), and an optional consciousness LLM (gpt-4o). n8n serializes every node even when branches are completely independent. Otto runs them with `Promise.all()`. The ~78× speedup is the product's proof of concept.

The benchmark workflow lives in `test/cortex-brain-workflow.json` — 10 nodes, uses `webhook_trigger`, `http_request` (×2 in parallel), `merge`, `llm_call` (×2), `if`, `set` (×2). Every currently-implemented node type is exercised.

### Target User

AI engineers building complex, multi-step AI workflows who have hit the ceiling of n8n, Zapier, or Make — specifically around parallel execution, native LLM primitives, and memory. The founder (Abdallah Elrizz) built Cortex Brain in n8n and hit every one of these ceilings firsthand.

**Each user brings their own API keys** — Otto does not pay for LLM calls. Credentials are user-owned, encrypted at rest with AES-256-GCM, and never returned by the API. Same model as n8n.

### Positioning

> Otto is the workflow orchestrator built for AI engineers. True parallel execution. Native memory. AI-first nodes. Everything n8n should have been.

### Business Model

- **Open-source core engine + canvas** — self-hosting free forever.
- **Otto Cloud** — hosted version is the paid product.
- Monetization timing: build in public ~3 months before adding billing.

---

## ARCHITECTURE

### Folder Structure

```
automation/                   ← ROOT = BACKEND (Node.js / Fastify)
├── src/
│   ├── server.js             ← Fastify entrypoint; MUST have `import 'dotenv/config'` as line 1
│   ├── engine/
│   │   ├── dag.js            ← DAG parser + DFS cycle detector
│   │   ├── executor.js       ← parallel executor: fireWorkflow / runWorkflow / executeDAG
│   │   ├── expressions.js    ← {{ }} template resolver; accepts { input, nodes } context
│   │   ├── credentials.js    ← AES-256-GCM decrypt + credential fetch; writes access log
│   │   ├── logger.js         ← Postgres execution + node_execution logging incl. token columns
│   │   ├── events.js         ← Singleton EventEmitter for SSE streaming
│   │   └── skip.js           ← SKIP sentinel symbol
│   ├── nodes/
│   │   ├── index.js          ← handler registry (Map of type → handler function); 20 handlers
│   │   ├── webhook-trigger.js
│   │   ├── http-request.js
│   │   ├── llm-call.js       ← uses openai + @anthropic-ai/sdk SDKs
│   │   ├── if.js
│   │   ├── merge.js
│   │   ├── set.js
│   │   ├── ai-agent.js       ← tool-use loop, max 100 steps
│   │   ├── delay.js
│   │   ├── filter.js
│   │   ├── loop.js
│   │   ├── sub-workflow.js
│   │   ├── send-email.js     ← nodemailer; SMTP or Resend via credential
│   │   ├── postgres-query.js
│   │   ├── redis-get.js
│   │   ├── redis-set.js
│   │   ├── vector-search.js  ← pgvector <=> similarity on memory_patterns
│   │   ├── schedule-trigger.js ← placeholder pass-through; cron runner not yet built
│   │   ├── code.js           ← placeholder; throws "code handler deferred — sandbox TBD"
│   │   └── placeholder.js    ← used by n8n importer for unmapped node types
│   ├── utils/
│   │   ├── path.js           ← shared getByPath(obj, dotPath) used by if, filter, expressions
│   │   ├── encrypt.js        ← AES-256-GCM encrypt (mirrors credentials.js decrypt)
│   │   └── n8n-importer.js   ← importN8n(json) → { nodes, edges, warnings }
│   ├── routes/
│   │   ├── executions.js     ← POST /execute, GET /:id, GET /:id/stream (SSE), list
│   │   ├── webhooks.js       ← POST /webhooks/:path (enqueues to BullMQ, returns 202)
│   │   ├── workflows.js      ← full CRUD + duplicate + workflow_versions snapshot on PUT
│   │   ├── credentials.js    ← POST (encrypts), GET (no data), DELETE
│   │   ├── import.js         ← POST /api/v1/import/n8n
│   │   └── integrations.js   ← list, installed, install, uninstall
│   ├── seed/
│   │   └── integrations.js   ← 20 official integrations; run once after migrations
│   ├── queue/
│   │   ├── client.js         ← BullMQ Queue + ioredis connection
│   │   └── worker.js         ← BullMQ Worker, concurrency 10
│   └── db/
│       └── client.js         ← pg.Pool, max 10 connections
├── migrations/
│   ├── 001_initial.sql       ← full schema (all tables + indexes)
│   ├── 002_workflow_persistence.sql  ← workspace_id on executions + indexes
│   ├── 003_token_tracking.sql        ← prompt/completion/total_tokens + model on node_executions
│   ├── 004_integrations.sql          ← integrations + workspace_integrations tables
│   └── run.js                ← migration runner (_migrations tracking table)
├── schema.sql                ← all 4 migrations combined; used by docker-compose on first boot
├── docker-compose.yml        ← pgvector/pg16 + redis:7-alpine + otto server
├── Dockerfile                ← node:20-alpine; copies src/ + migrations/ + schema.sql
├── .gitignore                ← excludes node_modules, dist, .env
└── test/
    ├── cortex-brain-workflow.json  ← the benchmark workflow definition
    └── cortex-brain-demo.js        ← demo runner script

automation/canvas/            ← SUBFOLDER = FRONTEND (React + TypeScript + Vite)
├── src/
│   ├── App.tsx               ← root layout: Toolbar + Sidebar + Canvas + ConfigPanel + ContextMenu
│   ├── store.ts              ← Zustand store (all state + actions + buildDefinition helper)
│   ├── api.ts                ← thin fetch wrapper for /api/v1/*
│   ├── types.ts              ← TypeScript interfaces (OttoNodeData, NodeExecution, ExecutionDetail)
│   ├── index.css             ← CSS variables, @font-face, React Flow overrides, animations
│   ├── main.tsx              ← React root mount
│   └── components/
│       ├── Canvas.tsx        ← ReactFlow wrapper, drag/drop, keyboard shortcuts, empty state
│       ├── Sidebar.tsx       ← collapsible accordion, drag-to-canvas + click-to-add
│       ├── Toolbar.tsx       ← wordmark, editable workflow name, Run button, theme toggle
│       ├── ConfigPanel.tsx   ← right inspector: node-specific panels + execution viewer
│       ├── ContextMenu.tsx   ← right-click menu (Duplicate / Rename / Delete)
│       ├── JsonViewer.tsx    ← collapsible syntax-highlighted JSON display
│       ├── ModelSelect.tsx   ← live model fetch from OpenAI / OpenRouter; hardcoded Anthropic
│       ├── NodeIcon.tsx      ← Phosphor icon map; weight determined by category
│       └── nodes/
│           ├── OttoNode.tsx     ← React Flow node card (category-tinted, handles, 3-dot menu)
│           └── nodeConfig.ts    ← node type registry, category style maps, field definitions
```

### Execution Engine

**`src/engine/dag.js` — DAG parser**
- Builds `nodes` (Map id→node), `inEdges` (Map nodeId→[{source, sourceHandle}]), `outEdges` from the workflow JSONB.
- Cycle detection via DFS (WHITE/GRAY/BLACK). Throws before execution starts on circular graphs.
- Preserves `sourceHandle` — critical for IF node true/false branch routing.

**`src/engine/executor.js` — Parallel executor**
- `fireWorkflow()` — creates the execution record immediately, runs via `setImmediate` (non-blocking), returns `executionId`. Used by the canvas Run button.
- `runWorkflow()` — synchronous variant, awaits completion. Used by `/api/v1/workflows/:id/execute` and the BullMQ worker.
- `executeDAG()` — memoized promise-per-node pull model. Each node's promise awaits its dependencies via `Promise.all(deps)`. Nodes with no shared deps fire simultaneously. No coordination overhead.
- `collectInput()` — merges active dep outputs into a single input object. Handles `_ifBranches` shape from IF node. Returns `{ input, rawInputs, skipped }`. `rawInputs` = `[{ source: nodeId, data }]` used by Merge's `collect-array` mode.
- `runNode()` — resolves `{{ }}` expressions in config (with both `input` and `nodes` context), fetches credential if `credentialId` set, calls handler, writes start/end logs, emits SSE events, forwards token usage to logger.
- **SKIP sentinel** — a node whose all active inputs are SKIP is itself skipped. Propagates automatically through the entire downstream subgraph.

**`src/engine/expressions.js` — Template resolver**
- `{{ input.field }}` — dot-path into the merged node input.
- `{{ nodes.nodeId.field }}` — dot-path into the output of any previously-resolved node. `nodes` context IS threaded in `runNode`.
- Recurses into nested objects and arrays (including assignment arrays `[{ key, value }]`).
- Applied to every node's config before the handler fires.
- Uses `getByPath` from `src/utils/path.js`.

**`src/engine/credentials.js` — AES-256-GCM decryption**
- Reads `CREDENTIAL_ENCRYPTION_KEY` env var (32-byte hex string).
- Decrypts JSONB `{ iv, tag, data }` stored in the `credentials` table.
- Writes to `credentials_access_log` on every fetch (fire-and-forget, never blocks execution).

**`src/engine/logger.js` — Postgres execution logging**
- `createExecution()` → inserts `executions` row (status=running).
- `completeExecution()` → updates status, completed_at, error.
- `logNodeStart()` → inserts `node_executions` row with input JSONB, returns log row id.
- `logNodeEnd()` → updates output, `duration_ms`, error, retry_count, and token columns (prompt_tokens, completion_tokens, total_tokens, model) when usage is present.
- `logNodeSkipped()` → inserts skipped row with duration_ms=0.

**`src/engine/events.js` — SSE event bus**
- Singleton `EventEmitter`, max 500 listeners.
- Events keyed by `exec:<executionId>`: `execution:start`, `execution:end`, `node:start`, `node:end`, `node:skipped`.
- Listeners auto-removed 10s after `execution:end` to prevent memory leak.

### BullMQ Queue

- Queue name: `executions`. Worker concurrency: 10. Same process as HTTP server.
- Job options: 3 attempts, exponential backoff (2s base), removeOnComplete 1000, removeOnFail 500.
- **The canvas Run button does NOT use BullMQ.** It calls `POST /api/v1/execute` → `fireWorkflow()` → `setImmediate`. BullMQ is only used for external webhook triggers hitting `POST /webhooks/:path`.

### Database (Postgres + pgvector + Redis)

All tables applied via 4 migrations (all run against Supabase as of 2026-05-24):
- `users`, `workspaces`, `workspace_members` (roles: owner/admin/editor/viewer)
- `workflows` (JSONB `definition`, `active` boolean), `workflow_versions`
- `executions` (includes `workspace_id`), `node_executions` (includes token columns + model)
- `credentials` — AES-256-GCM encrypted JSONB `data` field
- `credentials_access_log` — written on every credential fetch
- `memory_patterns`, `memory_interactions`, `session_summaries` — schema + pgvector `vector(1536)` columns; no engine code yet
- `api_keys` — schema only, no auth middleware yet
- `integrations`, `workspace_integrations` — 20 official integrations seeded
- GIN index on `workflows.definition` for webhook path lookup

Demo workspace: `POST /api/v1/execute` idempotently creates demo user (`00000000-0000-0000-0000-000000000000`) and workspace (`00000000-0000-0000-0000-000000000001`). Every canvas run creates a new `workflows` row.

### Required Environment Variables

```
DATABASE_URL=postgresql://user:password@host:5432/otto
REDIS_URL=redis://...
CREDENTIAL_ENCRYPTION_KEY=<32-byte hex>    # generate: openssl rand -hex 32
ALLOWED_ORIGINS=http://localhost:5173      # comma-separated; omit = reflect all (dev only)
OPENAI_API_KEY=                            # optional — nodes fall back to credential store
ANTHROPIC_API_KEY=                         # optional
OPENROUTER_API_KEY=                        # optional
PORT=3000
HOST=0.0.0.0
```

**Important env notes:**
- `import 'dotenv/config'` MUST be the very first import in `src/server.js`. If it is not, `queue/client.js` creates the Redis connection before the env var is loaded and connects to `localhost:6379` instead.
- **Supabase + local dev (IPv4)**: use the Transaction Pooler URL (port 6543). Direct connection (port 5432) only works on Railway/IPv6 environments.
- **Railway Redis**: use `REDIS_PUBLIC_URL` locally; Railway sets `REDIS_URL` to its internal address which is only reachable inside Railway's network.

---

## WHAT IS FULLY WORKING

### Node Handlers (execute correctly end-to-end)

| Node type | File | What it does |
|---|---|---|
| `webhook_trigger` | `webhook-trigger.js` | Pass-through: returns input unchanged |
| `manual_trigger` | aliased to webhook-trigger | Same pass-through |
| `http_request` | `http-request.js` | GET/POST/PUT/PATCH/DELETE, JSON auto-parse, 30s timeout, api_key + Basic auth via credential |
| `llm_call` | `llm-call.js` | OpenAI + OpenRouter (OpenAI SDK), Anthropic (native SDK). Returns `{ text, model, usage, finishReason }`. |
| `if` | `if.js` | 10 operators, AND/OR combinator, dot-path field access. Outputs `_ifBranches: { true, false }` with SKIP on inactive side. |
| `merge` | `merge.js` | `merge-object` and `collect-array` modes. |
| `set` | `set.js` | Assignment arrays with `{{ }}` support. `set` and `merge` modes. |
| `ai_agent` | `ai-agent.js` | LLM tool-use loop. OpenAI: parallel tool calls. Anthropic: sequential. Hard cap 100 steps. Returns `{ text, steps, usage }`. |
| `delay` | `delay.js` | Converts amount + unit (ms/s/m) to ms; awaits; returns input. Cap 5 minutes. |
| `filter` | `filter.js` | Same condition evaluator as `if.js`. Pass → return input; fail → return SKIP. |
| `loop` | `loop.js` | Resolves `config.over` dot-path; slices to `config.limit` (default 100); iterates sequentially; returns `{ results }`. |
| `sub_workflow` | `sub-workflow.js` | Fetches workflow by ID; calls `runWorkflow()`; tracks recursion depth (max 5). |
| `send_email` | `send-email.js` | nodemailer; SMTP or Resend via credential. Returns `{ messageId }`. |
| `postgres_query` | `postgres-query.js` | Runs SQL with params; 30s hard timeout. Returns `{ rows, rowCount }`. |
| `redis_get` | `redis-get.js` | `redis.get(key)`. Returns `{ key, value, found }`. |
| `redis_set` | `redis-set.js` | `redis.set(key, value)` with optional TTL. Returns `{ key, ok: true }`. |
| `vector_search` | `vector-search.js` | Embeds query via OpenAI; runs pgvector `<=>` similarity on `memory_patterns`. Returns `{ results }`. |
| `schedule_trigger` | `schedule-trigger.js` | **Placeholder** — pass-through only; cron runner not yet built. |
| `code` | `code.js` | **Placeholder** — throws "code handler deferred — sandbox runtime TBD". |
| `placeholder` | `placeholder.js` | Used by n8n importer for unmapped node types; throws with original node type in message. |

### Execution Engine Features

- True parallel execution via `Promise.all()` — independent branches run simultaneously.
- SKIP sentinel propagation — inactive IF branches skip all downstream nodes automatically.
- `{{ input.field }}` and `{{ nodes.nodeId.field }}` expression resolution before handler fires.
- Cycle detection — throws before execution starts on circular graphs.
- Per-node Postgres logging — input, output, duration_ms, token usage, error written for every node.
- Credential fetch + AES-256-GCM decryption at run time + access log write.
- SSE event bus — live `node:start`/`node:end` events emitted for streaming.

### API Routes (all working)

**Executions:**
- `POST /api/v1/execute` — accepts inline definition OR `{ savedWorkflowId }`. Fires async. Returns `{ executionId, workflowId }`.
- `GET /api/v1/executions` — list with `workflowId`, `status` filters + pagination.
- `GET /api/v1/executions/:id` — single execution + all `node_executions` rows.
- `GET /api/v1/executions/:id/stream` — SSE endpoint; emits snapshot then live events until `execution:end`; 15s heartbeat.

**Workflows:**
- `GET /api/v1/workflows?workspaceId=...` — list (id, name, active, updated_at).
- `GET /api/v1/workflows/:id` — full row including `definition`.
- `POST /api/v1/workflows` — create; returns `{ id }`.
- `PUT /api/v1/workflows/:id` — update; also snapshots to `workflow_versions`.
- `DELETE /api/v1/workflows/:id` — soft delete (sets `active=false`).
- `POST /api/v1/workflows/:id/duplicate` — copy + return new id.

**Credentials:**
- `POST /api/v1/credentials` — encrypts `data` field before storing; returns `{ id, name, type }` (never `data`).
- `GET /api/v1/credentials?workspaceId=...` — list `id, name, type` only.
- `DELETE /api/v1/credentials/:id`.

**Import:**
- `POST /api/v1/import/n8n` — accepts n8n JSON export; maps 20 node types; unknown → placeholder. Returns `{ id, warnings }`.

**Integrations:**
- `GET /api/v1/integrations` — all 20 seeded integrations.
- `GET /api/v1/integrations/installed?workspaceId=...` — installed for workspace.
- `POST /api/v1/integrations/:id/install` — add to workspace.
- `DELETE /api/v1/integrations/:id/install` — remove from workspace.

**Other:**
- `POST /webhooks/:path` — finds active workflow by JSONB path scan, enqueues to BullMQ, returns 202.
- `GET /health` — `{ status: 'ok', version: '0.1.0' }`.

### Frontend Canvas (all working)

- React Flow canvas: drag-to-canvas from sidebar; click-to-add from sidebar; drag nodes; connect edges.
- Sidebar: collapsible accordion (one category open at a time), localStorage state persistence, category-tinted hover.
- Toolbar: editable workflow name (click to edit inline), Run button state machine (idle→running→success/error 3s→idle), dark/light theme toggle, visual-only Save button.
- ConfigPanel (320px, slides in from right): node-specific inspector panels for `webhook_trigger`, `http_request`, `llm_call`, `if`, `merge`, `set`. Generic fallback panel for all other types using the `fields` array from `nodeConfig.ts`.
- ModelSelect: live model fetch from OpenAI (needs API key) and OpenRouter; Anthropic hardcoded; session-level cache; text input fallback on error.
- ContextMenu: right-click or 3-dot menu → Duplicate / Rename / Delete; clamped to viewport.
- Execution visualization: node cards show running/success/error/skipped status + duration_ms. Canvas polls `/api/v1/executions/:id` every 500ms while running.
- Keyboard shortcuts: `Cmd/Ctrl+D` duplicate, `Cmd/Ctrl+Shift+F` fit view, `Delete/Backspace` delete, `Cmd/Ctrl+B` sidebar toggle.
- Category-based visual identity: per-category bg tint, border color, icon container shape, icon weight.
- Node card spring-release animation on drag-stop.

---

## WHAT IS NOT YET IMPLEMENTED

| Item | Detail |
|---|---|
| `code` node sandbox | Deferred — decision on sandbox runtime (isolated-vm vs vm2 vs Docker) punted to a separate conversation |
| `schedule_trigger` runner | Cron scheduling service not built; node is a pass-through placeholder |
| Memory nodes | Tables + pgvector columns exist; no `Memory Read` / `Memory Write` handlers |
| API key auth middleware | `api_keys` table exists; no request authentication wired |
| Canvas Run → BullMQ | Canvas Run uses `setImmediate` not the queue — no retries, no worker separation |
| Frontend Save button wiring | Save button is visual-only; `PUT /api/v1/workflows/:id` exists but frontend doesn't call it |
| Frontend SSE switch | Canvas polls every 500ms; `GET /api/v1/executions/:id/stream` exists but frontend doesn't use it |
| n8n import UI | Backend route exists; no UI entry point in the canvas |
| Integrations panel | Backend routes + seed exist; no sidebar tab in the frontend |
| Inspector panels for new nodes | `delay`, `filter`, `loop`, `sub_workflow`, `send_email`, `postgres_query`, `redis_get`, `redis_set`, `ai_agent`, `vector_search` need ConfigPanel cases |
| Rate limiting | `@fastify/rate-limit` not yet installed — noted but deferred |
| `retry_count` from BullMQ | Always written as 0 — not threaded from worker to `logNodeEnd` |

---

## WHAT NEEDS TO BE BUILT NEXT (in order)

### 1. Frontend Design Integration
The design is being rebuilt externally (P1 Pure Square + T0 typography). Once landed, wire:
- Save button → `POST /api/v1/workflows` (new) or `PUT /api/v1/workflows/:id` (update)
- Execution polling → switch to `EventSource` on `/api/v1/executions/:id/stream`
- Sidebar "Workflows" tab → list + load saved workflows
- n8n import CTA → calls `POST /api/v1/import/n8n`
- Integrations tab → browse/install from `/api/v1/integrations`

### 2. Inspector Panels for New Node Types
Add a case to the `NodePanel` switch in `ConfigPanel.tsx` for each:

| Node | Fields |
|---|---|
| `delay` | amount (number) + unit (select: ms / s / m) |
| `filter` | ConditionBuilder — reuse the same component as IF |
| `loop` | array path (text + `{{ }}` hint) + max iterations (number) |
| `sub_workflow` | workflow ID (text or select from saved workflows) |
| `send_email` | to, subject, body (textarea), credential picker |
| `postgres_query` | SQL (textarea), params (JSON textarea) |
| `redis_get` | key (text with `{{ }}` hint) |
| `redis_set` | key, value, TTL (number, seconds) |
| `ai_agent` | model (text), system prompt (textarea), tools (code editor), max steps (number) |
| `vector_search` | query (text), collection (text), top K (number) |
| `code` | Monaco editor — hold until sandbox decision |

### 3. API Key Auth Middleware
`api_keys` table has `key_hash`. Add Fastify `preHandler`: read `Authorization: Bearer <key>`, hash it, look up workspace, attach `workspaceId` to request context. Public webhook endpoint stays anonymous.

### 4. Canvas Run Button → BullMQ
Change `POST /api/v1/execute` to enqueue via `executionQueue.add()` instead of `fireWorkflow()` + `setImmediate`. Enables retries and future worker/server process split.

### 5. Code Node Sandbox
Decide runtime (isolated-vm or Docker sidecar). This is the only deferred node handler.

---

## CANVAS POLISH (remaining)

- **Animated running ring** — pulse border on node cards during `status === 'running'`.
- **Fit-view after run** — call `fitView()` when execution completes.
- **`redis_get` icon** — currently uses `Lightning` (same as webhook). Assign a distinct icon.

---

## INFRASTRUCTURE

| Service | Status | Notes |
|---|---|---|
| Postgres + pgvector | **Live** — Supabase | All 4 migrations applied. Use Transaction Pooler (port 6543) locally; direct (5432) on Railway. |
| Redis | **Live** — Railway | Use `REDIS_PUBLIC_URL` locally; `REDIS_URL` is internal-only inside Railway. |
| Backend | Local dev only | `npm run dev` starts on port 3000. Deploy to Railway via Docker when ready. |
| Frontend | Local dev only | `npm run dev` in `canvas/` starts on port 5173. Deploy to Vercel or Railway static. |

**Deployment steps (when ready):**
1. Set all env vars in Railway dashboard
2. Switch `DATABASE_URL` to direct Supabase connection (port 5432) — Railway supports IPv6
3. `docker build -t otto .` → push to Railway
4. `npm run build` in `canvas/` → deploy to Vercel; set `VITE_API_URL` to Railway backend URL
5. Update `ALLOWED_ORIGINS` in Railway env to the Vercel frontend URL

---

## OTTO CLOUD PRICING STRATEGY

| Tier | Price | Key limits |
|---|---|---|
| **Free (self-hosted)** | $0 forever | Unlimited; user runs their own infra |
| **Cloud Starter** | $19/mo | Unlimited executions, no step counting, 1 workspace |
| **Pro** | $49/mo | Multi-workspace, versioning, observability dashboard |
| **Enterprise** | Custom | Custom SLAs, SSO, on-prem option |

No per-step or per-execution counting. Predictable pricing for AI workflows that can have hundreds of LLM calls per run — the opposite of how n8n Cloud bills.

---

## DESIGN TOKENS

### Canvas & UI Colors

| CSS variable | Value | Used for |
|---|---|---|
| `--bg-canvas` | `#0a0a0c` | React Flow canvas background |
| `--bg-toolbar` | `#111113` | Top toolbar |
| `--bg-sidebar` | `#111113` | Left sidebar |
| `--bg-panel` | `#111113` | Right config panel |
| `--bg-node` | `#1c1c1f` | Default node card background |
| `--bg-input` | `#18181b` | Input / textarea / select |
| `--bg-hover` | `rgba(255,255,255,0.06)` | Hover state |
| `--border` | `rgba(255,255,255,0.08)` | Panel borders, separators |
| `--border-input` | `rgba(255,255,255,0.12)` | Input borders |
| `--text-primary` | `#fafafa` | Main text |
| `--text-secondary` | `#71717a` | Labels, secondary |
| `--text-muted` | `#52525b` | Hints, placeholders |
| `--accent` | `#6366f1` | Run button, focus rings |
| `--node-running` | `#f59e0b` | Execution running |
| `--node-success` | `#22c55e` | Execution success |
| `--node-error` | `#ef4444` | Execution error |

### Category Visual Identity

| Category | Color | Icon container shape | Icon weight | Edge color |
|---|---|---|---|---|
| `triggers` | `#f59e0b` amber | `border-radius: 8px` | `fill` | `#f59e0b` |
| `core` | `#64748b` slate | `border-radius: 50%` circle | `bold` | `rgba(255,255,255,0.2)` |
| `ai` | `#8b5cf6` violet | `border-radius: 30%` squircle | `duotone` | `#8b5cf6` |
| `data` | `#06b6d4` cyan | `border-radius: 4px` tight square | `fill` | `#06b6d4` |

Node cards have per-category background tints, border colors, and hover states (all defined in `CATEGORY_CARD_BG*`, `CATEGORY_CARD_BORDER*` maps in `nodeConfig.ts`).

### Typography & Icons

- **Primary font**: Geist (variable), served from `canvas/public/fonts/` — no CDN.
- **Mono font**: Geist Mono, same source.
- **Icon library**: `@phosphor-icons/react` — weight varies by category (fill / bold / duotone).
- **Lucide React**: used only in Toolbar (Sun, Moon, Settings icons).

### Animation

- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` — all UI transitions.
- Sidebar slide: `clip-path: inset(0 0% 0 0)` ↔ `inset(0 100% 0 0)`, 200ms.
- Config panel slide: `width: 0 → 320px`, 200ms ease-out.
- Sidebar accordion: CSS grid `grid-template-rows: 0fr → 1fr`, 150ms.
- Node card hover: background + border 120ms ease-out.
- Node drag-stop: `node-spring-release` CSS class, removed on `animationend` with 500ms fallback.

---

## BUILD CONSTRAINTS (Do Not Violate)

- **No auth** — do not build authentication or billing. Canvas only.
- **No backend architecture changes** — execution model, node registry, and route structure are settled.
- **Canvas is the only UI** — no separate log viewer page, no settings page.
- **User-owned credentials** — Otto never pays for LLM calls. Each user stores their own API keys as credentials. Never expose decrypted credential data in API responses.
- **Adding a new node type requires 4–5 changes**:
  1. `src/nodes/<type>.js` — handler function
  2. `src/nodes/index.js` — register in Map
  3. `canvas/src/components/nodes/nodeConfig.ts` — add `NodeTypeDef` entry
  4. `canvas/src/components/NodeIcon.tsx` — add icon mapping
  5. `canvas/src/components/ConfigPanel.tsx` — add inspector panel case (if custom UI needed)
