# Otto — AI-Native Workflow Orchestrator

This project was originally named **Synapse** in the product spec (`cortex_orchestrator_product_idea.pdf`). The name has been changed to **Otto**. Use Otto everywhere — in code, docs, UI copy, and conversation. Never refer to it as Synapse.

## What Otto Is

Otto is an AI-native workflow orchestration platform built from the ground up for AI-first workloads. It is not Zapier, n8n, or Make with AI bolted on. AI is a first-class citizen: LLM calls, agents, memory, embeddings, and vector search are platform primitives, not plugins.

Core differentiators:
- True parallel execution (DAG analysis + Promise.all()) — independent branches run simultaneously
- Memory as a platform primitive — session, semantic, episodic, and working memory built in, zero config
- AI-native node types — LLM Call, LLM Agent, Embed, Vector Search, Reranker, Confidence Gate, Parallel AI, Stream Response
- Visual canvas (React Flow) with real-time execution visualization
- Full execution logs per node — inputs, outputs, timing, LLM prompts/responses, token counts

## Origin

Born from building **Cortex Brain** — a biologically-inspired AI cognitive architecture in n8n. Every architectural ceiling hit during that build is a product requirement for Otto. The founder (Abdallah Elrizz) lived these pain points firsthand.

## Tech Stack

- **Backend:** Node.js, Fastify, BullMQ (Redis), PostgreSQL (Supabase), pgvector, Redis cache
- **Frontend:** React + TypeScript, React Flow (canvas), Zustand, Tailwind CSS, Socket.io (WebSockets), Monaco Editor
- **Auth:** Supabase Auth — JWT, OAuth2 (Google/GitHub), API keys, MFA (TOTP)
- **Encryption:** AES-256-GCM for credentials at rest
- **Deployment:** Railway — Docker containers, auto-deploy on push

## MVP Scope (10-Week Build)

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1–2 | Execution Engine | DAG parser, parallel executor, node log DB, webhook trigger |
| 3–4 | Core Nodes | HTTP Request, LLM Call, Embed, IF, Merge, Set, Code (JS) |
| 5–6 | Canvas | React Flow canvas, node sidebar, connection drawing, run button |
| 7 | Credentials + Memory | Encrypted credential storage, Memory Read/Write nodes |
| 8 | Log Viewer | Execution list, node-level log inspector, timing view |
| 9 | Cortex Port | Port Cortex Brain from n8n to Otto, benchmark latency |
| 10 | Polish + Deploy | Bug fixes, Railway deploy, basic auth, public demo |

MVP proves one thing: Otto runs AI workflows faster than n8n by executing parallel branches truly simultaneously.

## Node Types

**Core nodes:** Webhook trigger, Scheduler, Manual trigger, HTTP Request, Code (JS), Code (Python), IF/Switch, Merge/Join, Set/Transform, Loop, Delay, Webhook Response

**AI-native nodes:** LLM Call, LLM Agent, Embed, Vector Search, Reranker, Memory Read, Memory Write, Confidence Gate, Parallel AI, Stream Response

## Pricing Tiers

| Tier | Price | Executions/mo | Active Workflows | Log Retention | Memory |
|------|-------|---------------|------------------|---------------|--------|
| Free | $0 | 1,000 | 5 | 7 days | 10K patterns |
| Builder | $20/mo | 10,000 | 25 | 30 days | 100K patterns |
| Pro | $79/mo | 100,000 | Unlimited | 90 days | Unlimited |
| Team | $199/mo | 500,000 | Unlimited | 1 year | Unlimited |
| Enterprise | Custom | Custom | Unlimited | Custom | Custom |

Open-source core engine + canvas. Self-hosting free forever. Cloud-hosted version is the paid product.

## Positioning

> Otto is the workflow orchestrator built for AI engineers. True parallel execution. Native memory. AI-first nodes. Everything n8n should have been.

## Open Questions (Decide Before/During MVP)

- Code node sandboxing: isolated-vm vs vm2 vs Docker per execution
- Workflow definition format: JSONB in Postgres vs YAML in Git repo
- Self-host deployment: Docker Compose (start here) vs Helm chart
- Real-time updates: WebSockets vs 500ms polling (polling is fine for MVP)
- Memory layer backend: pgvector (Supabase, preferred for MVP) vs Pinecone vs Weaviate
- Monetization timing: build in public 3 months before adding billing

## Key Files

- `cortex_orchestrator_product_idea.pdf` — original full product spec (named Synapse, use Otto instead)

---

## What Has Been Built (Session Log)

### Backend — Execution Engine (`src/`)

Fully implemented and working. Do not stub or mock any of this.

**`src/engine/dag.js`** — DAG parser
- Builds `nodes`, `inEdges`, `outEdges` maps from workflow definition JSONB
- DFS cycle detection — throws on circular graphs before execution starts
- Preserves `sourceHandle` (used by IF node for true/false branch routing)

**`src/engine/executor.js`** — Parallel executor
- `fireWorkflow()` — creates execution record immediately, runs via `setImmediate`, returns `executionId` for polling. Used by canvas Run button.
- `runWorkflow()` — synchronous variant, awaits completion. Used by `/api/v1/workflows/:id/execute`.
- `executeDAG()` — memoized `Promise.all()` pull model. Each node's promise awaits its deps recursively. Nodes with no shared deps fire simultaneously — true parallelism.
- `collectInput()` — merges active dep outputs into a single input object. Handles `_ifBranches` shape from IF node. Returns `{ input, rawInputs, skipped }`.
- `runNode()` — resolves `{{ }}` expressions in config, fetches credential if `credentialId` set, calls node handler, writes start/end logs.
- SKIP sentinel propagates through inactive IF branches; downstream nodes are auto-skipped.

**`src/engine/expressions.js`** — Template resolver
- `{{ input.field }}` and `{{ nodes.nodeId.field }}` — dot-path resolution
- Recurses into nested objects and assignment arrays
- Applied to every node's config before the handler fires

**`src/engine/credentials.js`** — Credential decryption
- AES-256-GCM decrypt using `CREDENTIAL_ENCRYPTION_KEY` env var (32-byte hex)
- Reads from `credentials` table, decrypts JSONB `data` field on demand
- No write/create API yet — credentials must be inserted directly into DB

**`src/engine/logger.js`** — Postgres execution logging
- `createExecution()` — inserts row into `executions` with status=running, trigger_type, input
- `completeExecution()` — updates status, completed_at, error
- `logNodeStart()` — inserts `node_executions` row with input JSONB
- `logNodeEnd()` — updates output, duration_ms (computed from `NOW() - started_at`), error, retry_count
- `logNodeSkipped()` — inserts skipped row with duration_ms=0
- Note: `retry_count` is always written as 0 — BullMQ retry count not yet threaded through

**`src/engine/skip.js`** — `SKIP = Symbol('SKIP')` sentinel

### Backend — Node Handlers (`src/nodes/`)

Registered in `src/nodes/index.js`. Only these 6 types execute — all others throw `Unknown node type`.

| Node type | File | What it does |
|-----------|------|--------------|
| `webhook_trigger` | `webhook-trigger.js` | Pass-through: returns `input` unchanged |
| `manual_trigger` | aliased to webhook-trigger | Same pass-through |
| `http_request` | `http-request.js` | Full REST client — GET/POST/PUT/PATCH/DELETE, JSON auto-parse, 30s timeout via AbortController, api_key + Basic auth credential support |
| `llm_call` | `llm-call.js` | OpenAI, OpenRouter (OpenAI-compat), Anthropic (native format). Falls back to env vars. Returns `{ text, model, usage, finishReason }` |
| `if` | `if.js` | 10 operators, AND/OR combinator, dot-path field access. Outputs `{ _ifBranches: { true, false } }` |
| `merge` | `merge.js` | `merge-object` mode (default) and `collect-array` mode (`{ items: [{ source, data }] }`) |
| `set` | `set.js` | Assignment arrays, `set` mode (output only assigned fields) and `merge` mode (merge onto input) |

**Not yet implemented (UI-only, will throw on execution):**
`code`, `delay`, `filter`, `loop`, `sub_workflow`, `send_email`, `postgres_query`, `redis_get`, `redis_set`, `ai_agent`, `vector_search`

### Backend — Routes (`src/routes/`)

**`src/routes/executions.js`**
- `POST /api/v1/execute` — canvas endpoint. Accepts `{ definition, input, name }`. Bootstraps demo workspace (hardcoded UUIDs, idempotent). Creates workflow record, calls `fireWorkflow()`, returns `{ executionId, workflowId }`.
- `POST /api/v1/workflows/:id/execute` — synchronous manual trigger from saved workflow
- `GET /api/v1/executions` — list with optional `workflowId`, `status` filters, pagination
- `GET /api/v1/executions/:id` — single execution + all node_execution rows

**`src/routes/webhooks.js`**
- `POST /webhooks/:path` — JSONB scan for active workflow with matching webhook path, enqueues to BullMQ, returns 202 immediately. No HMAC verification yet.

### Backend — Queue (`src/queue/`)

**`src/queue/client.js`** — BullMQ queue `executions`, 3 attempts, exponential backoff (2s base), removeOnComplete 1000, removeOnFail 500

**`src/queue/worker.js`** — BullMQ worker, concurrency 10. Fetches workflow definition from DB, calls `runWorkflow()`. Runs in same process as HTTP server (comment flags this for future split).

Note: The canvas Run button (`POST /api/v1/execute`) uses `fireWorkflow` + `setImmediate`, NOT the BullMQ queue. The queue is only used for webhook triggers hitting `POST /webhooks/:path`.

### Backend — Database (`src/db/`, `migrations/`)

**`src/db/client.js`** — `pg.Pool`, max 10 connections, reads `DATABASE_URL` env var

**`migrations/001_initial.sql`** — Full schema:
- `users`, `workspaces`, `workspace_members`
- `workflows` (JSONB `definition`), `workflow_versions` (schema only, never written)
- `executions`, `node_executions` (full log schema with all fields)
- `credentials` (AES-256-GCM encrypted JSONB), `credentials_access_log` (schema only, never written)
- `memory_patterns`, `memory_interactions`, `session_summaries` (schema only, no engine code)
- `api_keys` (schema only, no auth middleware)
- GIN index on `workflows.definition` for webhook path JSONB lookup
- `pgvector` extension enabled

**`migrations/run.js`** — Migration runner: tracks applied files in `_migrations` table, applies in alphabetical order, wraps each in a transaction.

### Frontend — Canvas (`canvas/`)

React + TypeScript + Vite + React Flow + Zustand + Tailwind CSS

**Tech:**
- Font: Geist (variable) + Geist Mono served from `/public/fonts/` (copied from `geist` npm package — no CDN dependency)
- Colors: Zinc/Slate scale dark theme (`#0a0a0c` canvas, `#111113` sidebar/toolbar, `#1c1c1f` nodes)
- Light theme also implemented via `.theme-light` CSS class

**`canvas/src/index.css`**
- `@font-face` for Geist and Geist Mono from local `/fonts/` files
- Full CSS variable token system for both dark and light themes
- React Flow handle visibility (opacity 0, shown on node hover/select/connecting)
- Edge: 2px stroke, accent glow on hover via `drop-shadow` filter
- Sidebar `.otto-node-row` 34px height
- Config panel `.config-panel-wrap` slide-in via `transition: width 0.2s cubic-bezier(...)`
- Scrollbar: 3px, transparent track

**`canvas/src/store.ts`** — Zustand store
- `nodes`, `edges`, `onNodesChange`, `onEdgesChange`, `onConnect`, `setNodes`
- `selectedNodeId`, `selectNode`, `updateNodeConfig`, `updateNodeLabel`
- `duplicateNode(id)` — copies node with +32px offset, new UUID
- `deleteNode(id)` — removes node + connected edges, clears selectedNodeId
- `onConnect` — IF-aware edge coloring: true handle → `#22c55e`, false handle → `#ef4444`
- `executionPhase` (`idle|running|success|error`), `executionId`, `nodeExecutions`
- `setExecutionStarted`, `setNodeExecutions`, `setExecutionPhase`, `resetExecution`
- `theme` (`dark|light`), `toggleTheme`
- `workflowName`, `setWorkflowName`
- `contextMenu: { x, y, nodeId } | null`, `setContextMenu`

**`canvas/src/api.ts`** — Thin API client
- `api.execute(definition)` → `POST /api/v1/execute`
- `api.getExecution(id)` → `GET /api/v1/executions/:id`

**Node type registry — `canvas/src/components/nodes/nodeConfig.ts`**
- 17 node types across 4 categories: `triggers`, `core`, `ai`, `data`
- Each has: `type`, `category`, `label`, `description`, `color`, `hasInput`, `outputHandles`, `defaultConfig`, `fields`
- `CATEGORY_COLORS` map: `triggers=#f59e0b`, `core=#64748b`, `ai=#8b5cf6`, `data=#06b6d4` — used for left border accent and icon backgrounds
- `getNodeDef(type)` falls back to a neutral gray stub for unknown types
- Fields support: `text`, `number`, `textarea`, `code`, `select`, `assignments`, `conditions`

**Registered node types:**
- Triggers: `webhook_trigger`
- Core: `http_request`, `if`, `merge`, `set`, `code`, `delay`, `filter`, `loop`, `sub_workflow`, `send_email`
- AI: `llm_call`, `ai_agent`, `vector_search`
- Data: `postgres_query`, `redis_get`, `redis_set`

**`canvas/src/components/NodeIcon.tsx`** — Maps node types to lucide-react icons

**`canvas/src/components/nodes/OttoNode.tsx`** — Canvas node card
- 220px wide, 6px border-radius, `#1c1c1f` background
- 3px left accent bar using `CATEGORY_COLORS[def.category]` (not per-node color)
- Icon in 24×24 rounded container with category color at 15% opacity background (`color + '26'` hex alpha)
- Node label (editable via inspector) in header; bottom type row removed — only shows execution timing post-run
- 3-dot button (hover-only) opens context menu
- Status dot (6px circle) — only during/after execution
- Border + shadow animate on hover and selected state
- Handles: opacity 0, shown on hover/select/connecting

**`canvas/src/components/Sidebar.tsx`** — Left sidebar, 220px
- Search input: no border, background contrast only, magnifier SVG icon at left
- Categories (TRIGGERS/CORE/AI/DATA) — collapsible, 20px top margin per section
- NodeRow: 34px height, icon in category-tinted 24×24 container, label only (no description)
- Drag-to-canvas and click-to-add both work

**`canvas/src/components/Toolbar.tsx`** — Top bar, 48px
- "otto" wordmark (lowercase, 700 weight)
- Editable workflow name (click to edit inline)
- Center: `{n}n · {e}e` node/edge count
- Sun/Moon icon theme toggle (lucide-react)
- Save button with 1.5s "✓ Saved" feedback (visual only, no persistence)
- Run button: idle → running (spinner) → success (green, 3s) → idle state machine

**`canvas/src/components/Canvas.tsx`** — React Flow wrapper
- Dot grid: white at 15% opacity against `#0a0a0c` canvas
- `displayEdges` computed via `useMemo` — animated only during `executionPhase === 'running'`
- `defaultEdgeOptions`: `smoothstep`, 2px stroke
- Keyboard shortcuts: Cmd/Ctrl+D (duplicate), Cmd/Ctrl+Shift+F (fit view), Delete/Backspace (delete node)
- `onNodeContextMenu` → context menu
- Empty state: dashed border placeholder with "Add your first node"
- `proOptions={{ hideAttribution: true }}` — React Flow watermark removed

**`canvas/src/components/ConfigPanel.tsx`** — Right inspector, 300px
- Slide-in via parent wrapper `width` transition (0 → 300px)
- Header: category-tinted icon + editable node name + × close
- Execution section: status badge pill, JsonViewer for input/output
- Config section: field label 9px/500 weight/65% opacity; "CONFIGURATION" header 45% opacity — subordinate to content
- Field types: text, number, textarea (mono), code (mono), select, assignments (key/value rows), conditions (left/op/right rows)

**`canvas/src/components/ContextMenu.tsx`** — Right-click menu
- Fixed position, clamped to viewport
- Options: Duplicate, Rename (selects node), Delete (red)
- Closes on click-outside (50ms delay to avoid self-close), Escape, contextmenu event

**`canvas/src/components/JsonViewer.tsx`** — Collapsible JSON display
- Syntax-highlighted via regex + `dangerouslySetInnerHTML` (safe: own JSON.stringify output)
- Keys white, strings green, numbers blue, booleans red, null gray
- Geist Mono, max 180px height, scrollable

**`canvas/src/App.tsx`** — Root layout
- Toolbar + Sidebar + Canvas + slide-in ConfigPanel + ContextMenu overlay
- `config-panel-wrap` div animates width; inner div stays 300px to prevent content squeezing

### Infrastructure Notes

- Canvas polls `GET /api/v1/executions/:id` every 500ms while `executionPhase === 'running'`
- Demo workspace bootstrapped on first run (hardcoded UUIDs, `ON CONFLICT DO NOTHING`)
- No auth anywhere — canvas and API are open
- `CREDENTIAL_ENCRYPTION_KEY`, `DATABASE_URL`, `REDIS_URL` are required env vars
- LLM env vars: `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY` (optional if using credential store)

### Build Constraints (Do Not Violate)

- No auth — do not build authentication or billing. Canvas only.
- No backend architecture changes — execution model, node registry, and route structure are settled
- Canvas is the only UI — no separate log viewer page, no settings page
- New node types go in `src/nodes/` and must be registered in `src/nodes/index.js` to execute
