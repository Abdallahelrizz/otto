# Settings IA + Collapsible Nav — Design

- **Date:** 2026-05-29
- **Status:** Approved direction — pending spec review
- **Area:** `canvas/` (frontend), small `src/routes` addition
- **Reference:** Railway's collapsible Settings nav (user-provided). Otto adapts the *pattern*, not the item list.

## Problem

`SettingsPage.tsx` is a single long page rendered on the **old `AppSidebar` shell with Material-design Tailwind tokens** (`bg-surface-container`, `material-symbols`…), while the rest of the app (Workflows, Executions, Credentials, Usage) renders inside **`DashboardShell` with `--dash-*` tokens** — the dark, Railway-style shell. Settings is the visual odd-one-out, and its nav is a single flat entry. We want Settings on the same shell with a **collapsible group of sub-pages**.

## Decisions (locked)

1. **Structure:** separate sub-pages, one route each under `/app/settings/*`.
2. **Shell:** migrate Settings onto `DashboardShell` + `--dash-*` tokens; delete the now-unused `AppSidebar`.
3. **Otto IA** (not Railway's): drop Plans / Billing / Earnings / Referrals (Cloud-only, no self-hosted billing), Domains (Otto isn't a host), SSH Keys (Otto's analog is API Keys).
4. **Phased.** This spec covers **Pass 1 only**.

### Pass 1 (this spec)
Collapsible Settings nav + routing + shell migration + the pages that already exist or have API support: **General, API Keys, About, Variables**.

### Pass 2 (deferred — separate spec)
Net-new admin pages that need new `api.ts` methods + UI: **Members**, **External Secrets**, **Audit Log**. The nav group is built to accept them with a one-line addition each.

## Sidebar — collapsible Settings group (`DashboardShell`)

The flat `navItems` array gains a grouped entry. Top-level order stays: **Workflows · Executions · Credentials · Usage**, then a **Settings** group.

Behavior:
- The "Settings" row is a toggle (label + gear icon + caret). Clicking it expands/collapses the sub-list; it does **not** itself navigate.
- Sub-items render indented below when expanded; clicking one navigates to its route. The active sub-item is highlighted (`is-active`) when `location.pathname === item.path`.
- Expanded state persists to `localStorage` (`otto-settings-nav-open`), and **auto-expands** whenever `location.pathname.startsWith('/app/settings')` so a deep link opens with the group open.
- **Icon-collapsed sidebar** (existing `is-collapsed` mode): the Settings row navigates directly to `/app/settings/general` on click (no inline sub-list when there's no room for labels).
- Pass-1 sub-items: **General, API Keys, Variables, About** (Members / External Secrets / Audit Log are added in Pass 2).

## Routing (`App.tsx`)

```
/app/settings              → <Navigate to="/app/settings/general" replace />
/app/settings/general      → <AppRoute><SettingsGeneral /></AppRoute>
/app/settings/api-keys     → <AppRoute><SettingsApiKeys /></AppRoute>
/app/settings/variables    → <AppRoute><SettingsVariables /></AppRoute>
/app/settings/about        → <AppRoute><SettingsAbout /></AppRoute>
```
The old `/app/settings → <SettingsPage/>` route is replaced. Each page component renders `<DashboardShell>…</DashboardShell>` (same as `UsagePage`).

## Pages (Pass 1)

All use `--dash-*` tokens and existing `otto-page-hero` / `otto-resource-panel` patterns. New files under `canvas/src/pages/settings/`.

### SettingsGeneral
- **Workspace name** — editable, **wired to a real save** (new backend route below); replaces today's no-op `handleSave` stub.
- **Appearance** — theme dark/light via the existing Zustand `theme`/`toggleTheme` (same store `DashboardShell` uses).
- **Account** — email + name, read-only (from `api.authStatus()`).
- **Sign out** — `api.logout()` → redirect `/` (danger-styled).
- *Out of scope this pass:* change-password (no backend route today) — noted, not shown.

### SettingsApiKeys
- The existing `ApiKeysSection` logic (list / create with scope presets + custom scopes + expiry / copy-once reveal / revoke), **restyled from Material/Tailwind to `--dash-*`**. Uses existing `api.listApiKeys/createApiKey/deleteApiKey`. No behavior change — purely a visual port to the dashboard look (panels, inputs, modal, chips → `--dash-` tokens).

### SettingsVariables
- New page over **existing** `api.listVariables/createVariable/updateVariable/deleteVariable`.
- Table/list of variables (name, type, value, description); add via a small inline form/modal; edit value; delete with confirm. Mirrors the Variables backend validation (identifier names; types string/number/boolean/json).

### SettingsAbout
- Static: version, license, engine, queue (same content as today's About), in a `--dash-` panel.

## Backend (Pass 1)

One small addition so workspace rename is real (today's save is a no-op):
- **`PUT /api/v1/workspace`** in `src/routes/workspace.js` — body `{ name }`; updates `workspaces.name` for `req.auth.workspaceId`; session-auth + owner/admin role (mirror the member-management gate). Returns the updated `{ id, name }`.
- `api.ts`: add `updateWorkspace(name)`.

No new scope needed (session-managed, like member admin). No DB migration (column exists).

## Migration / cleanup

- Delete `canvas/src/components/AppSidebar.tsx` (used only by the old SettingsPage).
- Delete `canvas/src/pages/SettingsPage.tsx` (split into the new pages).
- Confirm no other importers of `AppSidebar` before deletion (grep showed only SettingsPage).

## Acceptance criteria

- Sidebar shows a collapsible **Settings** group; it expands/collapses, persists, auto-expands on `/app/settings/*`, highlights the active sub-item.
- `/app/settings` redirects to General; General, API Keys, Variables, About each load on `DashboardShell` in `--dash-` tokens, visually consistent with Usage/Workflows.
- Workspace rename **actually saves** (round-trips through `PUT /workspace`) and survives reload.
- API Keys page retains all existing behavior (create/scopes/expiry/reveal/revoke) with the new styling.
- Variables page lists/creates/edits/deletes against the existing API.
- No remaining references to `AppSidebar` or the old `SettingsPage`; Material-token classes gone from Settings.
- Dark + light themes both correct.

## Out of scope

- Pass 2 pages (Members, External Secrets, Audit Log) and their `api.ts` methods.
- Change-password, Plans/Billing/Earnings/Referrals/Domains/SSH Keys.
- Promoting Members to a top-level "People" nav item (revisit when multi-user lands).
