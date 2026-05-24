# Otto · Phase 2 — match the mockup, end to end

Phase 1 (the amber rebrand + Fraunces removal) is already merged to `frontend-testing`. Phase 2 is the remaining gap between what you have now and the canvas in `Otto Canvas v2.html` — node layout, AI Agent treatment, topbar, docked bottom panels, inspector polish.

This is a big handoff. Read the entire README before starting. Then read `PROMPT.md` for the prompt to paste into Claude Code.

---

## What changes (file map)

```
canvas/
├── src/
│   ├── App.tsx                             ← add bottom panel layout slot
│   ├── components/
│   │   ├── Toolbar.tsx                     ← ⚠ full rewrite — breadcrumb topbar
│   │   ├── Canvas.tsx                      ← bottom-left zoom controls; tighten dot grid
│   │   ├── Sidebar.tsx                     ← no major changes — keep accordion
│   │   ├── ConfigPanel.tsx                 ← header polish (Properties + ID pill + close)
│   │   ├── panels/
│   │   │   ├── BottomPanels.tsx            ← NEW — host for OttoBotPanel + ExecutionPanel
│   │   │   ├── OttoBotPanel.tsx            ← NEW — mocked workflow-improvement assistant
│   │   │   └── ExecutionPanel.tsx          ← NEW — timeline + JSON output, wires to nodeExecutions
│   │   └── nodes/
│   │       ├── OttoNode.tsx                ← ⚠ full rewrite — horizontal info card
│   │       ├── AgentNode.tsx               ← NEW — special big-render for `ai_agent`
│   │       └── nodeConfig.ts               ← add `subtitle` + `agentTools` fields
│   ├── store.ts                            ← add bottom panel visible state + agent tool list
│   └── index.css                           ← spinner keyframe stays; add otto-pulse keyframe
```

---

## 1. Node card — full rewrite

The icon-dominant 72×72 square is replaced with a horizontal info card.

### Default (`OttoNode.tsx`) — applies to all node types EXCEPT `ai_agent`

```
┌────────────────────────────────────┐
│ ▢  HTTP Request          TRIGGER   │   ← 196×58
│    POST /webhook/leads             │
└────────────────────────────────────┘
  ●                                 ●     ← handles
```

| Property | Value |
|---|---|
| Width | `196px` (fixed) |
| Height | `58px` (single-handle) — see below for complex nodes |
| Background | `var(--bg-node)` |
| Border | `1px solid var(--border)` |
| Border radius | `6px` |
| Box shadow | `var(--node-shadow)` — dark: none; light: `0 1px 2px rgba(15,15,10,0.04), 0 3px 12px rgba(15,15,10,0.05)` |
| Padding | `9px 12px` |
| Layout | `display:flex; align-items:center; gap:10px` |

**Icon container** (the shape×color system you implemented in Phase 1):

| Property | Value |
|---|---|
| Size | `26×26` |
| Border radius | `nodeRadius(def)` — same helper Phase 1 added |
| Background | `hexA(nodeColor(def, theme), 0.14)` dark / `0.11` light |
| Border | `1px solid hexA(nodeColor(def, theme), 0.22)` dark / `0.18` light |
| Inner icon | `<NodeIcon type={data.nodeType} size={14} color={nodeColor(def, theme)} />` |

**Label + subtitle column** (flex-1, min-width 0):

| Element | Spec |
|---|---|
| Label | Inter, `12.5px`, weight `600`, `letter-spacing: -0.012em`, color `var(--text-primary)`, single-line ellipsis |
| Subtitle | JetBrains Mono, `10.5px`, weight `400`, color `var(--text-muted)`, single-line ellipsis. **Falls back to def.description if config-derived subtitle is empty.** See §3 for resolver. |

**Tag** (absolute top-right of card, 7px from top, 10px from right):

| Element | Spec |
|---|---|
| Font | JetBrains Mono, `9.5px`, weight `700`, letter-spacing `0.10em`, uppercase |
| Color | tag color (see below) |
| Background | `hexA(tagColor, 0.12)` dark / `0.10` light |
| Border | `1px solid hexA(tagColor, 0.22)` dark / `0.18` light |
| Padding | `2px 6px` |
| Border radius | `3px` |

Tag string and color:

| Node category | Tag text | Tag color |
|---|---|---|
| `triggers` | `TRIGGER` | `OTTO_AMBER` |
| `ai` | `AI` | `OTTO_AMBER` |
| `core` | `LOGIC` | `var(--text-secondary)` |
| `data` | the service slug (e.g. `POSTGRES`, `REDIS`) | the resolved `nodeColor()` |

### Complex nodes (`if`, `merge`, `loop`, `llm_call`)

These have >1 handle on a side. Keep the **same card layout** (horizontal) — don't switch back to vertical. Instead, **grow the card height**:

```ts
function cardHeightFor(def: NodeTypeDef): number {
  const vert = Math.max(def.handles.in.length, def.handles.out.length);
  if (vert <= 1) return 58;
  // 12px top pad + (n-1) * 22px between dots + 12px bottom + 24 base
  return Math.max(72, 12 + (vert - 1) * 22 + 12 + 24);
}
```

Outputs `if → 88`, `merge → 96`, `loop → 88`, `llm_call → 58` (vertical edges still ≤1, the `model` handle is on the bottom which doesn't grow height).

Handle labels (`true`, `false`, `input 1/2/3`, `loop`, `done`, `model`) — keep the labels-outside-the-card pattern from Phase 1, JetBrains Mono 11px.

### Card state styling

Keep the existing Phase 1 logic (running/success/error border colors + selection ring using `nodeColor()`).

### Spring-release animation

Keep the existing `node-spring-release` keyframe + `onNodeDragStop` hook. They're fine.

---

## 2. AI Agent — special big-render component

`AgentNode.tsx`, registered separately:

```ts
const nodeTypes = {
  ottoNode: OttoNode,
  agentNode: AgentNode,
};
```

In `Sidebar.tsx`'s `addToCanvas` and `Canvas.tsx`'s `onDrop`, when `nodeType === 'ai_agent'`, set `type: 'agentNode'` on the React Flow node. Every other type stays `'ottoNode'`.

### Layout

```
┌─────────────────────────────────────────────┐
│ ◯  Lead enrichment agent       [MAIN]       │   ← header (62px)
│    Autonomous · gpt-4o                       │
├─────────────────────────────────────────────┤   ← divider
│ TOOLS                                    04  │   ← section header
│ ┌─────────────────────────────────────────┐ │
│ │ ▣  CRM lookup            http_request   │ │   ← tool row × N
│ ├─────────────────────────────────────────┤ │
│ │ ▣  Customer DB        postgres_query    │ │
│ └─────────────────────────────────────────┘ │
│             [ + Add tool ]                   │
└─────────────────────────────────────────────┘
  ●                                          ●  ← handles
```

### Spec

| Property | Value |
|---|---|
| Width | `336px` (fixed) |
| Height | auto — content-driven |
| Background | `var(--bg-node)` |
| Border | `1.5px solid` — neutral hairline when unselected, `OTTO_AMBER` when selected |
| Border radius | `8px` |
| Box shadow | selected: `0 0 0 3px ${amberRing}, var(--node-shadow-strong)` ; else: `var(--node-shadow-strong)` |
| Overflow | `hidden` |

**Header section** — padding `14px 14px 12px`, flex row, gap `11px`:
- Icon container: `34×34`, `border-radius: 50%` (AI category → circle), amber tint
- Sparkles icon inside, size `17`, color amber, stroke-width 2
- Text column: label `Inter 14.5px / 700 / -0.018em`, subtitle `JetBrains Mono 10.5px / 400`
- `MAIN` tag at the right of the label row (amber)

**Divider** — `1px` full-width line in `var(--border)`

**Tools section** — padding `11px 12px 12px`, flex column gap `5px`:

- Section header row: `TOOLS` label (JetBrains Mono 9.5px 600, letter-spacing 0.16em, color text-secondary) on the left; count (JetBrains Mono 9.5px 500, text-muted) right-aligned
- Tool rows — see below
- `+ Add tool` button — full-width, padding `7px 10px`, `1px solid var(--border)`, `border-radius: 5px`, transparent bg, label `+ Add tool` Inter 11.5px 500 text-secondary

**Tool row** (`7px 9px` padding, `var(--bg-node-lift)` bg, `1px solid var(--border)`, `border-radius: 5px`, flex row gap `10px`):

| Slot | Spec |
|---|---|
| Icon container | `22×22`, `border-radius` matches the source node's shape, tinted in source-node color |
| Tool name | Inter `12px` weight `600` `-0.008em`, single-line ellipsis (flex: 1) |
| Type slug | JetBrains Mono `10px` weight `500` letter-spacing `0.02em`, color `var(--text-muted)` |

### Tool data source

Tools live in the agent node's `data.config.tools` — currently a JSON-array string. Replace that field with a structured array in the store:

```ts
type AgentTool = {
  id: string;
  name: string;            // user-editable display name
  nodeType: string;        // points at a node type from NODE_TYPE_DEFS (so we inherit icon, color, shape)
};
```

Default `tools` array for `ai_agent` (in `nodeConfig.ts`):

```ts
defaultConfig: {
  model: 'gpt-4o',
  systemPrompt: 'You are a helpful assistant.',
  maxSteps: 10,
  tools: [
    { id: '_t1', name: 'CRM lookup',         nodeType: 'http_request' },
    { id: '_t2', name: 'Customer DB',        nodeType: 'postgres_query' },
    { id: '_t3', name: 'Past conversations', nodeType: 'vector_search' },
    { id: '_t4', name: 'Calculator',         nodeType: 'code' },
  ],
}
```

(These are starter tools so a freshly-dropped agent looks rich, matching the mockup. The user can edit/remove from the Inspector.)

In `AgentNode.tsx`, for each tool, look up the source node def via `getNodeDef(tool.nodeType)` and render the row icon with that def's color + shape — that's how the colored variety in the mockup happens.

**Inspector for agent tools**: in `ConfigPanel.tsx`, when the selected node is an agent, replace the current `Tools (JSON array)` raw-textarea field with a list-editor:
- Each tool: text input for `name`, a dropdown of `NODE_TYPE_DEFS` for `nodeType`, a trash icon to remove
- An `+ Add tool` button below
- New tools get `id: crypto.randomUUID()`, `name: ''`, `nodeType: 'http_request'`

### Handles

Inputs/outputs: 1 in, 1 out (current behavior). Use the same handle dots Phase 1 has. Drop the 5 phantom `extras` handles from the old `ai_agent` def — they were placeholder.

---

## 3. Subtitle resolver

The horizontal node card needs a subtitle. Add to `NodeTypeDef`:

```ts
interface NodeTypeDef {
  // ...existing...
  subtitle?: (config: Record<string, unknown>) => string;
}
```

Per-type subtitle functions (in `nodeConfig.ts`):

```ts
// triggers
webhook_trigger: (c) => `POST /webhook/${c.path}`,
// core
http_request:    (c) => `${(c.method as string) || 'GET'} · ${(c.url as string) || 'no url'}`,
if:              (c) => `${(c.conditions as any[])?.length ?? 0} conditions`,
merge:           (c) => `mode: ${c.mode}`,
set:             (c) => `${(c.assignments as any[])?.length ?? 0} fields`,
code:            (c) => 'inline JavaScript',
delay:           (c) => `${c.amount} ${c.unit}`,
filter:          (c) => `${(c.conditions as any[])?.length ?? 0} conditions`,
loop:            (c) => `over ${c.over}`,
sub_workflow:    (c) => (c.workflowId as string) || 'select workflow',
send_email:      (c) => (c.to as string) || 'to: …',
// ai
llm_call:        (c) => `${c.provider} · ${c.model}`,
ai_agent:        (c) => `Autonomous · ${c.model}`,
vector_search:   (c) => `${c.collection} · top ${c.topK}`,
// data
postgres_query:  (c) => 'SQL query',
redis_get:       (c) => `key: ${c.key}`,
redis_set:       (c) => `set ${c.key}`,
```

In `OttoNode.tsx`:

```tsx
const subtitle = def.subtitle?.(data.config ?? {}) || def.description;
```

---

## 4. Topbar — full rewrite

Current Toolbar is the right component, just redesigned. Specs:

```
[otto] / Workflows / Pipelines / Lead Enrichment   [v3.2.1]                       [●Active]  [Share]  [Save]  [⋯]
```

### Container

| Property | Value |
|---|---|
| Height | `54px` |
| Background | `var(--bg-toolbar)` |
| Border-bottom | `1px solid var(--border)` |
| Padding | `0 16px` |
| Flex | row, items center, gap `11px` |

### Left cluster — breadcrumbs

Replace the current `otto / WorkflowName` Fraunces pair with:

| Element | Spec |
|---|---|
| Brand mark | `22×22` `border-radius: 5px` amber square, `<Zap size={13} color="#fff" strokeWidth={2.6} />` inside |
| `otto` text | Inter `16px` `700` `-0.022em`, color `var(--text-primary)` |
| (separator) | Inter `12px` color text-muted, char `/` |
| Static crumb 1 | "Workflows" — Inter `12.5px` `500` text-secondary |
| Static crumb 2 | "Pipelines" — same |
| Workflow name | Inter `13px` `600` `-0.012em` text-primary, **editable** (keep current behavior — click to edit, blur/Enter to save) |
| Version pill | JetBrains Mono `9.5px` `600` letter-spacing `0.06em` text-muted, padding `2px 6px`, `1px solid var(--border)`, `3px` radius. Text from `useStore((s) => s.workflowVersion ?? 'v1.0.0')` (add field to store, default `'v1.0.0'`) |

(Skip the GitFork icon and "Workflows / Pipelines" prefix if it feels like ceremony — they're optional. The minimum left cluster is: amber-mark + "otto" + "/" + editable workflow name + version pill.)

### Right cluster

| Element | Spec |
|---|---|
| Active toggle | Pill toggle, 32×18, `border-radius: 10px`, background `var(--node-success)` when on / `var(--bg-hover)` when off, inner thumb `14×14` white circle. Reads/writes `useStore((s) => s.workflowActive)` (add to store, default false) |
| `Active`/`Paused` label | Inter `12.5px` `500` text-primary, next to the toggle |
| Share | Outline button, `<Share2 size={13} />` + `Share` label, Inter `12px` `500`, padding `6px 11px`, `1px solid var(--border)`, `5px` radius, transparent bg |
| Save | Primary button — keep current "✓ Saved" toggle behavior. Padding `7px 14px`, background `OTTO_AMBER`, color white, `5px` radius |
| ⋯ menu | `28×28` icon button, `<MoreHorizontal size={14} />`, `1px solid var(--border)`, `5px` radius (no menu wired yet — visual only) |

### Drop

- The Settings (gear) icon button — moves into the `⋯` menu (later)
- The node/edge counter `3n · 2e` — drop entirely (it's noise; the canvas itself shows the graph)
- Theme toggle — move it into the `⋯` menu, or keep it visible as a small `<Sun>/<Moon>` button between Active and Share if you want it discoverable

---

## 5. Bottom panels — new

Two docked panels along the bottom of the canvas: **otto bot** on the left, **Live execution** on the right.

### App.tsx — layout slot

The current `App.tsx` has Toolbar → (Sidebar + Canvas + ConfigPanel) in a vertical flex. Add a horizontal `BottomPanels` strip below the main body:

```tsx
<div className="flex flex-col h-screen ...">
  <Toolbar />
  <div className="flex flex-1 overflow-hidden">
    {/* sidebar, canvas, config panel — as before */}
  </div>
  <BottomPanels />   {/* NEW */}
</div>
```

`BottomPanels` is a 240px-tall flex row with a top border `1px solid var(--border)`. It contains `<OttoBotPanel />` and `<ExecutionPanel />`, each `flex: 1` with a `1px solid var(--border)` separator between.

Add to store: `bottomPanelsOpen: boolean` (default `true`). Add a chevron toggle on the right edge of the top border (or in the `⋯` menu) to collapse.

### OttoBotPanel.tsx — mock (no backend)

Layout:

```
┌────────────────────────────────────────────────────┐
│ ▣ otto bot   workflow assistant                  v │   ← 36px header
├────────────────────────────────────────────────────┤
│                                                    │
│ ▣ Your agent runs CRM lookup and Past conv...     │   ← body
│   sequentially. Running them in parallel cuts     │
│   latency by ~2.3×.                               │
│   [Refactor for me]  [Show where]                  │
│                                                    │
├────────────────────────────────────────────────────┤
│ Ask otto bot to improve this workflow…       [→]  │   ← input
└────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Container | `flex: 1`, `var(--bg-panel)` bg, vertical flex, right border `1px solid var(--border)` |
| Header (36px) | Padding `0 14px`, flex row gap 8px. Amber 18×18 sparkles square. `otto bot` Inter 12.5px 600. `workflow assistant` JetBrains Mono 9.5px 500 text-muted. Right-side: down-chevron icon for collapse |
| Body | Padding `12px 14px`, scrollable. One mock message bubble (amber sparkles square + paragraph + two buttons "Refactor for me" amber primary / "Show where" outline) |
| Input bar | `var(--bg-input)` filled bar, `border-top: 1px solid var(--border)`, `7px 10px` inner padding, placeholder `Ask otto bot…`, amber `<SendHorizontal size={13} />` on the right |

The Refactor/Show buttons do nothing yet — pure visual. Wire later when the suggestion engine exists.

### ExecutionPanel.tsx — wires to existing state

Already-existing store state: `executionPhase`, `executionId`, `nodeExecutions: Record<string, NodeExecution>`. Use this real data — don't mock the timeline.

Layout:

```
┌────────────────────────────────────────────────────┐
│ ⚡ Live execution  · RUNNING            exec_8f3a  │   ← 36px header
├──────────────────┬─────────────────────────────────┤
│ ● Webhook    12ms│  OUTPUT · agent.tool_call       │
│ ● Lead agent 1.4s│  {                              │
│ ● Create…   89ms │    "sentiment": "positive",     │
│ ⊙ Notify ops     │    "score": 0.982,              │
│ ○ Write answer   │    ...                          │
└──────────────────┴─────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Container | `flex: 1`, `var(--bg-panel)` bg, vertical flex |
| Header (36px) | Same shape as otto bot. `<Activity size={13} color="var(--node-success)" />` + `Live execution` label. **Running pill**: JetBrains Mono `9.5px` `700` letter-spacing `0.06em`, color `var(--node-success)`, bg `hexA(var(--node-success), 0.15)`, border `1px solid hexA(var(--node-success), 0.30)`, padding `2px 7px`, `3px` radius, only visible when `executionPhase === 'running'`. Reads `· RUNNING` |
| Right of header | `exec_8f3a · 2s ago` — JetBrains Mono `9.5px` `500` text-muted. Truncated execution ID + relative time |
| Timeline (188px wide, left side) | `1px solid var(--border)` right edge, `padding: 11px 10px`, vertical flex gap 4. One `<TimelineRow />` per node-id in the current workflow, in DAG order (use the order from `useStore((s) => s.nodes)` for now) |
| JSON view (flex 1, right side) | Padding `12px 14px`, scrollable, `var(--bg-canvas)` bg, font JetBrains Mono `11.5px` `400`. Heading `OUTPUT · {selectedNode.label}` in JetBrains Mono `9.5px` `600` letter-spacing `0.10em` text-muted. Pretty-printed JSON of the selected node's `nodeExecutions[id].output` (or a hint string if no execution data yet). Optional: syntax-highlight keys, strings, numbers (the mockup does — but it's polish, not required) |

**TimelineRow**:

```ts
function TimelineRow({ nodeId, label, status, durMs }: {...}) {
  const c = status === 'success' ? 'var(--node-success)'
          : status === 'running' ? 'var(--node-running)'
          : status === 'error'   ? 'var(--node-error)'
          :                        'var(--node-pending)';
  // 8×8 dot in `c`, pulse animation when running.
  // Label: Inter 11.5px 500, ellipsis. Dim color when pending.
  // Duration: JetBrains Mono 9.5px 500 text-muted, right-aligned.
  // Container: padding 6px 8px, border-radius 4px.
  //   When running: background hexA(--node-success, 0.10), border 1px solid hexA(--node-success, 0.22).
}
```

Pulse keyframe (add to `index.css`):

```css
@keyframes otto-pulse {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}
```

When `executionPhase === 'idle'`, show all rows as pending. When `running`, the current node from `nodeExecutions` pulses. When `success`/`error`, all rows reflect their final status.

---

## 6. Inspector polish (small)

`ConfigPanel.tsx` already exists and renders the field forms. Just update the **header**:

- Header is `54px` tall, padding `0 16px`, border-bottom `1px solid var(--border)`
- Title: `Properties` — Inter `13.5px` `700` `-0.012em`
- ID pill (next to title): JetBrains Mono `9.5px` `600` letter-spacing `0.04em` text-muted, padding `2px 6px`, `1px solid var(--border)`, `3px` radius. Content: first 8 chars of the selected node's UUID, e.g. `agent_923` → use `selectedNodeId.slice(0, 8)` — or `def.slug.toLowerCase() + '_' + selectedNodeId.slice(0, 4)` for friendlier reads
- Close button: `24×24`, `<X size={14} />`, transparent, no border. Clicking selects null (closes the panel)

Field labels in the body — JetBrains Mono `9.5px` `600` letter-spacing `0.14em` uppercase, color text-secondary.

(Existing field components — text, textarea, select, range, code — stay as they are unless you spot drift from the mockup. Don't touch the wiring.)

---

## 7. Canvas tweaks (small)

- The current dot grid is too faint. Bump `Background` opacity from `0.15` to `0.20` in dark, and use `gap={18} size={1}` instead of `24/1.5` to match the mockup's denser feel.
- Zoom controls — keep React Flow's `<Controls />` but force `position="bottom-left"` (already done), `margin: 16` from edges. Visual styling for the buttons is already in `index.css`.
- Minimap — already correct after Phase 1.

---

## 8. Edge defaults

In `store.ts` `onConnect` and `Canvas.tsx` `defaultEdgeOptions`, the edge type is currently `'smoothstep'`. The mockup uses smooth cubic beziers (which looks more "AI/parallel-execution"). Switch to `'default'` (React Flow's `bezier`) — single-line change.

---

## Acceptance check (Phase 2)

After implementing, the canvas should:

1. Boot cleanly via `cd canvas && npm run dev` — no console errors
2. Drag a Webhook from the sidebar — renders as a **horizontal 196×58 card**, amber icon container (rounded square), label "Webhook" + subtitle "POST /webhook/my-webhook", amber `TRIGGER` tag in the top-right corner
3. Drag an HTTP Request — same horizontal layout, neutral-gray icon container (soft square), `LOGIC` tag
4. Drag a Postgres Query — neutral-gray? No: Postgres blue (`#336791`) icon container in tight-square shape, `POSTGRES` tag (or `DATA` if you keep category tags)
5. Drag an **AI Agent** — renders **completely different**: 336px-wide card, amber circle header with sparkles, `MAIN` tag, divider, `TOOLS · 04` section, four pre-populated tool rows (CRM lookup / Customer DB / Past conversations / Calculator), `+ Add tool` button below
6. Open the topbar — amber `otto` mark + breadcrumb `Workflows / Pipelines / [Untitled Workflow]` + version pill `v1.0.0`. Right side: green Active toggle, Share outline button, amber Save button, ⋯ icon
7. Bottom of the screen — two docked panels. **otto bot** on the left with a mock improvement suggestion + Refactor/Show buttons. **Live execution** on the right showing a timeline of the current workflow's nodes (all pending until Run is clicked)
8. Click Run — execution panel comes alive: the running row pulses green, others reflect status, JSON output shows the selected node's output
9. Both themes work — toggle to light, no broken contrast
10. No Fraunces anywhere. No purple anywhere. Edges are neutral gray (not category-tinted)

---

## What's NOT changing

- React Flow integration, the existing `Handle` wiring, Zustand store actions (you'll add 2-3 fields)
- Execution engine, queue, DB, routes
- Sidebar accordion + drag/drop
- Field-editor components inside ConfigPanel
- Spring-release on node drag
- Keyboard shortcuts (Ctrl+B, Cmd+D, Cmd+Shift+F)

---

## How big is this honestly

Realistic for Claude Code: **4–8 hours** of focused work across 8 commits. The risky pieces are:
- AgentNode (new component + new tool list editor in ConfigPanel)
- ExecutionPanel (real data binding, not mocked)
- Bottom panel layout shift (new vertical slot in App.tsx)

The cosmetic stuff (Toolbar rewrite, node-card refactor, subtitle resolver) is mechanical.

If you want to land it in two passes instead of one merge: do steps 1–3 (node cards + subtitle + agent special node) first, merge that, then do 4–7 in a second pass.
