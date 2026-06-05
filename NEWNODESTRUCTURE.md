# Otto · Phase 3 — icon-first node tiles

**This SUPERSEDES the horizontal-card design in `otto_handoff_phase2/README.md` §1–2.**
We're replacing the wide info-card node with a compact, icon-first **tile**: a small
rounded square that holds ONLY the service icon, with the node name + subtitle rendered
as a caption *BELOW* the tile. The AI Agent becomes a larger "hero" tile of the same
family, with its tools hanging beneath it as a row of mini icon-tiles.

The working mockup is `Otto App.html` (source in `otto-app-canvas.jsx` → `SmallNode`,
`AgentNode`, `tileSurface`, `PortDot`). Open it to see the target. Lift exact values from
there; this doc is the spec.

> ⚠️ **COLOR RULE — read first.** The mockup hardcodes gradient hexes like `#26242C`
> for its tiles. **Do NOT copy those.** Build every surface from your existing theme
> tokens (`var(--bg-node)`, `var(--border)`, `var(--text-*)`, `nodeColor(def, theme)`,
> `hexA(...)`) so the nodes match the REAL dashboard in both themes. The only hard
> requirement is that the tile fill reads **clearly brighter than `--bg-canvas`** — if
> your current `--bg-node` is nearly the same value as the canvas (the bug we're fixing),
> introduce a dedicated lifted token (e.g. `--bg-node-tile`) one or two steps brighter and
> use it here.

---

## Files to touch

```
src/components/nodes/
  ├── OttoNode.tsx     ← full rewrite: horizontal card → icon tile + caption
  ├── AgentNode.tsx    ← full rewrite: big info-card → hero tile + tool sub-tiles
  └── nodeConfig.ts    ← no change (subtitle resolver from Phase 2 STAYS — it now
                          feeds the caption under the tile instead of inside the card)
src/index.css          ← keep otto-pulse; nothing new required
```

Everything else (React Flow wiring, store, sidebar, inspector, execution engine) is unchanged.

---

## 1. Regular node — `OttoNode.tsx`

Replace the 196×58 horizontal card with this column: **tile on top, caption below.**

```
        ┌──────────┐
   ●────│   ▢ icon │────●        ← TILE: 76×76 rounded square, lifted off canvas
        │   ───    │              ← identity accent bar (node color)
        └──────────┘
       Drop noisy bots            ← name caption (centered)
         ua ≠ "bot"               ← subtitle caption (mono, muted)
```

### Wrapper (the React Flow node root)
- `display:flex; flex-direction:column; align-items:center; gap:9px`
- `width: 76px` (= the tile width; the caption is allowed to overflow this width and stays centered on the tile)
- `opacity: 0.45` when the node is disabled

### Tile
| Property | Value |
|---|---|
| Size | `76 × 76` |
| Border radius | `22px` (soft squircle — deliberately rounder than n8n's ~8px) |
| Background | lifted node token (see COLOR RULE). A subtle top→bottom gradient is nice but optional; a flat lifted fill is fine. |
| Border | `1px solid var(--border-strong)` (use the slightly stronger border token) |
| Box shadow | depth + faint color glow — dark: `0 10px 22px -6px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07)` ; light: `0 8px 18px -6px rgba(15,15,10,0.16), inset 0 1px 0 rgba(255,255,255,0.95)`. **Plus** an identity glow appended: `, 0 14px 30px -14px ${hexA(nodeColor(def,theme), dark ? 0.55 : 0.32)}` |
| Layout | `display:flex; align-items:center; justify-content:center` |

### Icon (centered, the ONLY thing in the tile)
- `<NodeIcon type={data.nodeType} size={28} color={nodeColor(def, theme)} strokeWidth={1.85} />`
- No icon-container box, no tint background — the icon sits directly on the tile.

### Identity accent bar (replaces the old category TAG)
A small colored bar pinned to the bottom-center of the tile — this is how node identity reads now:
- `position:absolute; bottom:9px; left:50%; transform:translateX(-50%)`
- `width:24px; height:3.5px; border-radius:2px`
- `background: nodeColor(def, theme)`; `opacity: dark ? 0.95 : 0.85`

### Badges (only when present)
- Top-left corner (`top:7px; left:8px`, flex row gap 3): `pin` (amber), `sticky-note` (muted), `repeat` (muted), each `size 11`.
- Status pip: keep your Phase 1 status dot, top-right corner of the tile (`top:-4; right:-4`), pulse when running.

### Handles ← important
The visible tile is only the top 76px of a taller DOM node (caption sits below). React Flow
centers handles at 50% of the node height by default — that would put them on the caption.
**Force handles to the tile's vertical center:**
- Left (target) and Right (source) `<Handle>` with `style={{ top: 38 }}` (= TILE/2), overriding the default `top:50%`.
- Render them as **rounded squares** to match the mockup, not circles: `10×10`, `border-radius:3px`, `box-shadow: 0 0 0 2.5px var(--bg-canvas)` (the ring punches them out of the canvas). Color: muted normally (`hexA(--text-muted-ish)`), `OTTO_AMBER` when the node is running/success.

### Caption (below the tile)
Column, `align-items:center; gap:2px; max-width:138px`:
- **Name** — Inter `12.5px / 600`, `letter-spacing:-0.012em`, `line-height:1.25`, `text-align:center`, `text-wrap:balance`, color `var(--text-primary)`. Wraps to 2 lines max.
- **Subtitle** — `def.subtitle?.(data.config) || def.description`, JetBrains Mono `10px / 400`, color `var(--text-muted)`, centered, single-line ellipsis, `max-width:138px`.

### Selected state
- Border → `OTTO_AMBER`, box shadow → `0 0 0 3px ${amberRing}, <depth shadow>` (drop the identity glow when selected so the amber ring reads clean). Optionally bump the tile fill one step brighter.

### Complex nodes (`if`, `merge`, `loop`) with >1 handle per side
Keep the 76px tile — don't grow it into a card. Stack the extra handles vertically along the
tile edge: distribute them within the tile height (e.g. for 2 handles use `top: 26` and
`top: 50`). Keep the handle labels OUTSIDE the tile (JetBrains Mono 11px) as in Phase 1.

---

## 2. AI Agent — `AgentNode.tsx`

Same tile language, scaled up, with tools as sub-tiles. **No more inner info-card / divider /
tool-row list.**

```
        ┌────────────┐
   ●────│   ◯ bot    │────●       ← AGENT_TILE: 100×100 rounded square (radius 28)
        │   ─────    │             ← amber accent bar (width 34)
        └────────────┘
     Lead enrichment agent         ← name (Inter 13/700)
        gpt-4o · 4 tools           ← subtitle (mono 10, muted)
              │                     ← 1.5×14 connector line (var(--border-strong))
          TOOLS · 04                ← mono 9/700, letter-spacing .16em, muted
     ▣      ▣      ▣      ▣        ← mini tool tiles (40×40, radius 13)
   CRM   Customer  Past   Calc...   ← tool name caption (Inter 9.5/500, text-secondary)
```

### Hero tile
- `100 × 100`, `border-radius:28px`, same `tileSurface` recipe but always tinted with `OTTO_AMBER` (it's an AI node).
- Icon: `bot` (or `sparkles`), `size 40`, color amber, `strokeWidth 1.7`, centered.
- Accent bar: `width 34, height 4`, amber.
- Handles: 1 in / 1 out, forced to `top: 50` (= AGENT_TILE/2), same rounded-square style. **Drop the old 3 phantom output handles** — the three downstream nodes all connect from the single right handle.

### Caption
- Name Inter `13px / 700 / -0.014em`, subtitle JetBrains Mono `10px`, both centered, `max-width:138px`.

### Tools block (below caption, only if `tools.length > 0`)
Column, centered:
- Connector tick: `width:1.5px; height:14px; background:var(--border-strong)`.
- Label: `TOOLS · {String(tools.length).padStart(2,'0')}` — JetBrains Mono `9px / 700`, `letter-spacing:0.16em`, `var(--text-muted)`, margin `7px 0 9px`.
- Row: `display:flex; gap:14px; align-items:flex-start`. For each tool (`data.config.tools` — the structured `{id,name,nodeType}[]` from Phase 2):
  - Mini tile column (`width:54px; align-items:center; gap:5px`):
    - Mini tile `40×40`, `border-radius:13px`, **same `tileSurface` but WITHOUT the identity glow** (`glow:false`), tinted with `nodeColor(getNodeDef(tool.nodeType), theme)`. Icon `size 17` in that color; accent bar `13×2.5`.
    - Tool name caption: Inter `9.5px / 500`, `var(--text-secondary)`, centered, `line-height:1.2`, can wrap 2 lines.

The agent tools editor in `ConfigPanel.tsx` from Phase 2 stays exactly as-is.

---

## 3. Shared helper

Factor the surface into one function so regular tiles, the agent tile, and mini tool tiles
stay identical:

```ts
function tileSurface(theme, color, selected, { glow = true } = {}) {
  // returns { background, border, boxShadow } built from THEME TOKENS (see COLOR RULE).
  // selected → amber border + amber ring, no glow.
  // glow=false → mini tool tiles (omit the color-tinted shadow).
}
```

---

## 4. Layout / positions

Tiles are much smaller than the old cards, so default auto-layout spacing will look sparse.
- Bump horizontal gap between auto-placed nodes to ~**220–260px** and vertical gap to ~**130px**
  (large gaps + small tiles is the correct n8n-like rhythm — edges need room to breathe).
- The agent's tool row is wider than its tile; make sure auto-layout leaves clearance below
  the agent and doesn't place a node directly beneath it.

---

## Acceptance check

1. Boots clean (`npm run dev`), no console errors.
2. Drag a Webhook → a **76px rounded-square tile** with just the webhook icon + amber accent
   bar; "Webhook" and "POST /webhook/…" appear as centered captions **below** the tile.
3. Drag a Postgres Query → identical tile, Postgres-blue icon + blue accent bar, blue identity glow.
4. Every tile reads **clearly lifted above the canvas** (brighter fill + shadow) in BOTH themes —
   the old "node ≈ canvas color" problem is gone.
5. Edges connect to the rounded-square handles at the **vertical center of the tile** (not the caption).
6. Drag an AI Agent → a **100px hero tile**, amber bot icon, name/subtitle caption, then a
   `TOOLS · 04` label and a row of 4 mini icon-tiles (CRM / Customer DB / Past conversations /
   Calculator) each with its own colored icon + tiny name.
7. Select a node → amber border + amber ring, no color glow.
8. No hardcoded mockup hexes in the diff — all surfaces resolve from theme tokens / `nodeColor`.

---

## What's NOT changing

React Flow integration & handle wiring (only handle `top` offset + shape change), Zustand store,
sidebar drag/drop, `nodeConfig.ts` subtitle resolver, the agent tool editor, execution engine,
topbar, bottom panels, inspector.
