# Graph Report - C:\Users\abdal\Desktop\automation  (2026-05-24)

## Corpus Check
- 88 files · ~73,786 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 377 nodes · 425 edges · 61 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.81)
- Token cost: 12,500 input · 5,800 output

## God Nodes (most connected - your core abstractions)
1. `P1 Pure Square Node Card Design Direction` - 11 edges
2. `src/engine/executor.js — Parallel DAG Executor` - 9 edges
3. `mapNode()` - 8 edges
4. `canvas nodeConfig.ts — Node Type Registry` - 8 edges
5. `Otto Vision — n8n Plus for AI Era` - 7 edges
6. `src/nodes/index.js — Handler Registry Map` - 6 edges
7. `canvas/src/App.tsx — Root Canvas Layout` - 6 edges
8. `canvas OttoNode.tsx — React Flow Node Card` - 6 edges
9. `Otto v5 Design Handoff — Phase 1` - 6 edges
10. `reconcileWorkflowSchedule()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Backend Tech Stack — Node.js/Fastify/BullMQ/Postgres/Redis` --semantically_similar_to--> `src/engine/executor.js — Parallel DAG Executor`  [INFERRED] [semantically similar]
  cortex_orchestrator_product_idea.pdf → CLAUDE.md
- `Subworkflows — Synchronous and Asynchronous Calling` --semantically_similar_to--> `ai-agent.js — Tool-Use Loop Node (max 100 steps)`  [AMBIGUOUS] [semantically similar]
  cortex_orchestrator_product_idea.pdf → CLAUDE.md
- `Frontend Tech Stack — React/TypeScript/ReactFlow/Zustand/Tailwind` --semantically_similar_to--> `canvas/src/App.tsx — Root Canvas Layout`  [INFERRED] [semantically similar]
  cortex_orchestrator_product_idea.pdf → CLAUDE.md
- `Database Schema — workspaces/workflows/executions/credentials/memory` --semantically_similar_to--> `Postgres + pgvector + Redis Database Schema`  [INFERRED] [semantically similar]
  cortex_orchestrator_product_idea.pdf → CLAUDE.md
- `AI Workflow Assistant — Natural Language Workflow Builder` --semantically_similar_to--> `OttoBot — Personalised Workflow Assistant`  [INFERRED] [semantically similar]
  cortex_orchestrator_product_idea.pdf → CLAUDE.md

## Hyperedges (group relationships)
- **Otto Visual System Evolution: Design Tokens → Category Identity → Tint System → P1 Cards → P2 Horizontal** — claude_md_design_tokens, claude_md_category_identity, otto_handoff_readme_node_tint, otto_handoff_readme_category_shape, design_handoff_readme_p1_pure_square, otto_handoff_phase2_readme_horizontal_card [INFERRED 0.82]
- **Parallel Execution Core: DAG Parser + Executor + Promise.all = 78x Speedup** — claude_md_dag, claude_md_executor, claude_md_parallel_execution, claude_md_cortex_brain_benchmark [EXTRACTED 0.95]
- **Canvas Node Rendering Pipeline: nodeConfig → nodeColor/nodeRadius → OttoNode/AgentNode → ConfigPanel** — claude_md_node_config, otto_handoff_readme_node_color_system, claude_md_otto_node, claude_md_agent_node_component, claude_md_config_panel [INFERRED 0.85]

## Communities

### Community 0 - "Canvas Frontend Components"
Cohesion: 0.07
Nodes (4): enterReady(), submit(), close(), onKey()

### Community 1 - "Core Product Architecture"
Cohesion: 0.06
Nodes (37): Otto CLI, Cortex Brain Benchmark — 78x Speedup, src/engine/credentials.js — AES-256-GCM Decrypt, User-Owned Credentials Model — AES-256-GCM, src/engine/dag.js — DAG Parser + Cycle Detector, Postgres + pgvector + Redis Database Schema, src/engine/events.js — SSE EventEmitter Singleton, src/engine/executor.js — Parallel DAG Executor (+29 more)

### Community 2 - "Canvas Component Documentation"
Cohesion: 0.08
Nodes (36): canvas AgentNode.tsx — AI Agent Node Card, canvas/src/App.tsx — Root Canvas Layout, Category Visual Identity System (shape × color), canvas ConfigPanel.tsx — 20-Node Inspector Panel, Otto Design Tokens — CSS Variables, canvas nodeConfig.ts — Node Type Registry, canvas OttoNode.tsx — React Flow Node Card, canvas Sidebar.tsx — Nav Tabs Component (+28 more)

### Community 3 - "v5 Phase 1 Design Handoff"
Cohesion: 0.1
Nodes (5): BigAgentNode(), Canvas(), edgePath(), resolveVisual(), SmallNode()

### Community 4 - "P1 Node Card Redesign"
Cohesion: 0.16
Nodes (7): CardBody(), cardHeightFor(), cardWidthFor(), hexA(), NodeCard(), nodeLabelStyle(), NodeSlot()

### Community 5 - "Session Auth Management"
Cohesion: 0.21
Nodes (12): base64url(), clearSessionCookie(), cookieOptions(), createSession(), destroySession(), getAuthContext(), hashPassword(), hashToken() (+4 more)

### Community 6 - "Config Panel Inspector"
Cohesion: 0.13
Nodes (0): 

### Community 7 - "Demo and Test Harness"
Cohesion: 0.15
Nodes (3): MOCK_HTTP(), MOCK_LLM(), sleep()

### Community 8 - "P0 Foundation Nodes"
Cohesion: 0.15
Nodes (14): ai-agent.js — Tool-Use Loop Node (max 100 steps), BullMQ Queue + Worker — Async Job Processing, code.js — Piston Sandbox Node, llm-call.js — OpenAI/OpenRouter/Anthropic Node, n8n-importer.js — importN8n Converter, src/nodes/index.js — Handler Registry Map, P0 Roadmap — Self-Hostable Foundation, Piston Sandbox — Self-Hosted Code Execution (+6 more)

### Community 9 - "Design Canvas Export Tool"
Cohesion: 0.22
Nodes (3): dcFlatten(), DCSection(), DesignCanvas()

### Community 10 - "n8n Import Converter"
Cohesion: 0.38
Nodes (9): importN8n(), mapDelayConfig(), mapEdges(), mapHttpRequestConfig(), mapIfConfig(), mapLlmCallConfig(), mapNode(), mapRedisConfig() (+1 more)

### Community 11 - "Execution Panel and OttoBot"
Cohesion: 0.29
Nodes (8): canvas ExecutionPanel.tsx — Live Execution Viewer, OttoBot — Personalised Workflow Assistant, canvas OttoBotPanel.tsx — OttoBot Assistant Panel, P1 Roadmap — Stable and Observable, canvas/src/store.ts — Zustand Store, Bottom Panels — OttoBot + Live Execution, Canvas Grid + Edge Defaults Tweaks, AI Workflow Assistant — Natural Language Workflow Builder

### Community 12 - "Execution Logger"
Cohesion: 0.29
Nodes (0): 

### Community 13 - "Schedule Service"
Cohesion: 0.52
Nodes (6): findScheduleNode(), intervalMs(), reconcileActiveSchedules(), reconcileWorkflowSchedule(), schedulerIdForWorkflow(), validateWorkflowActivation()

### Community 14 - "AI Agent Loop"
Cohesion: 0.53
Nodes (4): aiAgent(), getApiKey(), runAnthropicLoop(), runOpenAILoop()

### Community 15 - "Parallel DAG Executor"
Cohesion: 0.5
Nodes (2): executeDAG(), runWorkflow()

### Community 16 - "Piston Code Node"
Cohesion: 0.7
Nodes (4): codeNode(), normalizeLanguage(), parseStdout(), wrapJavaScript()

### Community 17 - "Auth Routes"
Cohesion: 0.4
Nodes (0): 

### Community 18 - "v5 Visual Utilities"
Cohesion: 0.5
Nodes (0): 

### Community 19 - "SSE Event Stream"
Cohesion: 0.67
Nodes (0): 

### Community 20 - "Rate Limiter"
Cohesion: 0.83
Nodes (3): checkRateLimit(), nowMs(), rateLimitReply()

### Community 21 - "v5 Main Layout"
Cohesion: 0.67
Nodes (0): 

### Community 22 - "DAG Parser"
Cohesion: 1.0
Nodes (2): parseDAG(), validate()

### Community 23 - "Template Expressions"
Cohesion: 1.0
Nodes (2): resolveConfig(), resolveValue()

### Community 24 - "IF Conditional Node"
Cohesion: 0.67
Nodes (0): 

### Community 25 - "LLM Call Node"
Cohesion: 1.0
Nodes (2): getApiKey(), llmCall()

### Community 26 - "Postgres Query Node"
Cohesion: 1.0
Nodes (2): getPool(), postgresQuery()

### Community 27 - "Redis Get Node"
Cohesion: 1.0
Nodes (2): getDefaultRedis(), redisGet()

### Community 28 - "Redis Set Node"
Cohesion: 1.0
Nodes (2): getDefaultRedis(), redisSet()

### Community 29 - "Execution API Routes"
Cohesion: 0.67
Nodes (0): 

### Community 30 - "Integrations Seed Routes"
Cohesion: 0.67
Nodes (0): 

### Community 31 - "Design Acceptance Criteria"
Cohesion: 0.67
Nodes (3): P1 Node Card Acceptance Check, Phase 2 10-Point Acceptance Check, Phase 1 Acceptance Check

### Community 32 - "Delay Node"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Filter Node"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "HTTP Request Node"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Node Handler Registry"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Loop Node"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Merge Node"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Placeholder Node"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Schedule Trigger Node"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Email Send Node"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Set Node"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Sub-Workflow Node"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Vector Search Node"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Webhook Trigger Node"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "BullMQ Worker"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "n8n Import Route"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Webhook Route"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Workflow CRUD Route"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Credential Encryption"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Roadmap Feature Stubs"
Cohesion: 1.0
Nodes (2): Template Library — Searchable AI-Native Workflow Templates, Day-One Integrations — OpenAI/Anthropic/Supabase/Slack/Gmail

### Community 51 - "PostCSS Config"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Vite Build Config"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "SKIP Sentinel"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Business Model"
Cohesion: 1.0
Nodes (1): Business Model — Open Core + Otto Cloud

### Community 56 - "Auth Session Docs"
Cohesion: 1.0
Nodes (1): src/auth/session.js — Scrypt Auth + Session Cookies

### Community 57 - "Rate Limiting Docs"
Cohesion: 1.0
Nodes (1): src/middleware/rate-limit.js — In-Memory Rate Limiting

### Community 58 - "Handle Config Spec"
Cohesion: 1.0
Nodes (1): Full Handle Config Table — All 17 Node Types

### Community 59 - "Target User Segments"
Cohesion: 1.0
Nodes (1): Target Users — AI Engineers, Technical Founders, Automation Builders

### Community 60 - "Error Handling Strategy"
Cohesion: 1.0
Nodes (1): Error Handling — Retry, Error Branch, Continue-on-Fail, DLQ

## Ambiguous Edges - Review These
- `ai-agent.js — Tool-Use Loop Node (max 100 steps)` → `Subworkflows — Synchronous and Asynchronous Calling`  [AMBIGUOUS]
  cortex_orchestrator_product_idea.pdf · relation: semantically_similar_to

## Knowledge Gaps
- **42 isolated node(s):** `Business Model — Open Core + Otto Cloud`, `src/engine/dag.js — DAG Parser + Cycle Detector`, `src/engine/expressions.js — Template Resolver`, `src/engine/events.js — SSE EventEmitter Singleton`, `SKIP Sentinel Symbol — Inactive Branch Propagation` (+37 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Delay Node`** (2 nodes): `delay.js`, `delayNode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Filter Node`** (2 nodes): `filter.js`, `filterNode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `HTTP Request Node`** (2 nodes): `http-request.js`, `httpRequest()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Node Handler Registry`** (2 nodes): `index.js`, `getNodeHandler()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Loop Node`** (2 nodes): `loop.js`, `loopNode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Merge Node`** (2 nodes): `merge.js`, `mergeNode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Placeholder Node`** (2 nodes): `placeholder.js`, `placeholderNode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Schedule Trigger Node`** (2 nodes): `schedule-trigger.js`, `scheduleTrigger()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Email Send Node`** (2 nodes): `send-email.js`, `sendEmail()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Set Node`** (2 nodes): `set.js`, `setNode()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Sub-Workflow Node`** (2 nodes): `sub-workflow.js`, `subWorkflow()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vector Search Node`** (2 nodes): `vector-search.js`, `vectorSearch()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Webhook Trigger Node`** (2 nodes): `webhook-trigger.js`, `webhookTrigger()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `BullMQ Worker`** (2 nodes): `worker.js`, `startWorker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `n8n Import Route`** (2 nodes): `import.js`, `importRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Webhook Route`** (2 nodes): `webhooks.js`, `webhookRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Workflow CRUD Route`** (2 nodes): `workflows.js`, `workflowRoutes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Credential Encryption`** (2 nodes): `encrypt.js`, `encryptCredential()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Roadmap Feature Stubs`** (2 nodes): `Template Library — Searchable AI-Native Workflow Templates`, `Day-One Integrations — OpenAI/Anthropic/Supabase/Slack/Gmail`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS Config`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Build Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `SKIP Sentinel`** (1 nodes): `skip.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Business Model`** (1 nodes): `Business Model — Open Core + Otto Cloud`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Session Docs`** (1 nodes): `src/auth/session.js — Scrypt Auth + Session Cookies`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rate Limiting Docs`** (1 nodes): `src/middleware/rate-limit.js — In-Memory Rate Limiting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Handle Config Spec`** (1 nodes): `Full Handle Config Table — All 17 Node Types`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Target User Segments`** (1 nodes): `Target Users — AI Engineers, Technical Founders, Automation Builders`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Error Handling Strategy`** (1 nodes): `Error Handling — Retry, Error Branch, Continue-on-Fail, DLQ`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `ai-agent.js — Tool-Use Loop Node (max 100 steps)` and `Subworkflows — Synchronous and Asynchronous Calling`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `Otto Vision — n8n Plus for AI Era` connect `Core Product Architecture` to `Execution Panel and OttoBot`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `OttoBot — Personalised Workflow Assistant` connect `Execution Panel and OttoBot` to `Core Product Architecture`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `Business Model — Open Core + Otto Cloud`, `src/engine/dag.js — DAG Parser + Cycle Detector`, `src/engine/expressions.js — Template Resolver` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Canvas Frontend Components` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Core Product Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Canvas Component Documentation` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._