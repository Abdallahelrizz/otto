# Handoff — Node cards (P1 Pure Square) + typographic system (T0)

You are implementing a redesign of the Otto canvas node cards and the typographic system. Everything you need is in this folder. The HTML files are **design references**, not production code — your job is to translate them into the existing canvas codebase (React + Vite + React Flow + Zustand + Tailwind + Phosphor) while keeping the engine, store, and routes untouched.

The bundled mockup (`Node Cards v2.html`) opens in any browser. The **P1 Pure Square** artboard is the direction to implement; **T0 Typography** documents the font system. Other variants (P2/P3/P4) are reference only — ignore them.

---

## Fidelity

**Hi-fi.** Match colors, sizes, fonts, spacing, and handle behavior exactly. Anywhere a number appears in this README, use that number — don't invent your own.

---

## What changes (file map)

```
canvas/
├── index.html                              ← + Google Fonts link OR local @font-face
├── public/fonts/
│   ├── Inter-Variable.woff2                ← NEW (if local font hosting)
│   ├── JetBrainsMono-Variable.woff2        ← NEW
│   └── Fraunces-Variable.woff2             ← NEW
├── src/
│   ├── index.css                           ← font @font-face, body font-family
│   ├── components/
│   │   ├── nodes/
│   │   │   ├── OttoNode.tsx                ← ⚠ full rewrite
│   │   │   └── nodeConfig.ts               ← ⚠ extend HandleDef, add `complex`/`extras`/`slug`; drop card-bg/radius constants
│   │   ├── NodeIcon.tsx                    ← weight → 'bold' uniformly
│   │   ├── Toolbar.tsx                     ← Fraunces for "otto" + workflow name
│   │   ├── Sidebar.tsx                     ← Inter for rows, JetBrains Mono for category headers
│   │   ├── Canvas.tsx                      ← Fraunces for empty-state heading
│   │   └── ConfigPanel.tsx                 ← Inter for labels, Geist Mono for code/JSON
│   └── store.ts                            ← (unchanged)
```

Backend, queue, DAG, executor, routes, schema, migrations — **don't touch**.

---

## Visual spec — node cards

### Card sizing

| Kind        | Width        | Height                                    | When                                              |
|-------------|--------------|-------------------------------------------|---------------------------------------------------|
| **Simple**  | `72px`       | `72px`                                    | Node has ≤1 input and ≤1 output, no extras       |
| **Complex** | `100px`      | computed (formula below)                  | Node has >1 input OR >1 output OR has extras     |

**Complex height formula** (driven by the busier vertical edge):

```ts
function cardHeightFor(node) {
  const vert = Math.max(node.handles.in.length, node.handles.out.length);
  if (vert <= 1) return 72;
  // 14px top pad + (n-1) * 22px spacing + 14px bottom pad + 24px content room
  return Math.max(72, 14 + (vert - 1) * 22 + 14 + 24);
}
```

This produces:

| Node       | inputs | outputs | extras | width | height |
|------------|--------|---------|--------|-------|--------|
| IF Condition | 1 | 2 | 0 | 100 | 74 → round to 88 |
| Merge      | 3      | 1       | 0      | 100   | 96     |
| Loop       | 1      | 2       | 0      | 100   | 88     |
| LLM Call   | 1      | 1       | 1 (bot)| 100   | 72     |
| AI Agent   | 1      | 1       | 5 (bot)| 100   | 72     |
| (all simple)| ≤1    | ≤1      | 0      | 72    | 72     |

Match the mockup's actual computed heights (eyeball the screenshot or open the mockup).

### Card body (P1 Pure Square)

| Property            | Value                                                |
|---------------------|------------------------------------------------------|
| Background          | `#101015`                                            |
| Border              | `1.5px solid {category-color at 55% alpha}`          |
| Border radius       | `6px`                                                |
| Padding top         | `10px`                                               |
| Padding bottom      | `8px`                                                |
| Padding x           | `4px`                                                |
| Layout              | Column flex, items centered                          |
| Overflow            | Hidden (clip the label cleanly at 2 lines)           |
| Transition          | `all 130ms ease-out` on hover/select                 |

Border alpha math: `1.5px solid rgba(R,G,B,0.55)` where `R,G,B` come from the category hex (see Color tokens below).

### Icon

| Property      | Value                                                |
|---------------|------------------------------------------------------|
| Library       | Phosphor (already in `canvas/package.json`)          |
| Size          | `28px`                                               |
| Weight        | `'bold'` — **uniform across all categories**         |
| Color         | Category color, full opacity                         |
| Position      | Centered horizontally, sits in a `32px` tall row     |
| Vertical      | Top of card (not center)                             |

Don't reintroduce a colored "icon container" background — in P1 the icon sits naked on the dark card.

### Label

| Property             | Value                                               |
|----------------------|-----------------------------------------------------|
| Font family          | `'JetBrains Mono'`                                  |
| Font size            | `11px` (the minimum allowed by the type system)     |
| Font weight          | `500`                                               |
| Color                | `rgba(232,232,238,0.92)`                            |
| Text align           | `center`                                            |
| Line height          | `1.18`                                              |
| Letter spacing       | `-0.005em`                                          |
| Max lines            | `2` (use `-webkit-line-clamp: 2` + `display: -webkit-box`) |
| Word break           | `break-word`                                        |

Per the spec the label is **JetBrains Mono, not Inter** — node *type* labels are technical content.

### Handles (dots)

| Property      | Value                                                |
|---------------|------------------------------------------------------|
| Shape         | Circle                                               |
| Size          | `8px`                                                |
| Color         | Category color (or per-handle override — see IF)     |
| Ring          | `2px solid #0a0a0c` (canvas color, separates dot from edge) |
| Visibility    | **Always visible** — drop the hover-only opacity rule |
| Z-index       | `2` (above card body but below labels with text)     |

**Position math** for handles on a side with `count` dots, indexed `i` from 0:
- Distribute evenly: `y = ((i + 1) / (count + 1)) * cardHeight`
- Dot center sits **on the card edge**: `left: -4` for input dots, `right: -4` for output dots
- Transform `translateY(-50%)` so the center is on the computed `y`

Bottom-edge (extras) handles distribute the same way along the X axis: `x = ((i + 1) / (count + 1)) * cardWidth`, `bottom: -4`, `translateX(-50%)`.

### Handle labels (complex nodes only)

| Property         | Value                                                  |
|------------------|--------------------------------------------------------|
| Font family      | `'JetBrains Mono'`                                     |
| Font size        | `11px`                                                 |
| Font weight      | `500`                                                  |
| Letter spacing   | `0.02em`                                               |
| Color            | `{handle color} at 95% alpha`                          |
| Line height      | `1`                                                    |
| Pointer events   | `none`                                                 |

**Position** (relative to the card, all `position: absolute`):

| Handle side    | Anchor                        | Alignment       |
|----------------|-------------------------------|-----------------|
| Left (input)   | `right: calc(100% + 12px)`    | right-aligned   |
| Right (output) | `left: calc(100% + 12px)`     | left-aligned    |
| Bottom (extra) | `top: calc(100% + 12px)`      | center-aligned (`left: x`, `translateX(-50%)`) |

A simple 1-in/1-out node has **no** handle labels (just the dots). Labels only appear when a handle has a `label` field in the node def.

### State styling

| State        | Border                                 | Box-shadow                           |
|--------------|----------------------------------------|--------------------------------------|
| Default      | `1.5px solid {cat}@0.55`              | none                                 |
| Hover        | `1.5px solid {cat}@0.75`              | none                                 |
| Selected     | `1.5px solid {cat}@0.95`              | `0 0 0 3px {cat}@0.15`               |
| Running      | `1.5px solid #3b82f6`                  | pulse @ 1.8s (`@keyframes node-running-pulse` — keep) |
| Success      | `1.5px solid #22c55e`                  | `0 0 0 2px rgba(34,197,94,0.14)`     |
| Error        | `1.5px solid #ef4444`                  | `0 0 0 2px rgba(239,68,68,0.14)`     |

Drop the 3-dot menu button — the card is too small. Use right-click for context menu (the canvas already supports `onNodeContextMenu`). Drop the bottom execution-timing row — move that to the inspector's execution section instead.

### Running indicator

The card is small but a 3-dot button area is freed up. Put a `8×8` blue spinner in the **top-right corner** of the card (4px from edges) when `status === 'running'`. Match the spinner styling from `node-cards-v2.jsx` if you want a reference.

---

## Color tokens

```
--bg-canvas         : #0a0a0c
--bg-node-card      : #101015        (NEW — replaces --bg-node #1c1c1f)
--bg-toolbar        : #111113        (unchanged)
--bg-sidebar        : #111113        (unchanged)

--cat-triggers      : #f59e0b        (amber)
--cat-core          : #64748b        (slate)
--cat-ai            : #8b5cf6        (violet)
--cat-data          : #06b6d4        (cyan)

--text-primary      : rgba(232,232,238,0.92)
--text-secondary    : rgba(170,170,180,0.85)
--text-muted        : rgba(120,120,135,0.7)

--node-success      : #22c55e
--node-error        : #ef4444
--node-running      : #3b82f6
```

Border alphas computed per state from the category color. No new tokens needed for those — compute inline or with a small helper.

---

## Typographic system (T0)

### Four families. Restricted by role.

| Family              | Role                                                  | Where it appears                                                                                       |
|---------------------|-------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| **Inter**           | UI chrome                                             | Sidebar rows, inspector labels, buttons, tooltips, search inputs, dropdowns, anything human-readable in chrome |
| **JetBrains Mono**  | Technical, small                                      | Node labels (on the cards), handle labels, slug tags, category headers in sidebar, exec log lines, status timing |
| **Geist Mono**      | Code & values                                         | Code editor textareas, JSON viewer, parameter values, anywhere we display raw user-entered data        |
| **Fraunces**        | Serif accent (sparingly)                              | Toolbar workflow name (italic, opsz 60); empty-state heading on canvas (opsz 144). Nowhere else.       |

### Hard rules

- **Never** fall back to `system-ui`, `sans-serif`, or generic. Specify the family directly with no fallback list.
- **Minimum font size: 11px** anywhere in the UI.
- **Monospace only** where content is technical or code. A button label is not technical.
- **Serif only** in the two named places. No serif decorations elsewhere.
- The contrast between the serif workflow name and monospace node labels is **intentional**. Don't soften it.

### Font specs

| Family          | Weights to load  | Notes                                                  |
|-----------------|------------------|--------------------------------------------------------|
| Inter           | 400, 500, 600, 700 | Use the variable font when possible                   |
| JetBrains Mono  | 400, 500, 600    | Use the variable font when possible                    |
| Fraunces        | 400, 500, 600    | Variable opsz axis required (use `9..144`)             |
| Geist Mono      | (already installed) | Keep current `@font-face`                           |

### How to install

Two options — pick one:

**A. Local hosting (matches existing Geist pattern, no network dep at runtime):**

1. Download each variable woff2 (Google Fonts or font foundry)
2. Drop in `canvas/public/fonts/`
3. Add `@font-face` declarations in `canvas/src/index.css`, mirroring the existing Geist block

**B. Google Fonts CDN link in `canvas/index.html`:**

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap" />
```

Recommend (A) for production. (B) is fine for getting the design landed.

### Sample usage (where to put each font, file by file)

#### `canvas/src/index.css`
```css
body, * {
  font-family: 'Inter';        /* was: 'Geist' — switch the default */
}
code, pre, textarea.mono, .mono {
  font-family: 'Geist Mono';   /* unchanged */
}
.font-jbm {
  font-family: 'JetBrains Mono';
}
.font-fraunces {
  font-family: 'Fraunces';
}
```

#### `canvas/src/components/Toolbar.tsx`
- `otto` wordmark → `font-family: 'Fraunces'`, weight 500, opsz 144, **upright** (not italic), size 22px
- Workflow name (editable) → `font-family: 'Fraunces'`, weight 400, opsz 60, **italic**, size 18px
- Buttons, save text, run text, theme toggle → Inter
- Node/edge counter → JetBrains Mono (`17n · 24e` pattern)

#### `canvas/src/components/Sidebar.tsx`
- Category section headers (`TRIGGERS`, `CORE`, `AI`, `DATA`) → JetBrains Mono, 11px, weight 600, letter-spacing 0.14em, color `rgba(180,180,190,0.85)`
- Node row labels (e.g. `HTTP Request`) → Inter, 13px, weight 500
- Search input → Inter, 13px

#### `canvas/src/components/Canvas.tsx`
- Empty-state heading (`Start with a trigger.`) → Fraunces, 36px, weight 500, opsz 144, letter-spacing -0.018em
- Empty-state subhead → Inter, 14px, weight 400, color `rgba(170,170,180,0.85)`

#### `canvas/src/components/ConfigPanel.tsx`
- Section headers (`CONFIGURATION`, `EXECUTION`) → JetBrains Mono, 11px, weight 600, letter-spacing 0.14em
- Field labels (`URL`, `Method`, `System Prompt`) → Inter, 12px, weight 500
- Text inputs (user types human content here) → Inter, 13px
- Code textarea / JSON viewer → Geist Mono, 12px

#### `canvas/src/components/nodes/OttoNode.tsx`
- Node label → JetBrains Mono, 11px, weight 500
- Handle labels (`true`, `false`, `input 1`, `model`, etc.) → JetBrains Mono, 11px, weight 500

---

## Node configuration — full handle table

Update `nodeConfig.ts` so every node carries its handle spec. Suggested shape:

```ts
export interface HandleDef {
  id: string;
  label?: string;             // present on multi-handle nodes only
  color?: string;             // override category color (used by IF for green/red)
  side?: 'left' | 'right' | 'bottom';
}

export interface NodeTypeDef {
  type: string;
  category: 'triggers' | 'core' | 'ai' | 'data';
  label: string;
  description: string;
  complex?: boolean;
  slug?: string;              // optional mono slug (unused in P1 — reserved for future)
  handles: {
    in: HandleDef[];
    out: HandleDef[];
    extras?: HandleDef[];     // side defaults to 'bottom'
  };
  defaultConfig: Record<string, unknown>;
  fields: FieldDef[];
}
```

### Full handle config

| Type              | Category | Complex | Inputs                                              | Outputs                                             | Extras (bottom)                                                              |
|-------------------|----------|---------|-----------------------------------------------------|-----------------------------------------------------|------------------------------------------------------------------------------|
| `webhook_trigger` | triggers | no      | —                                                   | `[{id:'output'}]`                                    | —                                                                            |
| `http_request`    | core     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `if`              | core     | **yes** | `[{id:'input'}]`                                    | `[{id:'true', label:'true', color:'#22c55e'}, {id:'false', label:'false', color:'#ef4444'}]` | — |
| `merge`           | core     | **yes** | `[{id:'in1',label:'input 1'},{id:'in2',label:'input 2'},{id:'in3',label:'input 3'}]` | `[{id:'output'}]` | — |
| `set`             | core     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `code`            | core     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `delay`           | core     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `filter`          | core     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `loop`            | core     | **yes** | `[{id:'input'}]`                                    | `[{id:'loop',label:'loop'},{id:'done',label:'done'}]` | —                                                                          |
| `sub_workflow`    | core     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `send_email`      | core     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `llm_call`        | ai       | **yes** | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | `[{id:'model',label:'model'}]`                                              |
| `ai_agent`        | ai       | **yes** | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | `[{id:'t1',label:'1'},{id:'t2',label:'2'},{id:'t3',label:'3'},{id:'t4',label:'4'},{id:'t5',label:'5'}]` |
| `vector_search`   | ai       | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `postgres_query`  | data     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `redis_get`       | data     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |
| `redis_set`       | data     | no      | `[{id:'input'}]`                                    | `[{id:'output'}]`                                    | —                                                                            |

---

## React Flow integration notes

- `OttoNode` is registered in `Canvas.tsx` via `nodeTypes = { ottoNode: OttoNode }` (already wired)
- The `Handle` component from React Flow must wrap each dot. Position prop:
  - `Position.Left` for inputs (with custom `top` style)
  - `Position.Right` for outputs (with custom `top` style)
  - `Position.Bottom` for extras (with custom `left` style)
- Each Handle needs a unique `id` matching the node def
- The store's `onConnect` already handles per-handle edge coloring for IF's `true`/`false` — extend the same pattern for Loop (`loop` could be category color, `done` could be a muted gray)
- Drop the `.react-flow__handle { opacity: 0; }` rule in `index.css` — handles must be always visible now

---

## What to drop / clean up

- The old left accent bar (no longer used in P1)
- `CATEGORY_RADIUS`, `CATEGORY_CARD_BG`, `CATEGORY_CARD_BG_HOVER`, `CATEGORY_CARD_BG_SELECTED`, `CATEGORY_CARD_BORDER`, `CATEGORY_CARD_BORDER_SELECTED`, `CATEGORY_ROW_HOVER` constants in `nodeConfig.ts` — unused once we move to single-tone borders
- The 3-dot hover button in `OttoNode.tsx`
- The bottom execution-timing row in `OttoNode.tsx` (timing moves to inspector)
- The `react-flow__handle { opacity: 0 }` hover-only handle visibility rule

Keep:
- `CATEGORY_COLORS`, `CATEGORY_EDGE_COLOR`, `CATEGORY_ICON_WEIGHT` (set all to `'bold'`)
- Node execution-state border classes (`.otto-node-running`, `.otto-node-success`, `.otto-node-error`) — update border-color and box-shadow values per the spec above
- The spring-release animation on drag-drop

---

## Interactions & behavior

| Trigger              | Behavior                                                                            |
|----------------------|-------------------------------------------------------------------------------------|
| Hover card           | Border alpha → 0.75; no shadow                                                       |
| Click card           | Selected state (alpha 0.95 + 3px shadow ring at 0.15)                                |
| Right-click card     | Context menu (already implemented — keep)                                            |
| Drag card            | Existing spring-release animation                                                    |
| Drop into canvas     | Existing spring-release animation                                                    |
| Drag handle out      | React Flow's native connection drawing                                               |
| Execution running    | Border switches to blue, 1.8s pulse, spinner in top-right corner of card             |
| Execution success    | Border → green, 0 0 0 2px green@0.14 shadow, hold ~3s, then revert                   |
| Execution error      | Border → red, same shadow pattern in red, persists until next run                    |

---

## Acceptance check

After implementing, the canvas should:

1. Boot cleanly via `cd canvas && npm run dev` — no console errors
2. Render a Webhook node as a 72×72 amber-bordered square with a Lightning icon and a 2-line JetBrains Mono "Webhook" label
3. Drag an IF Condition onto the canvas — it renders 100×88, slate-bordered, with two handle dots on the right (top green with "true" label, bottom red with "false" label), label "IF Condition" inside the card
4. Drag a Merge — 100×96, three labeled input handles on the left ("input 1/2/3"), one output on the right
5. Drag an AI Agent — 100×72 with five labeled tool handles ("1", "2", "3", "4", "5") below the card
6. Open the toolbar — "otto" reads in Fraunces 500/144, workflow name reads in Fraunces 400 italic
7. Open the canvas with no nodes — empty-state heading reads in Fraunces 36px
8. Open the sidebar — category headers are JetBrains Mono SMALL CAPS, row labels are Inter
9. No `system-ui` or `sans-serif` anywhere in the DOM (devtools spot-check on a few elements)

---

## Reference files in this bundle

| File                  | What it is                                                       |
|-----------------------|------------------------------------------------------------------|
| `Node Cards v2.html`  | Open in any browser. **P1** is the second artboard down, second from left. |
| `node-cards-v2.jsx`   | The React source for all 5 artboards. P1 logic lives in the `'pure-square'` branch of `CardBody`. |
| `design-canvas.jsx`   | The pan/zoom canvas wrapper. Not relevant to implementation — for viewing only. |
| `fonts/`              | Geist + Geist Mono (already in the canvas repo). Included so the mockup HTML renders correctly offline. |
| `PROMPT.md`           | The prompt to paste into Claude Code to kick off implementation. |

---

## What's NOT changing

- React Flow integration (`Canvas.tsx` plumbing)
- Zustand store, store actions, selectors
- Execution engine (`src/engine/*`)
- Routes (`src/routes/*`)
- Queue / worker
- Database schema, migrations
- The 17 node types (count, names, behavior — only their visual presentation changes)
- API contract — no new endpoints

---
