# Usage → Spend Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Otto's observability-style "Usage" page with a calm, Railway-inspired cost/spend page — estimated LLM dollar spend (from token usage × user-set per-model prices), a spend-over-time chart, an expandable per-workflow breakdown, an advisory monthly budget with an in-app alert, and a model-pricing modal — rendered in Otto's existing design tokens with zero mock data.

**Architecture:** Approach A (dedicated backend). A new `model_prices` table + a `monthly_budget_usd` column on `workspaces` store user config. A focused `src/routes/usage.js` aggregates per-(workflow, model) tokens in SQL and multiplies by prices in pure JS helpers (`src/engine/pricing.js`, unit-tested with `node:test`). The frontend gets a rewritten `UsagePage.tsx`, a `PricingModal.tsx`, new `api.ts` calls, new types, and new CSS. The existing `/observability/*` route and its canvas Sidebar consumer are left untouched.

**Tech Stack:** Node 20 + Fastify + pg (backend), `node:test` (zero-dep unit tests), React 18 + TypeScript + Vite + Zustand + Phosphor icons (frontend).

**Spec:** `docs/superpowers/specs/2026-05-29-usage-spend-page-design.md`

---

## File Structure

**Backend**
- Create `migrations/021_usage_pricing.sql` — `model_prices` table + `workspaces.monthly_budget_usd`.
- Modify `schema.sql` — append the same idempotent DDL (combined schema for fresh docker boot).
- Create `src/engine/pricing.js` — pure cost-computation helpers (no DB).
- Create `test/pricing.test.js` — `node:test` unit tests for the helpers.
- Create `src/routes/usage.js` — `/usage/prices`, `/usage/budget`, `/usage/summary`.
- Modify `src/server.js` — import + register `usageRoutes`.
- Modify `src/auth/scopes.js` — map `usage` GETs to `observability:read`.
- Modify `package.json` — add a `test` script.

**Frontend**
- Modify `canvas/src/types.ts` — add `ModelPrice`, `UsageByModel`, `UsageByWorkflow`, `UsageSummary`.
- Modify `canvas/src/api.ts` — add `getUsageSummary`, `getModelPrices`, `saveModelPrices`, `getBudget`, `setBudget`.
- Modify `canvas/src/store.ts` — widen `OttoNotification.type` to `'error' | 'budget'`; make `executionId` optional.
- Create `canvas/src/components/PricingModal.tsx` — model-price editor.
- Create `canvas/src/pages/UsagePage.tsx` — the new page.
- Modify `canvas/src/App.tsx` — import `UsagePage` instead of `ObservabilityPage`.
- Delete `canvas/src/pages/ObservabilityPage.tsx` — removes all mock data.
- Modify `canvas/src/index.css` — append spend-page + modal styles.

**Note on TDD:** the repo has no test runner. Node 20's built-in `node:test` covers the only logic worth unit-testing (the pure cost math). The route, React components, and CSS are verified by `tsc`/`vite build` (type + compile gate) plus explicit manual state checks — appropriate for DB-bound glue and visual UI.

---

### Task 1: Database — model_prices table + budget column

**Files:**
- Create: `migrations/021_usage_pricing.sql`
- Modify: `schema.sql` (append at end)

- [ ] **Step 1: Write the migration**

Create `migrations/021_usage_pricing.sql`:

```sql
-- Usage / spend: per-model pricing + advisory monthly budget

CREATE TABLE IF NOT EXISTS model_prices (
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  model                 TEXT NOT NULL,
  prompt_usd_per_1m     NUMERIC(12,4) NOT NULL DEFAULT 0,
  completion_usd_per_1m NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, model)
);

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS monthly_budget_usd NUMERIC(12,2);
```

- [ ] **Step 2: Mirror the DDL in `schema.sql`**

Append the identical block to the end of `schema.sql` (the `CREATE TABLE IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` make it safe regardless of ordering, since `workspaces` is created earlier in the file):

```sql
-- Usage / spend pricing (migration 021)
CREATE TABLE IF NOT EXISTS model_prices (
  workspace_id          UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  model                 TEXT NOT NULL,
  prompt_usd_per_1m     NUMERIC(12,4) NOT NULL DEFAULT 0,
  completion_usd_per_1m NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, model)
);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS monthly_budget_usd NUMERIC(12,2);
```

- [ ] **Step 3: Apply the migration**

Run: `npm run migrate`
Expected: runner reports `021_usage_pricing.sql` applied (or "already applied" on reruns). Requires `DATABASE_URL` in `.env`.

- [ ] **Step 4: Verify the schema**

Run (psql or any client): `\d model_prices` and `\d workspaces`
Expected: `model_prices` exists with PK `(workspace_id, model)`; `workspaces` now has `monthly_budget_usd numeric(12,2)`.

- [ ] **Step 5: Commit**

```bash
git add migrations/021_usage_pricing.sql schema.sql
git commit -m "feat(usage): add model_prices table and workspace budget column"
```

---

### Task 2: Pure cost-computation helpers (TDD)

**Files:**
- Create: `src/engine/pricing.js`
- Test: `test/pricing.test.js`
- Modify: `package.json`

- [ ] **Step 1: Add the test script to `package.json`**

In the `"scripts"` block, add a `test` entry (Node's runner only matches `*.test.js`, so the existing `test/cortex-brain-demo.js` is ignored):

```json
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "worker": "node src/queue/worker.js",
    "migrate": "node migrations/run.js",
    "test": "node --test"
  },
```

- [ ] **Step 2: Write the failing tests**

Create `test/pricing.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rowSpendUsd, aggregateSpend, dailySpend, projectMonthEnd, budgetPct, monthBounds,
} from '../src/engine/pricing.js';

test('rowSpendUsd returns 0 without a price', () => {
  assert.equal(rowSpendUsd(1_000_000, 1_000_000, null), 0);
});

test('rowSpendUsd applies prompt + completion rates per 1M', () => {
  const price = { prompt_usd_per_1m: 2.5, completion_usd_per_1m: 10 };
  // 1M prompt @2.5 + 0.5M completion @10 = 2.5 + 5 = 7.5
  assert.equal(rowSpendUsd(1_000_000, 500_000, price), 7.5);
});

test('aggregateSpend groups by workflow, sums tokens + spend, flags unpriced', () => {
  const tokenRows = [
    { workflow_id: 'w1', workflow_name: 'Cortex', model: 'gpt-4o', prompt_tokens: 1_000_000, completion_tokens: 0 },
    { workflow_id: 'w1', workflow_name: 'Cortex', model: 'mystery', prompt_tokens: 2_000_000, completion_tokens: 0 },
  ];
  const runRows = [{ workflow_id: 'w1', runs: 3 }];
  const prices = { 'gpt-4o': { prompt_usd_per_1m: 2.5, completion_usd_per_1m: 10 } };
  const r = aggregateSpend(tokenRows, runRows, prices);
  assert.equal(r.byWorkflow.length, 1);
  assert.equal(r.byWorkflow[0].runs, 3);
  assert.equal(r.byWorkflow[0].totalTokens, 3_000_000);
  assert.equal(r.byWorkflow[0].spendUsd, 2.5);          // only gpt-4o priced
  assert.deepEqual(r.unpricedModels, ['mystery']);
  assert.equal(r.totalModelCount, 2);
  assert.equal(r.pricedModelCount, 1);
  assert.equal(r.totals.spendUsd, 2.5);
  assert.equal(r.totals.runs, 3);
});

test('dailySpend collapses models into per-day spend', () => {
  const rows = [
    { day: '2026-05-01', model: 'gpt-4o', prompt_tokens: 1_000_000, completion_tokens: 0 },
    { day: '2026-05-01', model: 'gpt-4o', prompt_tokens: 1_000_000, completion_tokens: 0 },
  ];
  const prices = { 'gpt-4o': { prompt_usd_per_1m: 2, completion_usd_per_1m: 0 } };
  const r = dailySpend(rows, prices);
  assert.equal(r.length, 1);
  assert.equal(r[0].day, '2026-05-01');
  assert.equal(r[0].spendUsd, 4);
  assert.equal(r[0].totalTokens, 2_000_000);
});

test('projectMonthEnd scales month-to-date over the month', () => {
  const from = new Date(Date.UTC(2026, 4, 1));        // May 1
  const now = new Date(Date.UTC(2026, 4, 10, 12));    // ~9.5 days in → ceil 10
  const p = projectMonthEnd(10, from, now);           // (10/10)*31 = 31
  assert.ok(Math.abs(p - 31) < 0.001, `got ${p}`);
});

test('budgetPct is monthToDate / monthly, safe on null/zero', () => {
  assert.equal(budgetPct(12.5, 50), 0.25);
  assert.equal(budgetPct(5, null), 0);
  assert.equal(budgetPct(5, 0), 0);
});

test('monthBounds returns [first, next-first) in UTC', () => {
  const { from, to } = monthBounds(2026, 4); // May (0-based month index)
  assert.equal(from.toISOString(), '2026-05-01T00:00:00.000Z');
  assert.equal(to.toISOString(), '2026-06-01T00:00:00.000Z');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/engine/pricing.js'` (the module doesn't exist yet).

- [ ] **Step 4: Implement the helpers**

Create `src/engine/pricing.js`:

```js
// Pure cost-estimation helpers. No DB access — unit-tested in test/pricing.test.js.

const MS_PER_DAY = 86_400_000;

/** USD spend for one (prompt, completion) token pair given a price row (or null). */
export function rowSpendUsd(promptTokens, completionTokens, price) {
  if (!price) return 0;
  const inUsd = (Number(promptTokens) || 0) / 1e6 * (Number(price.prompt_usd_per_1m) || 0);
  const outUsd = (Number(completionTokens) || 0) / 1e6 * (Number(price.completion_usd_per_1m) || 0);
  return inUsd + outUsd;
}

/**
 * Build the per-workflow / per-model breakdown + totals.
 * @param {Array} tokenRows [{ workflow_id, workflow_name, model, prompt_tokens, completion_tokens }]
 * @param {Array} runRows   [{ workflow_id, runs }]
 * @param {Object} priceMap { [model]: { prompt_usd_per_1m, completion_usd_per_1m } }
 */
export function aggregateSpend(tokenRows, runRows, priceMap) {
  const runsByWf = new Map(runRows.map((r) => [r.workflow_id, Number(r.runs) || 0]));
  const wfMap = new Map();
  const unpriced = new Set();
  const modelsSeen = new Set();

  for (const row of tokenRows) {
    const model = row.model;
    modelsSeen.add(model);
    const price = priceMap[model] || null;
    if (!price) unpriced.add(model);

    const prompt = Number(row.prompt_tokens) || 0;
    const completion = Number(row.completion_tokens) || 0;
    const spend = rowSpendUsd(prompt, completion, price);

    let wf = wfMap.get(row.workflow_id);
    if (!wf) {
      wf = {
        workflowId: row.workflow_id,
        name: row.workflow_name ?? null,
        runs: runsByWf.get(row.workflow_id) ?? 0,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        spendUsd: 0, byModel: [],
      };
      wfMap.set(row.workflow_id, wf);
    }
    wf.promptTokens += prompt;
    wf.completionTokens += completion;
    wf.totalTokens += prompt + completion;
    wf.spendUsd += spend;
    wf.byModel.push({ model, totalTokens: prompt + completion, spendUsd: spend, priced: Boolean(price) });
  }

  const byWorkflow = [...wfMap.values()].sort(
    (a, b) => b.spendUsd - a.spendUsd || b.totalTokens - a.totalTokens
  );

  const totals = byWorkflow.reduce((acc, wf) => {
    acc.promptTokens += wf.promptTokens;
    acc.completionTokens += wf.completionTokens;
    acc.totalTokens += wf.totalTokens;
    acc.spendUsd += wf.spendUsd;
    return acc;
  }, { promptTokens: 0, completionTokens: 0, totalTokens: 0, spendUsd: 0, runs: 0 });
  totals.runs = runRows.reduce((s, r) => s + (Number(r.runs) || 0), 0);

  return {
    byWorkflow,
    totals,
    unpricedModels: [...unpriced],
    pricedModelCount: modelsSeen.size - unpriced.size,
    totalModelCount: modelsSeen.size,
  };
}

/** Daily spend series from daily token rows [{ day, model, prompt_tokens, completion_tokens }]. */
export function dailySpend(dailyRows, priceMap) {
  const byDay = new Map();
  for (const row of dailyRows) {
    const day = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10);
    const prompt = Number(row.prompt_tokens) || 0;
    const completion = Number(row.completion_tokens) || 0;
    const spend = rowSpendUsd(prompt, completion, priceMap[row.model] || null);
    const entry = byDay.get(day) || { day, spendUsd: 0, totalTokens: 0 };
    entry.spendUsd += spend;
    entry.totalTokens += prompt + completion;
    byDay.set(day, entry);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Calendar-month [from, to) UTC bounds for a year + 0-based month index. */
export function monthBounds(year, monthIndex) {
  return {
    from: new Date(Date.UTC(year, monthIndex, 1)),
    to: new Date(Date.UTC(year, monthIndex + 1, 1)),
  };
}

/** Linear month-end projection from month-to-date spend. */
export function projectMonthEnd(monthToDateUsd, periodFrom, now) {
  const start = periodFrom instanceof Date ? periodFrom : new Date(periodFrom);
  const daysInMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const daysElapsed = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / MS_PER_DAY));
  const clampedElapsed = Math.min(daysElapsed, daysInMonth);
  return (monthToDateUsd / clampedElapsed) * daysInMonth;
}

/** Budget progress as a fraction (0..1+, not clamped). Safe on null/zero budget. */
export function budgetPct(monthToDateUsd, monthlyUsd) {
  if (!monthlyUsd || monthlyUsd <= 0) return 0;
  return monthToDateUsd / monthlyUsd;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 7 tests green.

- [ ] **Step 6: Commit**

```bash
git add src/engine/pricing.js test/pricing.test.js package.json
git commit -m "feat(usage): add tested pure cost-computation helpers"
```

---

### Task 3: Usage route — prices, budget, summary

**Files:**
- Create: `src/routes/usage.js`
- Modify: `src/server.js` (import near line 33; register near line 205)
- Modify: `src/auth/scopes.js` (add to `SCOPE_MAP` after the Observability entry, ~line 130)

- [ ] **Step 1: Write the route**

Create `src/routes/usage.js`:

```js
import { db } from '../db/client.js';
import { aggregateSpend, dailySpend, projectMonthEnd, budgetPct, monthBounds } from '../engine/pricing.js';

const RETENTION_DAYS = Number(process.env.EXECUTION_RETENTION_DAYS ?? 30);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function requireSessionAuth(req, reply) {
  if (req.auth?.authMethod === 'api_key') {
    reply.code(403).send({ error: 'Use a session to manage usage pricing' });
    return false;
  }
  return true;
}

async function loadPriceMap(workspaceId) {
  const { rows } = await db.query(
    `SELECT model, prompt_usd_per_1m, completion_usd_per_1m FROM model_prices WHERE workspace_id = $1`,
    [workspaceId]
  );
  const map = {};
  for (const r of rows) {
    map[r.model] = {
      prompt_usd_per_1m: Number(r.prompt_usd_per_1m),
      completion_usd_per_1m: Number(r.completion_usd_per_1m),
    };
  }
  return map;
}

export async function usageRoutes(fastify) {
  // ---- Prices ----
  fastify.get('/api/v1/usage/prices', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT model, prompt_usd_per_1m, completion_usd_per_1m, updated_at
       FROM model_prices WHERE workspace_id = $1 ORDER BY model ASC`,
      [req.auth.workspaceId]
    );
    return reply.send({ prices: rows });
  });

  fastify.put('/api/v1/usage/prices', async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;
    const incoming = Array.isArray(req.body?.prices) ? req.body.prices : null;
    if (!incoming) return reply.code(400).send({ error: 'prices must be an array' });

    const clean = [];
    for (const p of incoming) {
      const model = String(p.model ?? '').trim();
      if (!model) continue;
      const inP = Number(p.prompt_usd_per_1m);
      const outP = Number(p.completion_usd_per_1m);
      if (!Number.isFinite(inP) || !Number.isFinite(outP) || inP < 0 || outP < 0) {
        return reply.code(400).send({ error: `Invalid price for model "${model}"` });
      }
      clean.push({ model, inP, outP });
    }

    const ws = req.auth.workspaceId;
    const models = clean.map((c) => c.model);
    // Delete rows the user removed; '{}' guard handles the empty-array case.
    await db.query(
      `DELETE FROM model_prices
       WHERE workspace_id = $1 AND ($2::text[] = '{}' OR model <> ALL($2::text[]))`,
      [ws, models]
    );
    for (const c of clean) {
      await db.query(
        `INSERT INTO model_prices (workspace_id, model, prompt_usd_per_1m, completion_usd_per_1m, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (workspace_id, model) DO UPDATE
           SET prompt_usd_per_1m = EXCLUDED.prompt_usd_per_1m,
               completion_usd_per_1m = EXCLUDED.completion_usd_per_1m,
               updated_at = NOW()`,
        [ws, c.model, c.inP, c.outP]
      );
    }
    return reply.send({ ok: true, count: clean.length });
  });

  // ---- Budget ----
  fastify.get('/api/v1/usage/budget', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT monthly_budget_usd FROM workspaces WHERE id = $1`,
      [req.auth.workspaceId]
    );
    const v = rows[0]?.monthly_budget_usd;
    return reply.send({ monthlyUsd: v == null ? null : Number(v) });
  });

  fastify.put('/api/v1/usage/budget', async (req, reply) => {
    if (!requireSessionAuth(req, reply)) return;
    const raw = req.body?.monthlyUsd;
    let value = null;
    if (raw !== null && raw !== undefined && raw !== '') {
      value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        return reply.code(400).send({ error: 'monthlyUsd must be a non-negative number or null' });
      }
    }
    await db.query(`UPDATE workspaces SET monthly_budget_usd = $1 WHERE id = $2`, [value, req.auth.workspaceId]);
    return reply.send({ monthlyUsd: value });
  });

  // ---- Summary ----
  fastify.get('/api/v1/usage/summary', async (req, reply) => {
    const ws = req.auth.workspaceId;
    const now = new Date();

    let from, to;
    if (req.query.from && req.query.to) {
      from = new Date(`${req.query.from}T00:00:00.000Z`);
      to = new Date(`${req.query.to}T00:00:00.000Z`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        return reply.code(400).send({ error: 'Invalid from/to range' });
      }
    } else {
      ({ from, to } = monthBounds(now.getUTCFullYear(), now.getUTCMonth()));
    }

    const currentBounds = monthBounds(now.getUTCFullYear(), now.getUTCMonth());
    const isCurrentMonth =
      from.getTime() === currentBounds.from.getTime() && to.getTime() === currentBounds.to.getTime();
    const label = `${MONTHS[from.getUTCMonth()]} ${from.getUTCFullYear()}`;
    const retentionCutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
    const beyondRetention = to <= retentionCutoff;

    const params = [ws, from.toISOString(), to.toISOString()];

    const [tokenRes, runRes, dailyRes] = await Promise.all([
      db.query(
        `SELECT e.workflow_id, w.name AS workflow_name, ne.model,
                COALESCE(SUM(ne.prompt_tokens), 0)::BIGINT      AS prompt_tokens,
                COALESCE(SUM(ne.completion_tokens), 0)::BIGINT  AS completion_tokens
         FROM node_executions ne
         JOIN executions e ON e.id = ne.execution_id
         LEFT JOIN workflows w ON w.id = e.workflow_id
         WHERE e.workspace_id = $1
           AND COALESCE(e.started_at, e.completed_at) >= $2
           AND COALESCE(e.started_at, e.completed_at) <  $3
           AND ne.model IS NOT NULL
         GROUP BY e.workflow_id, w.name, ne.model`,
        params
      ),
      db.query(
        `SELECT e.workflow_id, COUNT(*)::INT AS runs
         FROM executions e
         WHERE e.workspace_id = $1
           AND COALESCE(e.started_at, e.completed_at) >= $2
           AND COALESCE(e.started_at, e.completed_at) <  $3
         GROUP BY e.workflow_id`,
        params
      ),
      db.query(
        `SELECT DATE_TRUNC('day', COALESCE(e.started_at, e.completed_at))::DATE AS day, ne.model,
                COALESCE(SUM(ne.prompt_tokens), 0)::BIGINT     AS prompt_tokens,
                COALESCE(SUM(ne.completion_tokens), 0)::BIGINT AS completion_tokens
         FROM node_executions ne
         JOIN executions e ON e.id = ne.execution_id
         WHERE e.workspace_id = $1
           AND COALESCE(e.started_at, e.completed_at) >= $2
           AND COALESCE(e.started_at, e.completed_at) <  $3
           AND ne.model IS NOT NULL
         GROUP BY day, ne.model
         ORDER BY day ASC`,
        params
      ),
    ]);

    const priceMap = await loadPriceMap(ws);

    const agg = aggregateSpend(
      tokenRes.rows.map((r) => ({
        workflow_id: r.workflow_id,
        workflow_name: r.workflow_name,
        model: r.model,
        prompt_tokens: Number(r.prompt_tokens),
        completion_tokens: Number(r.completion_tokens),
      })),
      runRes.rows,
      priceMap
    );

    const daily = dailySpend(dailyRes.rows, priceMap);

    const budRes = await db.query(`SELECT monthly_budget_usd FROM workspaces WHERE id = $1`, [ws]);
    const monthlyUsd = budRes.rows[0]?.monthly_budget_usd == null ? null : Number(budRes.rows[0].monthly_budget_usd);
    const monthToDateUsd = agg.totals.spendUsd;
    const projection = isCurrentMonth ? { monthEndUsd: projectMonthEnd(monthToDateUsd, from, now) } : null;

    return reply.send({
      period: { from: from.toISOString(), to: to.toISOString(), label, isCurrentMonth },
      retention: { cutoff: retentionCutoff.toISOString(), beyondRetention },
      totals: agg.totals,
      projection,
      budget: { monthlyUsd, monthToDateUsd, pct: budgetPct(monthToDateUsd, monthlyUsd) },
      byWorkflow: agg.byWorkflow,
      daily,
      unpricedModels: agg.unpricedModels,
      pricedModelCount: agg.pricedModelCount,
      totalModelCount: agg.totalModelCount,
    });
  });
}
```

- [ ] **Step 2: Register the route in `src/server.js`**

Add the import alongside the others (after the `exportRoutes` import, ~line 33):

```js
import { usageRoutes } from './routes/usage.js';
```

Add the registration after `await fastify.register(exportRoutes);` (~line 205):

```js
await fastify.register(usageRoutes);
```

- [ ] **Step 3: Add scope mapping in `src/auth/scopes.js`**

Immediately after the Observability entry (`[/^\/api\/v1\/observability/, 'GET', 'observability:read'],`, ~line 130), add:

```js
  // Usage / spend — reads share the observability scope; writes are session-only (enforced in-route)
  [/^\/api\/v1\/usage/, 'GET',                        'observability:read'],
```

- [ ] **Step 4: Smoke-test the server boots**

Run: `npm run dev`
Expected: server starts with no errors; log shows it listening on `PORT`. Stop it after confirming (Ctrl+C).

- [ ] **Step 5: Verify the endpoint responds (logged-in session required)**

With the dev server running and a browser session cookie available, hit the summary in the browser console on the app origin:

```js
fetch('/api/v1/usage/summary', { credentials: 'include' }).then(r => r.json()).then(console.log)
```

Expected: a JSON object with `period`, `totals`, `byWorkflow`, `daily`, `budget`, `unpricedModels` keys (arrays may be empty if there's no recent execution data — that is correct, not an error).

- [ ] **Step 6: Commit**

```bash
git add src/routes/usage.js src/server.js src/auth/scopes.js
git commit -m "feat(usage): add /usage prices, budget, and spend summary routes"
```

---

### Task 4: Frontend types + API client + notification type

**Files:**
- Modify: `canvas/src/types.ts` (append interfaces)
- Modify: `canvas/src/api.ts` (import types; add methods inside the `api` object)
- Modify: `canvas/src/store.ts` (`OttoNotification`, ~lines 38-46)

- [ ] **Step 1: Add types to `canvas/src/types.ts`**

Append:

```ts
export interface ModelPrice {
  model: string;
  prompt_usd_per_1m: number;
  completion_usd_per_1m: number;
  updated_at?: string;
}

export interface UsageByModel {
  model: string;
  totalTokens: number;
  spendUsd: number;
  priced: boolean;
}

export interface UsageByWorkflow {
  workflowId: string | null;
  name: string | null;
  runs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  spendUsd: number;
  byModel: UsageByModel[];
}

export interface UsageSummary {
  period: { from: string; to: string; label: string; isCurrentMonth: boolean };
  retention: { cutoff: string; beyondRetention: boolean };
  totals: { promptTokens: number; completionTokens: number; totalTokens: number; spendUsd: number; runs: number };
  projection: { monthEndUsd: number } | null;
  budget: { monthlyUsd: number | null; monthToDateUsd: number; pct: number };
  byWorkflow: UsageByWorkflow[];
  daily: Array<{ day: string; spendUsd: number; totalTokens: number }>;
  unpricedModels: string[];
  pricedModelCount: number;
  totalModelCount: number;
}
```

- [ ] **Step 2: Add API methods to `canvas/src/api.ts`**

Add `UsageSummary` and `ModelPrice` to the type import block at the top (lines 1-18):

```ts
  UsageSummary,
  ModelPrice,
```

Add these methods inside the exported `api` object (next to `getObservabilitySummary`, ~line 260):

```ts
  async getUsageSummary(params: { from?: string; to?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs}` : '';
    return req<UsageSummary>(`/usage/summary${suffix}`);
  },

  async getModelPrices() {
    return req<{ prices: ModelPrice[] }>(`/usage/prices`);
  },

  async saveModelPrices(prices: ModelPrice[]) {
    return req<{ ok: boolean; count: number }>(`/usage/prices`, {
      method: 'PUT',
      body: JSON.stringify({ prices }),
    });
  },

  async getBudget() {
    return req<{ monthlyUsd: number | null }>(`/usage/budget`);
  },

  async setBudget(monthlyUsd: number | null) {
    return req<{ monthlyUsd: number | null }>(`/usage/budget`, {
      method: 'PUT',
      body: JSON.stringify({ monthlyUsd }),
    });
  },
```

- [ ] **Step 3: Widen `OttoNotification` in `canvas/src/store.ts`**

Replace the interface (lines 38-46) with:

```ts
export interface OttoNotification {
  id: string;
  type: 'error' | 'budget';
  title: string;
  workflowName?: string | null;
  executionId?: string;          // optional — budget alerts have no execution
  timestamp: string;
  urgent: boolean; // true = new/unacknowledged; false = dismissed but kept
}
```

(`ExecutionHistory.tsx` still builds `type: 'error'` items with `executionId` — both remain valid.)

- [ ] **Step 4: Type-check**

Run: `npm run build` in `canvas/`
Expected: `tsc` passes (the new types/methods compile; widening the union does not break existing notification producers).

- [ ] **Step 5: Commit**

```bash
git add canvas/src/types.ts canvas/src/api.ts canvas/src/store.ts
git commit -m "feat(usage): add usage types, API client methods, budget notification type"
```

---

### Task 5: PricingModal component

**Files:**
- Create: `canvas/src/components/PricingModal.tsx`

- [ ] **Step 1: Create the modal**

Create `canvas/src/components/PricingModal.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ModelPrice } from '../types';
import { Plus, Trash, X } from '@phosphor-icons/react';

interface Row { model: string; inP: string; outP: string; }

interface PricingModalProps {
  seedModels: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function PricingModal({ seedModels, onClose, onSaved }: PricingModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getModelPrices()
      .then(({ prices }) => {
        if (cancelled) return;
        const merged: Row[] = [];
        const seen = new Set<string>();
        for (const p of prices) {
          merged.push({ model: p.model, inP: String(p.prompt_usd_per_1m), outP: String(p.completion_usd_per_1m) });
          seen.add(p.model);
        }
        for (const m of seedModels) {
          if (m && !seen.has(m)) { merged.push({ model: m, inP: '', outP: '' }); seen.add(m); }
        }
        if (merged.length === 0) merged.push({ model: '', inP: '', outP: '' });
        setRows(merged);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) { setErr('Failed to load prices'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [seedModels]);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const add = () => setRows((rs) => [...rs, { model: '', inP: '', outP: '' }]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const prices: ModelPrice[] = [];
      for (const r of rows) {
        const model = r.model.trim();
        if (!model) continue;
        const inP = Number(r.inP || 0);
        const outP = Number(r.outP || 0);
        if (!Number.isFinite(inP) || !Number.isFinite(outP) || inP < 0 || outP < 0) {
          setErr(`Invalid price for "${model}"`); setSaving(false); return;
        }
        prices.push({ model, prompt_usd_per_1m: inP, completion_usd_per_1m: outP });
      }
      await api.saveModelPrices(prices);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="otto-pricing-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="otto-pricing-modal" role="dialog" aria-label="Model pricing">
        <div className="otto-pricing-head">
          <div>
            <h2>Model pricing</h2>
            <p>USD per 1M tokens. Leave a row blank to mark a model unpriced.</p>
          </div>
          <button type="button" className="otto-icon-button" onClick={onClose} aria-label="Close">
            <X size={14} weight="bold" />
          </button>
        </div>

        {loading ? (
          <div className="otto-spend-empty">Loading…</div>
        ) : (
          <div className="otto-pricing-body">
            <div className="otto-pricing-row otto-pricing-row-head">
              <span>Model</span><span>$ / 1M in</span><span>$ / 1M out</span><span />
            </div>
            {rows.map((r, i) => (
              <div className="otto-pricing-row" key={i}>
                <input placeholder="model name" value={r.model}
                  onChange={(e) => update(i, { model: e.target.value })} />
                <input type="number" min="0" step="0.01" placeholder="0.00" value={r.inP}
                  onChange={(e) => update(i, { inP: e.target.value })} />
                <input type="number" min="0" step="0.01" placeholder="0.00" value={r.outP}
                  onChange={(e) => update(i, { outP: e.target.value })} />
                <button type="button" className="otto-icon-button" onClick={() => remove(i)} aria-label="Remove model">
                  <Trash size={13} weight="duotone" />
                </button>
              </div>
            ))}
            <button type="button" className="otto-btn-quiet otto-pricing-add" onClick={add}>
              <Plus size={13} weight="bold" /> Add model
            </button>
          </div>
        )}

        {err && <div className="otto-spend-warn"><span>{err}</span></div>}

        <div className="otto-pricing-foot">
          <button type="button" className="otto-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="otto-btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save prices'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build` in `canvas/`
Expected: `tsc` passes. (The component is not yet imported anywhere; that happens in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add canvas/src/components/PricingModal.tsx
git commit -m "feat(usage): add model PricingModal component"
```

---

### Task 6: UsagePage + route swap + delete old page

**Files:**
- Create: `canvas/src/pages/UsagePage.tsx`
- Modify: `canvas/src/App.tsx` (line 8 import; line 35 route element)
- Delete: `canvas/src/pages/ObservabilityPage.tsx`

- [ ] **Step 1: Create the page**

Create `canvas/src/pages/UsagePage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../dashboard/DashboardShell';
import { api } from '../api';
import { useStore } from '../store';
import type { UsageSummary } from '../types';
import { PricingModal } from '../components/PricingModal';
import {
  ArrowsClockwise, CaretDown, CaretLeft, CaretRight, Sliders, Warning,
} from '@phosphor-icons/react';

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtUsd(n: number | null | undefined): string {
  if (n == null) return '$ —';
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function UsagePage() {
  const addNotifications = useStore((s) => s.addNotifications);

  const [cursor, setCursor] = useState(() => startOfMonthUTC(new Date()));
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pricingOpen, setPricingOpen] = useState(false);
  const [budgetEditing, setBudgetEditing] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('');

  const nowMonth = startOfMonthUTC(new Date());
  const atCurrentMonth = cursor.getTime() >= nowMonth.getTime();

  const period = useMemo(() => {
    const from = startOfMonthUTC(cursor);
    const to = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    return { from: isoDate(from), to: isoDate(to) };
  }, [cursor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummary(await api.getUsageSummary(period));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  // Budget alert — once per month, current month only.
  useEffect(() => {
    if (!summary || !summary.period.isCurrentMonth) return;
    const { monthlyUsd, monthToDateUsd } = summary.budget;
    if (monthlyUsd != null && monthlyUsd > 0 && monthToDateUsd >= monthlyUsd) {
      addNotifications([{
        id: `budget-exceeded-${summary.period.from.slice(0, 7)}`,
        type: 'budget',
        title: `Monthly model-spend budget reached (${fmtUsd(monthlyUsd)})`,
        timestamp: new Date().toISOString(),
        urgent: true,
      }]);
    }
  }, [summary, addNotifications]);

  const stepMonth = (delta: number) => {
    setCursor((c) => {
      const next = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + delta, 1));
      return next.getTime() > nowMonth.getTime() ? nowMonth : next;
    });
  };

  const toggleRow = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveBudget = async () => {
    const raw = budgetDraft.trim();
    const value = raw === '' ? null : Number(raw);
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    await api.setBudget(value);
    setBudgetEditing(false);
    void load();
  };

  const hasPrices = (summary?.pricedModelCount ?? 0) > 0;
  const secondTileLabel = summary?.period.isCurrentMonth ? 'Est. month-end' : 'Total';
  const secondTileValue = summary
    ? (summary.period.isCurrentMonth ? summary.projection?.monthEndUsd ?? null : summary.totals.spendUsd)
    : null;
  const maxDaily = summary?.daily.reduce((m, d) => Math.max(m, d.spendUsd), 0) ?? 0;

  const seedModels = summary
    ? Array.from(new Set([
        ...summary.unpricedModels,
        ...summary.byWorkflow.flatMap((w) => w.byModel.map((m) => m.model)),
      ]))
    : [];

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">
        <div className="otto-page-hero">
          <div>
            <p className="otto-eyebrow">Otto</p>
            <h1>Usage</h1>
            <p className="otto-hero-copy">
              Estimated model spend by workflow — from your token usage and the prices you set.
            </p>
          </div>
          <div className="otto-hero-actions">
            <div className="otto-month-stepper">
              <button type="button" onClick={() => stepMonth(-1)} aria-label="Previous month">
                <CaretLeft size={14} weight="bold" />
              </button>
              <span>{summary?.period.label ?? '—'}</span>
              <button type="button" onClick={() => stepMonth(1)} disabled={atCurrentMonth} aria-label="Next month">
                <CaretRight size={14} weight="bold" />
              </button>
            </div>
            <button className="otto-icon-button" type="button" onClick={() => void load()} title="Refresh">
              <ArrowsClockwise size={15} weight="bold" />
            </button>
          </div>
        </div>

        {error && <div className="otto-spend-empty">{error}</div>}

        {/* Summary card */}
        <div className="otto-resource-panel otto-spend-summary">
          <div className="otto-spend-summary-grid">
            <dl className="otto-spend-facts">
              <div><dt>Estimated spend</dt><dd>{hasPrices ? fmtUsd(summary?.totals.spendUsd) : '$ —'}</dd></div>
              <div><dt>Tokens used</dt><dd>{summary ? summary.totals.totalTokens.toLocaleString() : '—'}</dd></div>
              <div><dt>Models priced</dt><dd>{summary ? `${summary.pricedModelCount} of ${summary.totalModelCount}` : '—'}</dd></div>
            </dl>
            <div className="otto-spend-tiles">
              <div className="otto-spend-tile">
                <span>Spend</span>
                <strong>{hasPrices ? fmtUsd(summary?.totals.spendUsd) : '$ —'}</strong>
              </div>
              <div className="otto-spend-tile is-muted">
                <span>{secondTileLabel}</span>
                <strong>{hasPrices ? fmtUsd(secondTileValue) : '$ —'}</strong>
              </div>
            </div>
          </div>

          <div className="otto-budget">
            <div className="otto-budget-head">
              <span>Monthly budget</span>
              {budgetEditing ? (
                <div className="otto-budget-edit">
                  <span>$</span>
                  <input autoFocus type="number" min="0" step="1" value={budgetDraft}
                    onChange={(e) => setBudgetDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveBudget();
                      if (e.key === 'Escape') setBudgetEditing(false);
                    }} />
                  <button type="button" className="otto-btn-primary" onClick={() => void saveBudget()}>Save</button>
                  <button type="button" className="otto-btn-ghost" onClick={() => setBudgetEditing(false)}>Cancel</button>
                </div>
              ) : summary?.budget.monthlyUsd != null ? (
                <span className="otto-budget-figure">
                  {fmtUsd(summary.budget.monthToDateUsd)} / {fmtUsd(summary.budget.monthlyUsd)}
                </span>
              ) : (
                <button type="button" className="otto-link"
                  onClick={() => { setBudgetDraft(''); setBudgetEditing(true); }}>Set budget</button>
              )}
            </div>
            {summary?.budget.monthlyUsd != null && !budgetEditing && (
              <>
                <div className="otto-progress-track">
                  <div className={`otto-progress-fill${summary.budget.pct >= 1 ? ' is-red' : ''}`}
                    style={{ width: `${Math.min(summary.budget.pct * 100, 100)}%` }} />
                </div>
                <div className="otto-budget-foot">
                  <span>{Math.round(summary.budget.pct * 100)}%</span>
                  <button type="button" className="otto-link"
                    onClick={() => { setBudgetDraft(String(summary.budget.monthlyUsd ?? '')); setBudgetEditing(true); }}>
                    Edit budget
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Plan banner */}
        <div className="otto-plan-banner">
          <div>
            <strong>Self-hosted · bring-your-own keys</strong>
            <p>Otto never bills for model calls. These are estimates from your token usage and the prices you set.</p>
          </div>
          <button type="button" className="otto-btn-quiet" onClick={() => setPricingOpen(true)}>
            <Sliders size={15} weight="bold" /> Edit pricing
          </button>
        </div>

        {summary && summary.unpricedModels.length > 0 && (
          <div className="otto-spend-warn">
            <Warning size={14} weight="fill" />
            <span>
              {summary.unpricedModels.length} model{summary.unpricedModels.length > 1 ? 's have' : ' has'} no price — spend is underestimated.
            </span>
            <button type="button" className="otto-link" onClick={() => setPricingOpen(true)}>Set prices</button>
          </div>
        )}

        {summary && summary.retention.beyondRetention && (
          <div className="otto-spend-empty">
            Executions before {new Date(summary.retention.cutoff).toLocaleDateString()} were pruned
            (30-day retention). Raise EXECUTION_RETENTION_DAYS to keep more history.
          </div>
        )}

        {summary && summary.daily.length > 0 && (
          <div className="otto-resource-panel" style={{ marginBottom: 14 }}>
            <div className="otto-resource-toolbar"><div><h2>Spend over time</h2><p>{summary.period.label}</p></div></div>
            <div className="otto-chart-bars">
              {summary.daily.map((d, i) => (
                <div key={i} className="otto-chart-bar"
                  style={{ height: `${maxDaily > 0 ? Math.max((d.spendUsd / maxDaily) * 100, 2) : 2}%` }}
                  title={`${d.day}: ${fmtUsd(d.spendUsd)}`} />
              ))}
            </div>
          </div>
        )}

        <div className="otto-resource-panel">
          <div className="otto-resource-toolbar"><div><h2>Spend by workflow</h2></div></div>
          {summary && summary.byWorkflow.length === 0 && !loading && (
            <div className="otto-spend-empty">No usage recorded for this period.</div>
          )}
          <div className="otto-spend-list">
            {summary?.byWorkflow.map((wf) => {
              const id = wf.workflowId ?? 'unknown';
              const open = expanded.has(id);
              return (
                <div key={id} className="otto-spend-row-wrap">
                  <button type="button" className="otto-spend-row" onClick={() => toggleRow(id)}>
                    <span className="otto-spend-row-name">{wf.name ?? 'Untitled workflow'}</span>
                    <span className="otto-spend-row-runs">{wf.runs} runs</span>
                    <span className="otto-spend-row-tok">{fmtTokens(wf.totalTokens)} tok</span>
                    <span className="otto-spend-row-usd">{hasPrices ? fmtUsd(wf.spendUsd) : '—'}</span>
                    <CaretDown size={13} weight="bold" className={`otto-spend-caret${open ? ' is-open' : ''}`} />
                  </button>
                  {open && (
                    <div className="otto-spend-models">
                      {wf.byModel.map((m, i) => (
                        <div key={i} className="otto-spend-model">
                          <span>{m.model}{!m.priced && <em className="otto-spend-unpriced"> · no price</em>}</span>
                          <span>{fmtTokens(m.totalTokens)} tok</span>
                          <span>{m.priced ? fmtUsd(m.spendUsd) : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {pricingOpen && (
        <PricingModal
          seedModels={seedModels}
          onClose={() => setPricingOpen(false)}
          onSaved={() => { setPricingOpen(false); void load(); }}
        />
      )}
    </DashboardShell>
  );
}
```

- [ ] **Step 2: Swap the route in `canvas/src/App.tsx`**

Change the import on line 8 from:

```ts
import { ObservabilityPage } from './pages/ObservabilityPage';
```

to:

```ts
import { UsagePage } from './pages/UsagePage';
```

Change the route element on line 35 from:

```tsx
        <Route path="/app/observability" element={<AppRoute><ObservabilityPage /></AppRoute>} />
```

to:

```tsx
        <Route path="/app/observability" element={<AppRoute><UsagePage /></AppRoute>} />
```

- [ ] **Step 3: Delete the old page**

```bash
git rm canvas/src/pages/ObservabilityPage.tsx
```

(`api.getObservabilitySummary` stays in `api.ts` — it is still used by `canvas/src/components/Sidebar.tsx`. Do not remove it.)

- [ ] **Step 4: Type-check**

Run: `npm run build` in `canvas/`
Expected: `tsc` passes; no remaining references to `ObservabilityPage`.

- [ ] **Step 5: Commit**

```bash
git add canvas/src/pages/UsagePage.tsx canvas/src/App.tsx
git commit -m "feat(usage): replace observability page with spend-based UsagePage"
```

---

### Task 7: Styles

**Files:**
- Modify: `canvas/src/index.css` (append at end)

- [ ] **Step 1: Append the spend-page + modal styles**

Add to the end of `canvas/src/index.css`:

```css
/* ── Usage / Spend page ───────────────────────────────── */
.otto-month-stepper {
  display: inline-flex; align-items: center; gap: 4px;
  border: 1px solid var(--dash-border); border-radius: 9px;
  background: var(--dash-input-bg); padding: 3px;
}
.otto-month-stepper > span {
  min-width: 104px; text-align: center;
  font-size: 13px; font-weight: 600; color: var(--dash-text);
  font-variant-numeric: tabular-nums;
}
.otto-month-stepper button {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border: none; border-radius: 6px;
  background: transparent; color: var(--dash-muted); cursor: pointer;
}
.otto-month-stepper button:hover:not(:disabled) { background: var(--dash-raise-med); color: var(--dash-text); }
.otto-month-stepper button:disabled { opacity: 0.35; cursor: default; }

.otto-spend-summary { padding: 22px 24px; margin-bottom: 14px; }
.otto-spend-summary-grid {
  display: grid; grid-template-columns: 1fr auto; gap: 28px; align-items: center;
}
.otto-spend-facts { display: flex; flex-direction: column; gap: 14px; margin: 0; }
.otto-spend-facts > div { display: flex; justify-content: space-between; gap: 24px; max-width: 360px; }
.otto-spend-facts dt { font-size: 13px; color: var(--dash-muted); }
.otto-spend-facts dd {
  margin: 0; font-size: 14px; color: var(--dash-text); font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.otto-spend-tiles { display: flex; gap: 12px; }
.otto-spend-tile {
  min-width: 150px; padding: 16px 18px; border-radius: 12px;
  border: 1px solid var(--dash-border); background: var(--dash-panel-soft);
  display: flex; flex-direction: column; gap: 8px;
}
.otto-spend-tile.is-muted { background: var(--dash-subtle); }
.otto-spend-tile span { font-size: 12px; color: var(--dash-muted); }
.otto-spend-tile strong {
  font-family: 'Geist Mono', monospace; font-size: 26px; font-weight: 720;
  color: var(--dash-text); line-height: 1; letter-spacing: -0.02em;
}

.otto-budget { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--dash-border); }
.otto-budget-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.otto-budget-head > span:first-child { font-size: 13px; font-weight: 600; color: var(--dash-text); }
.otto-budget-figure { font-family: 'Geist Mono', monospace; font-size: 13px; color: var(--dash-muted); }
.otto-budget-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.otto-budget-foot > span { font-size: 12px; color: var(--dash-faint); font-variant-numeric: tabular-nums; }
.otto-budget-edit { display: inline-flex; align-items: center; gap: 6px; }
.otto-budget-edit > span { color: var(--dash-muted); font-size: 13px; }
.otto-budget-edit input {
  width: 90px; padding: 6px 8px; border: 1px solid var(--dash-border-strong);
  border-radius: 7px; background: var(--dash-field-bg); color: var(--dash-text);
  font-family: 'Geist Mono', monospace; font-size: 13px;
}

.otto-plan-banner {
  display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 16px 20px; margin-bottom: 14px; border-radius: 12px;
  border: 1px solid var(--dash-border); background: var(--dash-accent-soft);
}
.otto-plan-banner strong { display: block; font-size: 13px; color: var(--dash-text); margin-bottom: 3px; }
.otto-plan-banner p { margin: 0; font-size: 12px; color: var(--dash-muted); max-width: 540px; }

.otto-spend-warn {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 11px 16px; margin-bottom: 14px; border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--dash-amber) 30%, transparent);
  background: color-mix(in srgb, var(--dash-amber) 9%, transparent);
  font-size: 12.5px; color: var(--dash-text);
}
.otto-spend-warn svg { color: var(--dash-amber); flex-shrink: 0; }

.otto-spend-empty {
  padding: 22px; text-align: center; font-size: 13px; color: var(--dash-muted);
}

.otto-spend-list { display: flex; flex-direction: column; }
.otto-spend-row-wrap { border-bottom: 1px solid var(--dash-border); }
.otto-spend-row-wrap:last-child { border-bottom: none; }
.otto-spend-row {
  width: 100%; display: grid; grid-template-columns: 1fr auto auto auto 18px;
  gap: 18px; align-items: center; padding: 14px 20px;
  background: transparent; border: none; cursor: pointer; text-align: left;
}
.otto-spend-row:hover { background: var(--dash-subtle); }
.otto-spend-row-name { font-size: 13.5px; font-weight: 600; color: var(--dash-text); }
.otto-spend-row-runs, .otto-spend-row-tok {
  font-size: 12px; color: var(--dash-faint); font-variant-numeric: tabular-nums;
}
.otto-spend-row-usd {
  font-family: 'Geist Mono', monospace; font-size: 13.5px; font-weight: 640;
  color: var(--dash-text); min-width: 64px; text-align: right;
}
.otto-spend-caret { color: var(--dash-faint); transition: transform 0.16s ease; }
.otto-spend-caret.is-open { transform: rotate(180deg); }
.otto-spend-models { padding: 4px 20px 14px 20px; display: flex; flex-direction: column; gap: 6px; }
.otto-spend-model {
  display: grid; grid-template-columns: 1fr auto auto; gap: 18px;
  font-size: 12px; color: var(--dash-muted); font-variant-numeric: tabular-nums;
  padding: 4px 0 4px 14px; border-left: 2px solid var(--dash-border);
}
.otto-spend-model > span:last-child { font-family: 'Geist Mono', monospace; min-width: 64px; text-align: right; }
.otto-spend-unpriced { color: var(--dash-amber); font-style: normal; }

/* shared small buttons */
.otto-link {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: 12px; color: var(--dash-accent); font-weight: 600;
}
.otto-link:hover { text-decoration: underline; }
.otto-btn-quiet {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 8px 13px; border: 1px solid var(--dash-border); border-radius: 8px;
  background: var(--dash-raise); color: var(--dash-text);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.otto-btn-quiet:hover { border-color: var(--dash-border-strong); background: var(--dash-raise-med); }
.otto-btn-primary {
  padding: 8px 15px; border: none; border-radius: 8px;
  background: var(--dash-accent-strong); color: #fff;
  font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.otto-btn-primary:disabled { opacity: 0.6; cursor: default; }
.otto-btn-ghost {
  padding: 8px 15px; border: 1px solid var(--dash-border); border-radius: 8px;
  background: transparent; color: var(--dash-muted); font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.otto-btn-ghost:hover { color: var(--dash-text); border-color: var(--dash-border-strong); }

/* ── Pricing modal ─────────────────────────────────────── */
.otto-pricing-scrim {
  position: fixed; inset: 0; z-index: 200;
  background: var(--dash-modal-scrim);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.otto-pricing-modal {
  width: 100%; max-width: 540px; max-height: 82vh; overflow: auto;
  border: 1px solid var(--dash-border-strong); border-radius: 16px;
  background: var(--dash-bg-elevated); box-shadow: var(--dash-shadow);
}
.otto-pricing-head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
  padding: 20px 22px 14px; border-bottom: 1px solid var(--dash-border);
}
.otto-pricing-head h2 { margin: 0 0 3px; font-size: 15px; color: var(--dash-text); }
.otto-pricing-head p { margin: 0; font-size: 12px; color: var(--dash-muted); }
.otto-pricing-body { padding: 14px 22px; display: flex; flex-direction: column; gap: 8px; }
.otto-pricing-row { display: grid; grid-template-columns: 1fr 96px 96px 30px; gap: 10px; align-items: center; }
.otto-pricing-row-head { font-size: 11px; color: var(--dash-faint); text-transform: uppercase; letter-spacing: 0.04em; }
.otto-pricing-row input {
  padding: 7px 9px; border: 1px solid var(--dash-border-strong); border-radius: 7px;
  background: var(--dash-field-bg); color: var(--dash-text); font-size: 12.5px; width: 100%;
}
.otto-pricing-row input[type='number'] { font-family: 'Geist Mono', monospace; }
.otto-pricing-add { align-self: flex-start; margin-top: 4px; }
.otto-pricing-foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px 20px; border-top: 1px solid var(--dash-border);
}
```

- [ ] **Step 2: Build to confirm the CSS compiles**

Run: `npm run build` in `canvas/`
Expected: `tsc && vite build` succeeds; no CSS syntax errors.

- [ ] **Step 3: Commit**

```bash
git add canvas/src/index.css
git commit -m "feat(usage): styles for spend page, budget bar, and pricing modal"
```

---

### Task 8: Manual end-to-end verification

No code — verify behavior in a running app. Run backend (`npm run dev`) + canvas (`npm run dev` in `canvas/`), log in, open `/app/observability` ("Usage" in the sidebar).

- [ ] **Step 1: Empty-price state**
With no model prices set, confirm: the two big tiles show `$ —`; "Models priced 0 of N"; if any models were used, the amber "no price" warning appears. No fabricated dollar values anywhere.

- [ ] **Step 2: Set prices**
Click **Edit pricing** → the modal lists models Otto observed (pre-filled names). Enter `$/1M in` and `$/1M out` for one, Save. Confirm the page reloads and dollar figures now appear; "Models priced" count rises; the warning shrinks/clears.

- [ ] **Step 3: By-workflow breakdown**
Confirm "Spend by workflow" lists workflows sorted by spend; expanding a row reveals per-model token + dollar rows; unpriced models in a row show "· no price" and `—`.

- [ ] **Step 4: Budget + alert**
Click **Set budget**, enter a value below current month-to-date spend, Save. Confirm the progress bar appears, turns red at ≥100%, and a notification (bell badge) fires once. Reload — the alert does not duplicate.

- [ ] **Step 5: Month stepper + retention**
Step back a month — confirm the label updates and data reloads; stepping past the 30-day retention window shows the "pruned" message; the **next** arrow is disabled on the current month.

- [ ] **Step 6: Themes**
Toggle dark/light (top-right). Confirm the summary card, tiles, budget bar, banner, list, and modal all read correctly in both — no Railway violet, only Otto's tokens.

- [ ] **Step 7: Commit any fixes, then finish**
If steps surfaced fixes, commit them. Otherwise the feature is complete.

---

## Self-Review

**1. Spec coverage**
- Cost/spend direction → Tasks 2, 3, 6. ✓
- User-configurable prices (server-side) → Task 1 (table), 3 (CRUD), 5 (modal). ✓
- Month stepper, calendar months, retention empty state → Task 3 (period math + retention flag), 6 (stepper UI + pruned message). ✓
- Budget + alert → Task 1 (column), 3 (get/set), 6 (bar + once-per-month notification). ✓
- Approach A (dedicated table/route) → Tasks 1, 3. ✓
- Pricing modal off the page → Tasks 5, 6. ✓
- Month-end projection tile (v1) → Task 2 (`projectMonthEnd` + test), 3 (response), 6 (adaptive tile). ✓
- Honesty / no mock data → Task 6 (`$ —`, empty states; deletes ObservabilityPage with its mocks). ✓
- Both themes via `--dash-*` tokens → Task 7, verified Task 8 step 6. ✓
- Leave `/observability` + Sidebar intact → Task 6 step 3 note. ✓

**2. Placeholder scan** — every code step contains complete, runnable code; no TBD/TODO/"handle errors" placeholders. ✓

**3. Type consistency** — the `UsageSummary` shape in `types.ts` (Task 4) matches the route response in `usage.js` (Task 3) field-for-field (`period`, `retention`, `totals`, `projection`, `budget`, `byWorkflow[].byModel[]`, `daily`, `unpricedModels`, `pricedModelCount`, `totalModelCount`). Pure-helper names (`rowSpendUsd`, `aggregateSpend`, `dailySpend`, `projectMonthEnd`, `budgetPct`, `monthBounds`) are identical across `pricing.js`, its tests, and the route import. `api.ts` method names (`getUsageSummary`, `getModelPrices`, `saveModelPrices`, `getBudget`, `setBudget`) match their call sites in `UsagePage.tsx` and `PricingModal.tsx`. `OttoNotification` widening (`type: 'error' | 'budget'`, optional `executionId`) is consistent with the budget alert object in `UsagePage.tsx` and existing producers in `ExecutionHistory.tsx`. ✓
```
