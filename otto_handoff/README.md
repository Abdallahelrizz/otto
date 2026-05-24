# Otto · v5 design handoff

This folder is for Claude Code, working in your `otto/` repo on the `frontend-testing` branch. The goal is to merge `frontend-testing → main` looking like the v5 design.

## What's in here

| File | Purpose |
|---|---|
| `PROMPT.md` | **Paste this into Claude Code as your first message.** |
| `README.md` | This file — full spec for what's changing and why. |
| `Otto Canvas v2.html` | Open in any browser. The mockup. Two artboards: dark + amber, light + amber. |
| `otto-v5*.jsx` | Source of the mockup (read-only reference). |
| `design-canvas.jsx` | The pan/zoom canvas wrapper for the mockup. Not relevant to implementation. |

---

## Phase 1 — required for the merge (≈90 min)

Three focused changes get the canvas from where it is now to the v5 direction. Nothing else is required.

### 1.1 Drop Fraunces. Inter everywhere humans read.

The serif accent was a mistake — it doesn't match the engineering-tool tone you want.

- `canvas/index.html` — remove `Fraunces` from the Google Fonts link
- `canvas/src/index.css` — remove the `.font-fraunces` class
- `canvas/src/components/Toolbar.tsx` — the `otto` wordmark and the editable workflow name both currently use Fraunces. Replace:
  - **Wordmark `otto`**: Inter, `font-size: 16px`, `font-weight: 700`, `letter-spacing: -0.022em`
  - **Workflow name** (display + edit input): Inter, `font-size: 13px`, `font-weight: 500`, `letter-spacing: -0.008em`, no italic
- `canvas/src/components/Canvas.tsx` — the empty-state heading currently uses Fraunces 36px. Replace with Inter `font-size: 22px`, `font-weight: 700`, `letter-spacing: -0.018em`.

That's it. Inter handles every UI surface; JetBrains Mono handles every technical surface (labels, slugs, counters, code). Two fonts total.

### 1.2 Rebrand to amber-only. Kill purple and cyan.

Amber `#FF6F1A` is Otto's single brand color. Categories no longer carry their own colors — color now means *what something IS* (Otto-native vs third-party service vs logic primitive).

**In `canvas/src/components/nodes/nodeConfig.ts`:**

Replace the existing `CATEGORY_COLORS` and `CATEGORY_EDGE_COLOR` with a different system. Categories no longer drive color directly — they drive **shape**. A new per-node `visual` field drives color.

```ts
// Brand
export const OTTO_AMBER       = '#FF6F1A';
export const OTTO_AMBER_HOVER = '#FF8A47';

// Shape encodes what the node DOES — category-driven
export const CATEGORY_SHAPE: Record<string, 'rounded' | 'circle' | 'square-soft' | 'square-tight'> = {
  triggers: 'rounded',      // 7px radius rounded square
  ai:       'circle',       // 50%
  core:     'square-soft',  // 4px radius
  data:     'square-tight', // 2px radius
};

// Color encodes WHAT it is — per-node override on top of category default
// 'amber'   = Otto-native (triggers, our AI primitives)
// 'service' = third-party service (Postgres, Slack, OpenAI) — uses node.serviceColor
// 'neutral' = logic primitive (HTTP, IF, Merge, Code) — neutral gray
export type NodeTint = 'amber' | 'service' | 'neutral';

// Real service brand colors — only used when tint='service'
export const SERVICE = {
  postgres:  '#336791',
  openai:    '#10A37F',
  anthropic: '#D97757',
  slack:     '#611F69',
  twilio:    '#F22F46',
  github:    '#1F2328',
  stripe:    '#635BFF',
} as const;

// Edge color — neutral gray now, not category-tinted
export const EDGE_COLOR_DARK  = 'rgba(255,255,255,0.16)';
export const EDGE_COLOR_LIGHT = 'rgba(15,15,10,0.18)';
```

**Then update each `NodeTypeDef` with the new fields:**

```ts
interface NodeTypeDef {
  // ...existing fields...
  tint: NodeTint;             // 'amber' | 'service' | 'neutral'
  serviceColor?: string;      // hex — required iff tint === 'service'
}
```

| Node type | tint | serviceColor |
|---|---|---|
| `webhook_trigger` | `amber` | — |
| `http_request` | `neutral` | — |
| `if` | `neutral` | — |
| `merge` | `neutral` | — |
| `set` | `neutral` | — |
| `code` | `neutral` | — |
| `delay` | `neutral` | — |
| `filter` | `neutral` | — |
| `loop` | `neutral` | — |
| `sub_workflow` | `neutral` | — |
| `send_email` | `neutral` | — |
| `llm_call` | `amber` | — |
| `ai_agent` | `amber` | — |
| `vector_search` | `amber` | — |
| `postgres_query` | `service` | `SERVICE.postgres` |
| `redis_get` | `service` | `'#DC382D'` |
| `redis_set` | `service` | `'#DC382D'` |

**Helper for the resolved color, theme-aware (add to `nodeConfig.ts` or a new `visual.ts`):**

```ts
export function nodeColor(def: NodeTypeDef, theme: 'dark' | 'light'): string {
  if (def.tint === 'amber')   return OTTO_AMBER;
  if (def.tint === 'service') return def.serviceColor ?? '#94A3B8';
  // neutral
  return theme === 'dark' ? '#A1A1AA' : '#52525B';
}

export function nodeRadius(def: NodeTypeDef): string {
  const shape = CATEGORY_SHAPE[def.category];
  if (shape === 'circle')        return '50%';
  if (shape === 'rounded')       return '7px';
  if (shape === 'square-tight')  return '2px';
  return '4px';
}
```

Where `nodeColor()` is consumed:
- `OttoNode.tsx` — for the icon container background, border, icon color, and selection ring
- `Canvas.tsx` MiniMap — `getNodeDef(n.data.nodeType)` is already in scope; call `nodeColor(def, theme)` instead of `def.color`
- `store.ts` `onConnect` — for edge color, use a neutral gray (see edge tokens above), NOT the source node's color. Edges are silent infrastructure.

### 1.3 Icon containers behind each node icon (shape × color recognition)

The current `OttoNode.tsx` puts the Lucide/Phosphor icon naked on the card. Wrap it in a shape-bearing container — that's where the shape×color system actually shows up.

**In `OttoNode.tsx`**, replace the existing icon row:

```tsx
{/* Icon container — shape from category, color from tint */}
<div style={{
  width: 32, height: 32,
  borderRadius: nodeRadius(def),
  background: hexA(nodeColor(def, theme), 0.14),
  border: `1px solid ${hexA(nodeColor(def, theme), 0.28)}`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
  marginTop: 4,
}}>
  <NodeIcon type={data.nodeType} size={18} color={nodeColor(def, theme)} />
</div>
```

Reduce the Lucide/Phosphor icon size from 28 to 18 (it now lives inside a 32×32 container).

**Read theme from store** (it's already there): `const theme = useStore((s) => s.theme);` — pass into both `nodeColor()` calls.

**Card border** — replace the category-color border with neutral hairline + a colored selection ring:

```tsx
const cardColor = nodeColor(def, theme);

const borderColor =
  isRunning ? '#3B82F6' :
  isSuccess ? 'var(--node-success)' :
  isError   ? 'var(--node-error)' :
  selected  ? cardColor :
  hovered   ? (theme === 'dark' ? 'rgba(255,255,255,0.18)' : 'rgba(15,15,10,0.20)') :
              (theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(15,15,10,0.10)');

const boxShadow =
  selected ? `0 0 0 3px ${hexA(cardColor, 0.18)}` :
  isSuccess ? '0 0 0 2px rgba(34,197,94,0.14)' :
  isError   ? '0 0 0 2px rgba(239,68,68,0.14)' :
  'none';
```

The result: at a glance the user can read **(a)** category from the icon-container shape, and **(b)** identity from its color — without the card itself shouting.

### Done. That's Phase 1.

Sidebar already uses `CATEGORY_COLORS[def.category]` for the icon container background — pipe it through `nodeColor()` instead so the sidebar matches the canvas. Same for the sidebar category-header color dot.

---

## Phase 2 — defer (the v5 mockup goes beyond what's needed for the merge)

The mockup also shows:

- **A "BigAgentNode" — AI Agent rendered as a 336px-wide card with its tools listed inline**, an `+ Add tool` button, three output handles. This is a UX bet about how agents should look — worth doing, but it's a new node-rendering mode, not a rebrand. Save for after the merge.
- **An "otto bot" panel** docked along the bottom — a workflow-improvement assistant. New component. New backend. Save for later.
- **A "Live execution" panel** docked along the bottom with timeline + JSON output. Replaces nothing; complements the canvas. Save for later.
- **A new topbar** with breadcrumbs + Active toggle + Share/Save split. Nice-to-have. Save for later.

If you want any of these post-merge, ask me for a Phase 2 handoff and I'll write a separate spec.

---

## Acceptance check (Phase 1)

After implementing, the canvas should:

1. Boot cleanly via `cd canvas && npm run dev` — no console errors
2. **No Fraunces anywhere.** Devtools spot-check the `otto` wordmark, the workflow name, the empty-state heading — all `font-family: Inter`.
3. **No purple or cyan anywhere.** Drop an LLM Call node — its icon container is amber. Drop a Postgres Query — its container is Postgres blue (`#336791`). Drop an HTTP Request — neutral gray.
4. **Shape varies by category.** Webhook → rounded square. LLM Call → circle. HTTP Request → soft square. Postgres Query → tight square.
5. **Edges are neutral gray**, not amber/cyan/violet
6. **Theme toggle still works.** Flip to light — everything reads correctly. Amber stays `#FF6F1A` (looks right on both).
7. **MiniMap colors match.** A workflow with Webhook + LLM + Postgres + HTTP shows amber + amber + blue + gray dots.

---

## Files touched (Phase 1)

```
canvas/
├── index.html                              ← drop Fraunces from Google Fonts link
├── src/
│   ├── index.css                           ← drop .font-fraunces utility (if used anywhere)
│   ├── components/
│   │   ├── Toolbar.tsx                     ← Fraunces → Inter (wordmark + name)
│   │   ├── Canvas.tsx                      ← Fraunces → Inter (empty state heading); MiniMap color via nodeColor()
│   │   ├── Sidebar.tsx                     ← icon container uses nodeColor() + nodeRadius()
│   │   └── nodes/
│   │       ├── OttoNode.tsx                ← icon container + neutral hairline + colored selection
│   │       └── nodeConfig.ts               ← drop CATEGORY_COLORS; add tint/serviceColor; add nodeColor + nodeRadius helpers
│   └── store.ts                            ← onConnect: edge stroke = neutral gray, not category color
```

Don't touch: backend, queue, DAG, executor, routes, schema, migrations, or the `NodeTypeDef.fields` arrays.
