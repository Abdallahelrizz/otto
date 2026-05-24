# Prompt for Claude Code

Copy everything below the `---` and paste it into Claude Code as your first message in the `otto/` repo on the `frontend-testing` branch.

---

I'm rebranding the canvas (Phase 1 of a multi-phase v5 design refresh). The full spec is in `otto_handoff/README.md` at the repo root. **Phase 1 only.** Phase 2 features (BigAgentNode with inline tools, otto bot panel, Live execution panel, breadcrumbs topbar) are out of scope — do not implement them.

The mockup is at `otto_handoff/Otto Canvas v2.html` — open it in a browser to see the target look. Two artboards: dark + amber, and light + amber. Ignore the docked bottom panels and the BigAgentNode — those are Phase 2 only.

**Before any code changes:**

1. Read `otto_handoff/README.md` end to end.
2. Read these files in `canvas/src/`:
   - `components/nodes/OttoNode.tsx`
   - `components/nodes/nodeConfig.ts`
   - `components/NodeIcon.tsx`
   - `components/Toolbar.tsx`
   - `components/Sidebar.tsx`
   - `components/Canvas.tsx`
   - `index.css`
   - `store.ts`
   - `App.tsx`
3. Post a file-by-file plan as a numbered list. **Wait for my OK** before writing any code.

**Implementation order (one commit per step):**

1. **Drop Fraunces from font loading.** Update `canvas/index.html` Google Fonts URL — keep Inter and JetBrains Mono, drop Fraunces. Remove `.font-fraunces` utility from `index.css` if present.
2. **Swap Fraunces → Inter in Toolbar.tsx.** Wordmark: Inter 16px 700 / -0.022em letter-spacing. Workflow name (both display button and input): Inter 13px 500 / -0.008em / no italic.
3. **Swap Fraunces → Inter in Canvas.tsx empty state.** "Start with a trigger." → Inter 22px 700 / -0.018em. Keep the subhead "Drop a Webhook..." as Inter 14px 400.
4. **Add the new color/shape system to `nodeConfig.ts`.** Add `OTTO_AMBER`, `OTTO_AMBER_HOVER`, `CATEGORY_SHAPE`, `NodeTint` type, `SERVICE` object, `EDGE_COLOR_DARK` / `EDGE_COLOR_LIGHT`, and the helpers `nodeColor(def, theme)` and `nodeRadius(def)`. Add `tint` (and `serviceColor` for service-tinted nodes) to every `NodeTypeDef` entry per the table in the README. Keep `CATEGORY_COLORS` and `CATEGORY_EDGE_COLOR` exports if anything else imports them, but they're no longer the source of truth — they should be derived from `nodeColor()` or removed if no longer referenced.
5. **Refactor `OttoNode.tsx`.** Add the icon container around the Lucide/Phosphor icon — width/height 32, `border-radius: nodeRadius(def)`, background `hexA(nodeColor(def, theme), 0.14)`, border `1px solid hexA(nodeColor(def, theme), 0.28)`. Shrink the inner icon from 28→18. Switch the card border to neutral hairline (theme-aware), with the selection ring using `nodeColor()`. Pull `theme` from the store.
6. **Update `Sidebar.tsx` row icons** to use `nodeColor(def, theme)` and `nodeRadius(def)` for the icon container — match the canvas. Pull `theme` from the store. Also update the category color dot in each section header — but since color no longer comes from category, just use a neutral gray dot or drop it.
7. **Update `store.ts` `onConnect`** — replace `CATEGORY_EDGE_COLOR[def.category]` with a neutral gray. Theme-aware: use `EDGE_COLOR_DARK` when `get().theme === 'dark'`, `EDGE_COLOR_LIGHT` otherwise.
8. **Update `Canvas.tsx` MiniMap nodeColor** — replace `getNodeDef(n.data.nodeType).color + '90'` with `nodeColor(getNodeDef(n.data?.nodeType ?? ''), theme) + '90'`. Pull `theme` from the store.

**After each step:** run `cd canvas && npm run dev` to confirm it still boots. Show me a one-line summary of what changed.

**At the end:** walk through the acceptance check at the bottom of the README and report each item as ✅ or ❌. For any ❌, fix before stopping.

**Constraints:**

- Stay within the existing stack: React + Vite + React Flow + Zustand + Tailwind + Lucide + Phosphor.
- Don't touch `src/engine`, `src/routes`, queue, DB, or `NodeTypeDef.fields` arrays.
- No new dependencies.
- Both themes must work — verify by toggling.
- Don't implement Phase 2. If you find yourself wanting to add a `BigAgentNode`, a bottom panel, or breadcrumbs, **stop and ask.**
- Commit per step with a clear message.
