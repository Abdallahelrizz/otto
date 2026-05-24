# Prompt for Claude Code — Phase 2

Copy everything below the `---` and paste it into Claude Code in the `otto/` repo on the `frontend-testing` branch. **Phase 1 (the amber rebrand + Fraunces removal) is already landed.**

---

This is Phase 2 of the canvas v5 redesign. The complete spec is in `otto_handoff_phase2/README.md` at the repo root. The visual target is `otto_handoff_phase2/Otto Canvas v2.html` — open it in a browser; the look on screen is what we're shipping.

**Before any code:**

1. Read `otto_handoff_phase2/README.md` end to end. It's long. Read it anyway.
2. Read these files in `canvas/src/`:
   - `App.tsx`
   - `store.ts`
   - `components/Toolbar.tsx`
   - `components/Canvas.tsx`
   - `components/Sidebar.tsx`
   - `components/ConfigPanel.tsx`
   - `components/nodes/OttoNode.tsx`
   - `components/nodes/nodeConfig.ts`
   - `components/NodeIcon.tsx`
   - `index.css`
3. Post a file-by-file plan as a numbered list with rough effort estimate per item. **Wait for my OK before writing code.**

**Implementation order — one commit per step:**

1. **`nodeConfig.ts`: add `subtitle` resolver + agent tool defaults.** Add the `subtitle?: (config) => string` field to `NodeTypeDef`. Populate it for all 17 node types per the table in the README. For `ai_agent`, replace the `tools: '[]'` default config with the structured tools array (4 pre-populated tools).
2. **`OttoNode.tsx`: full rewrite — horizontal card.** 196×58 default, height grows for complex nodes per the formula. Icon container + label + subtitle + tag. Keep all Phase 1 logic (shape×color, state borders, handles, spring animation).
3. **`AgentNode.tsx`: new file.** The big AI Agent component per spec §2. Register it in `Canvas.tsx`'s `nodeTypes` map. Update `Sidebar.tsx` `addToCanvas` and `Canvas.tsx` `onDrop` to set `type: 'agentNode'` when `nodeType === 'ai_agent'`.
4. **`ConfigPanel.tsx`: agent tool editor + header polish.** When the selected node is an agent, render a list of `<input name>` + `<select nodeType>` + trash-icon rows instead of the raw `Tools (JSON array)` textarea. Update the header to match spec §6 (Properties + ID pill + close).
5. **`Toolbar.tsx`: full rewrite — breadcrumb topbar.** Amber brand mark, `otto`, breadcrumbs, version pill, Active toggle, Share, Save, ⋯. Drop the `n·e` counter. Move Settings into ⋯ menu (or remove if unwired). Add `workflowActive` and `workflowVersion` to the store with defaults.
6. **`Canvas.tsx`: dot grid + edge defaults.** Bump grid density to `gap={18} size={1}` and opacity `0.20`. Change `defaultEdgeOptions.type` from `smoothstep` to `default`. Update `store.ts` `onConnect` to match (`type: 'default'`).
7. **`App.tsx` + `BottomPanels.tsx` + `OttoBotPanel.tsx` + `ExecutionPanel.tsx`: bottom panel surface.** Create `canvas/src/components/panels/` directory. Build the three components per spec §5. Wire `ExecutionPanel` to existing `nodeExecutions` / `executionPhase` store state. Add `bottomPanelsOpen` to store (default `true`).
8. **Final pass: theme polish.** Toggle to light, fix any contrast issues. Spot-check Inspector header, tool editor, both panels.

**After each step:** run `cd canvas && npm run dev`, confirm it boots, post a one-line summary of what changed. Show me a screenshot if anything visual is non-obvious.

**At the end:** walk through the 10-point acceptance check at the bottom of the README. Report ✅ or ❌ per item. Fix all ❌ before stopping.

**Constraints:**

- Existing stack only: React + Vite + React Flow + Zustand + Tailwind + Lucide + Phosphor. **No new deps.**
- Don't touch `src/engine`, `src/routes`, queue, DB, migrations, or schema.
- Two fonts: Inter and JetBrains Mono. **No Fraunces** (already removed in Phase 1).
- Amber is `OTTO_AMBER = '#FF6F1A'` — already exported from `nodeConfig.ts` in Phase 1. **Use that constant.** No new amber shades.
- Both light and dark themes must work — verify by toggling.
- If a spec is ambiguous or impossible without a backend change, **stop and ask**.
- Commit per step with a clear message.
