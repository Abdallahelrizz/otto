# Usage → Spend Page Redesign

- **Date:** 2026-05-29
- **Status:** Approved design — pending spec review
- **Area:** `canvas/` (frontend) + `src/routes`, `migrations/` (backend)
- **Replaces:** the current observability-style Usage page (`canvas/src/pages/ObservabilityPage.tsx`)

## Problem

The page at `/app/observability` (nav label "Usage") currently shows observability
metrics — runs, success rate, average duration, a token chart, and a **mock** "live log"
stream. It reads as generic and AI-generated, largely because it ships fabricated data
(`MOCK_BARS`, `MOCK_LOGS`). The user wants a calm, premium **cost/spend** view in the
spirit of Railway's Usage page — but rendered in Otto's own visual language, not Railway's.

## Decisions (locked)

1. **Direction:** cost/spend billing-style page. It estimates LLM dollar spend from token
   usage, shows spend over time, and breaks spend down by workflow.
2. **Pricing source:** user-configurable per-model prices, stored server-side. No prices
   are invented — dollars appear only for models the user has priced.
3. **Time period:** month stepper (`‹ May 2026 ›`), calendar-month windows. Bounded by the
   30-day execution retention; older months render an empty "pruned" state.
4. **Spend limits:** an advisory monthly budget the user sets — progress bar + an in-app
   notification when month-to-date spend crosses 100%.
5. **Implementation:** Approach A — dedicated `model_prices` table, a `monthly_budget_usd`
   column on `workspaces`, and a focused `src/routes/usage.js` that computes spend in SQL+JS.
6. **Pricing UI:** a modal launched from the Usage page (not buried in Settings).
7. **Scope:** everything below ships in v1, including the month-end projection tile and the
   budget alert.

Otto never bills for model calls (users bring their own keys). All dollar figures here are
**estimates of what the user pays their own providers**, derived from token counts × the
prices they configure.

## Goals / Non-goals

**Goals**
- A spend summary, a spend-over-time chart, and a per-workflow spend breakdown — all from
  real execution data and user-set prices.
- Visual quality on par with the rest of Otto's dashboard; zero mock/fake data.
- Works in both dark and light themes using existing `--dash-*` tokens.

**Non-goals (future)**
- Auto-fetching live prices (e.g. from OpenRouter's `/models` pricing) — manual for now.
- Server-side/scheduled budget alerts — the alert is computed client-side on page load.
- CSV export, per-day budgets, a standalone "spend by model" chart.

## Layout

Month-stepper in the hero; a prominent summary card; an Otto-flavored "plan" banner; a
spend-over-time chart; and an expandable "Spend by workflow" list.

```
Usage                                    ‹   May 2026   ›        ← calendar-month stepper
                                                                  (next disabled at current month)

┌─ Spend summary ─────────────────────────────────────────────────┐
│  May 2026                                                         │
│  Estimated spend   $12.40        ┌ Spend ──────┐ ┌ Est. month-end ┐
│  Tokens used       428,000       │  $ 12.40    │ │   $ 23.65      │ │  two big mono tiles
│  Models priced     4 of 6        └─────────────┘ └────────────────┘ │
│                                                                    │
│  Monthly budget                                  $12.40 / $50.00  │
│  ███████░░░░░░░░░░░░░░░░░░░  25%               [ Set budget ]     │  budget bar
└────────────────────────────────────────────────────────────────────┘

┌─ Self-hosted · bring-your-own keys ──────────────────────────────┐
│  Otto never bills for model calls. These are estimates from your │  "plan" banner equiv.
│  token usage and the prices you set.             [ Edit pricing ]│
└────────────────────────────────────────────────────────────────────┘

┌─ Spend over time ───────────────────────────────────────────────┐
│   ▁ ▃ ▅ ▂ ▆ █ ▄ ▇ ▅ ▃ ▆ █  (daily $)                            │  reuse bar-chart styling
└────────────────────────────────────────────────────────────────────┘

Spend by workflow
┌────────────────────────────────────────────────────────────────────┐
│  Cortex Brain              412 runs    210k tok    $6.10        ▾   │  expand → per-model
│     gpt-4o          180k tok   $5.40                                │
│     gpt-4o-mini      30k tok   $0.70                                │
├────────────────────────────────────────────────────────────────────┤
│  Lead enrichment           305 runs     98k tok    $2.80        ▾   │
│  Daily digest              190 runs     54k tok    $1.40        ▾   │
└────────────────────────────────────────────────────────────────────┘
```

Mapping to the Railway reference: two big tiles ≈ *Current Usage / Estimated Bill*; budget
bar ≈ *Agent Usage Limit*; banner ≈ the *Hobby Plan* strip; *Spend by workflow* ≈ *Usage by
Project* (expandable to per-model rows).

The **second tile adapts to the period**: for the current month it shows **Est. month-end**
(projection); for a completed past month it shows **Total** (the actual figure, no
projection).

## Honesty / empty states

These states are the core of *not* looking AI-generated — the page never shows numbers it
cannot justify.

- **Remove all mock data.** `MOCK_BARS` and `MOCK_LOGS` are deleted with the old page.
- **No prices set:** dollar tiles show `$ —` (never invented numbers) with a primary CTA
  *"Set model prices to see spend"* that opens the pricing modal. Token figures still show.
- **Some models unpriced:** header reads "Models priced 4 of 6"; a quiet line notes
  *"2 models have no price — spend is underestimated"* with an *Edit pricing* link.
- **No executions in range:** *"No usage recorded for this period."*
- **Beyond retention:** *"Executions before {cutoff date} were pruned (30-day retention).
  Raise EXECUTION_RETENTION_DAYS to keep more history."*

## Backend (Approach A)

### Migration `migrations/021_usage_pricing.sql`

- `model_prices` table:
  - `workspace_id` (FK to workspaces), `model TEXT`,
    `prompt_usd_per_1m NUMERIC(12,4)`, `completion_usd_per_1m NUMERIC(12,4)`,
    `updated_at TIMESTAMPTZ DEFAULT NOW()`.
  - Primary key `(workspace_id, model)`.
- `ALTER TABLE workspaces ADD COLUMN monthly_budget_usd NUMERIC(12,2)` (nullable; null = no
  budget set).

Also reflect both in `schema.sql` (the combined schema used by docker-compose first boot).

### Route `src/routes/usage.js`

Registered alongside the other resource routes in `src/server.js`.

- `GET /api/v1/usage/prices` → `{ prices: [{ model, prompt_usd_per_1m, completion_usd_per_1m }] }`
- `PUT /api/v1/usage/prices` → upsert the full set the modal submits; rows omitted from the
  payload are deleted. Session-auth only.
- `GET /api/v1/usage/budget` → `{ monthlyUsd: number | null }`
- `PUT /api/v1/usage/budget` → `{ monthlyUsd: number | null }`. Session-auth only.
- `GET /api/v1/usage/summary?from=<ISO date>&to=<ISO date>` → see response shape below.
  Readable under the existing `observability:read` scope (so API keys can read it too).

Pricing and budget **writes are session-only**, mirroring how API-key management is
session-gated in `src/routes/api-keys.js`.

### Spend computation

Aggregate in SQL, multiply by prices in JS (prices are user data; keeps SQL price-agnostic).

```sql
-- tokens per (workflow, model) in range
SELECT e.workflow_id, w.name AS workflow_name, ne.model,
       SUM(ne.prompt_tokens)     AS prompt_tokens,
       SUM(ne.completion_tokens) AS completion_tokens
FROM node_executions ne
JOIN executions e ON e.id = ne.execution_id
LEFT JOIN workflows w ON w.id = e.workflow_id
WHERE e.workspace_id = $1
  AND COALESCE(e.started_at, e.completed_at) >= $2
  AND COALESCE(e.started_at, e.completed_at) <  $3
  AND ne.model IS NOT NULL
GROUP BY e.workflow_id, w.name, ne.model;

-- runs per workflow in range (distinct executions, model-independent)
SELECT e.workflow_id, COUNT(*)::INT AS runs
FROM executions e
WHERE e.workspace_id = $1
  AND COALESCE(e.started_at, e.completed_at) >= $2
  AND COALESCE(e.started_at, e.completed_at) <  $3
GROUP BY e.workflow_id;

-- daily tokens per model in range (for the spend-over-time chart)
SELECT DATE_TRUNC('day', COALESCE(e.started_at, e.completed_at))::DATE AS day, ne.model,
       SUM(ne.prompt_tokens) AS prompt_tokens,
       SUM(ne.completion_tokens) AS completion_tokens
FROM node_executions ne
JOIN executions e ON e.id = ne.execution_id
WHERE e.workspace_id = $1
  AND COALESCE(e.started_at, e.completed_at) >= $2
  AND COALESCE(e.started_at, e.completed_at) <  $3
  AND ne.model IS NOT NULL
GROUP BY day, ne.model
ORDER BY day ASC;
```

Cost per (prompt, completion, model):

```
price = prices[model]                       // null if unpriced
spendUsd = price
  ? prompt/1e6 * price.prompt_usd_per_1m + completion/1e6 * price.completion_usd_per_1m
  : 0                                        // and record model in unpricedModels
```

- **Period:** `from`/`to` default to the current calendar month `[first day 00:00, next
  month first day 00:00)`. The stepper passes explicit bounds for other months. The budget
  aligns to the calendar month.
- **Month-end projection** (current month only):
  `projected = monthToDateSpend / max(daysElapsed, 1) * daysInMonth`.
- **Budget %:** `monthToDateSpend / monthlyUsd` (clamped to [0, ∞), bar capped at 100%).
- **Retention flag:** `beyondRetention = to <= (now - EXECUTION_RETENTION_DAYS)`.

### `GET /usage/summary` response shape

```ts
{
  period: { from: string; to: string; label: string; isCurrentMonth: boolean };
  retention: { cutoff: string; beyondRetention: boolean };
  totals: {
    promptTokens: number; completionTokens: number; totalTokens: number;
    spendUsd: number; runs: number;
  };
  projection: { monthEndUsd: number } | null;     // null unless current month
  budget: { monthlyUsd: number | null; monthToDateUsd: number; pct: number };
  byWorkflow: Array<{
    workflowId: string | null; name: string | null; runs: number;
    promptTokens: number; completionTokens: number; totalTokens: number;
    spendUsd: number;
    byModel: Array<{ model: string; totalTokens: number; spendUsd: number; priced: boolean }>;
  }>;
  daily: Array<{ day: string; spendUsd: number; totalTokens: number }>;
  unpricedModels: string[];
  pricedModelCount: number;
  totalModelCount: number;
}
```

## Frontend

- **Rename** `canvas/src/pages/ObservabilityPage.tsx` → `UsagePage.tsx`; update its import in
  the router. Keep the route path `/app/observability` and the nav label "Usage" to avoid
  breaking existing links. (Path rename is optional and out of scope.)
- **New `canvas/src/components/PricingModal.tsx`:** rows of `model · $/1M in · $/1M out`,
  `+ Add model`, Save/Cancel. Pre-populated with the model names Otto actually observed
  (from `unpricedModels` + priced models) so the user isn't typing names from memory. Empty
  fields = unpriced.
- **Budget editor:** a small inline control on the budget card (single monthly-dollars
  input, Save). No separate modal.
- **`canvas/src/api.ts`:** add `getUsageSummary({ from, to })`, `getModelPrices()`,
  `saveModelPrices(prices)`, `getBudget()`, `setBudget(monthlyUsd)` using the existing
  `req<T>()` wrapper.
- **`canvas/src/types.ts`:** add `UsageSummary`, `ModelPrice`, and supporting interfaces.
- **CSS (`canvas/src/index.css`):** new classes for the summary card, big mono tiles, budget
  bar, plan banner, by-workflow rows, and pricing modal — all using `--dash-*` tokens.
  Reuse `otto-resource-panel`, `otto-progress-track` / `otto-progress-fill`, and the bar-chart
  styles where they fit. Numbers render in **Geist Mono**. Keep Otto's rose/red accent — no
  violet, no Railway colors.

## Budget alert

On `UsagePage` load, after the summary resolves: if `budget.monthlyUsd != null` and
`budget.monthToDateUsd >= budget.monthlyUsd`, push one notification:

```ts
addNotifications([{
  id: `budget-exceeded-${YYYY-MM}`,   // stable per month → shows once, no spam
  urgent: true,
  title: `Monthly model-spend budget reached ($${budget.monthlyUsd})`,
  timestamp: new Date().toISOString(),
}]);
```

The stable monthly `id` means the existing dedup in `addNotifications` suppresses repeats.

## Acceptance criteria

- Spend figures are computed from real execution data × user-set prices; **no mock data**
  exists anywhere in the page.
- Dollar tiles show `$ —` (not zero or invented values) when no prices are set, with a CTA
  to the pricing modal.
- Unpriced-but-used models are surfaced ("priced N of M" + inline note).
- Month stepper steps by calendar month; "next" is disabled at the current month; months
  beyond retention show the pruned empty state.
- The second tile shows **Est. month-end** (projection) for the current month and **Total**
  for past months.
- Pricing modal saves and persists across reload; budget editor saves and persists.
- Budget bar reflects month-to-date vs budget; the alert fires once per month at ≥100%.
- Page is correct in both dark and light themes.

## Out of scope / future

- Live price auto-fetch (OpenRouter `/models`), CSV export, per-day budgets, standalone
  spend-by-model chart, server-side scheduled budget alerts.
```
