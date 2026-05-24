# Prompt for Claude Code

Copy everything below the `---` line and paste it as your first message to Claude Code in the `otto/` repository.

---

I'm shipping a redesign of the canvas node cards (P1 Pure Square direction) and rolling out a new four-font typographic system across the canvas chrome. The full spec is in `design_handoff_node_cards_p1/README.md` at the repo root.

**Before you write any code:**

1. Read `design_handoff_node_cards_p1/README.md` end to end.
2. Open `design_handoff_node_cards_p1/Node Cards v2.html` in a browser (or read the corresponding `node-cards-v2.jsx`). The target is the **P1 Pure Square** artboard plus the **T0 Typography** demo.
3. Read the current implementation:
   - `canvas/src/components/nodes/OttoNode.tsx`
   - `canvas/src/components/nodes/nodeConfig.ts`
   - `canvas/src/components/NodeIcon.tsx`
   - `canvas/src/index.css`
   - `canvas/src/components/Toolbar.tsx`
   - `canvas/src/components/Sidebar.tsx`
   - `canvas/src/components/Canvas.tsx`
   - `canvas/src/components/ConfigPanel.tsx`
4. Post a file-by-file plan as a numbered list. Wait for my OK.

**Then implement, in this order:**

1. Fonts — add Inter, JetBrains Mono, Fraunces (local woff2 in `canvas/public/fonts/` matching the existing Geist pattern, OR Google Fonts link in `canvas/index.html` — pick one and tell me which).
2. `index.css` — `@font-face` blocks, swap default `body` font to `'Inter'`, drop the `system-ui`/`sans-serif` fallbacks, drop the `react-flow__handle { opacity: 0 }` rule.
3. `nodeConfig.ts` — extend `HandleDef` with `label`/`color`/`side`; add `complex` and `extras` and `slug` to `NodeTypeDef`; populate every node's `handles` field per the table in the README; drop the unused card-bg/radius constants.
4. `OttoNode.tsx` — full rewrite. Square card. Always-visible labeled handles outside the card. Drop the 3-dot button and bottom timing row. Match the spec's sizes/colors/fonts/states exactly.
5. `NodeIcon.tsx` — set all categories' icon weight to `'bold'`.
6. `Toolbar.tsx` — Fraunces for "otto" and workflow name (per the spec's specific opsz / italic settings).
7. `Sidebar.tsx` — Inter for rows, JetBrains Mono for category headers.
8. `Canvas.tsx` — empty-state heading in Fraunces 36px.
9. `ConfigPanel.tsx` — labels in Inter, code/JSON in Geist Mono, section headers in JetBrains Mono.

**After each file:** run `npm run dev` in `canvas/` to confirm it still boots. Show me a short summary of what changed.

**At the end:** walk through the acceptance check at the bottom of the README and report each item ✅ or ❌. For any ❌, fix before stopping.

**Constraints:**

- Stay within the existing stack: React + Vite + React Flow + Zustand + Tailwind + Phosphor.
- Don't touch `src/engine/*`, `src/routes/*`, `src/queue/*`, `src/db/*`, `migrations/`, `schema.sql`, or `package.json`'s scripts.
- Match every number in the spec exactly. If a value isn't in the spec, ask me before guessing.
- **No `system-ui` or `sans-serif` fallbacks anywhere.** Specify the family directly.
- Commit per logical step with a clear message. Don't lump it all into one commit.
