// Pure token-usage aggregation helpers. No DB access — unit-tested in test/usage-stats.test.js.
// Otto does not price model usage; these helpers only summarize token counts and runs.

/**
 * Build the per-workflow / per-model token breakdown + totals.
 * @param {Array} tokenRows [{ workflow_id, workflow_name, model, prompt_tokens, completion_tokens }]
 * @param {Array} runRows   [{ workflow_id, runs }]
 * @returns { byWorkflow, totals, models } — models is workspace-global (distinct across all rows)
 */
export function aggregateUsage(tokenRows, runRows) {
  const runsByWf = new Map(runRows.map((r) => [r.workflow_id, Number(r.runs) || 0]));
  const wfMap = new Map();
  const modelsSeen = new Set();

  for (const row of tokenRows) {
    modelsSeen.add(row.model);
    const prompt = Number(row.prompt_tokens) || 0;
    const completion = Number(row.completion_tokens) || 0;

    let wf = wfMap.get(row.workflow_id);
    if (!wf) {
      wf = {
        workflowId: row.workflow_id,
        name: row.workflow_name ?? null,
        runs: runsByWf.get(row.workflow_id) ?? 0,
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
        byModel: [],
      };
      wfMap.set(row.workflow_id, wf);
    }
    wf.promptTokens += prompt;
    wf.completionTokens += completion;
    wf.totalTokens += prompt + completion;
    wf.byModel.push({ model: row.model, totalTokens: prompt + completion });
  }

  for (const wf of wfMap.values()) {
    wf.byModel.sort((a, b) => b.totalTokens - a.totalTokens);
  }

  const byWorkflow = [...wfMap.values()].sort((a, b) => b.totalTokens - a.totalTokens);

  const totals = byWorkflow.reduce((acc, wf) => {
    acc.promptTokens += wf.promptTokens;
    acc.completionTokens += wf.completionTokens;
    acc.totalTokens += wf.totalTokens;
    return acc;
  }, {
    promptTokens: 0, completionTokens: 0, totalTokens: 0,
    // runs come from runRows (workflow-level), not the per-workflow token reduce
    runs: runRows.reduce((s, r) => s + (Number(r.runs) || 0), 0),
  });

  return { byWorkflow, totals, models: [...modelsSeen] };
}

/** Daily token series from daily rows [{ day, prompt_tokens, completion_tokens }]. */
export function dailyTokens(dailyRows) {
  const byDay = new Map();
  for (const row of dailyRows) {
    const day = row.day instanceof Date ? row.day.toISOString().slice(0, 10) : String(row.day).slice(0, 10);
    const total = (Number(row.prompt_tokens) || 0) + (Number(row.completion_tokens) || 0);
    const entry = byDay.get(day) || { day, totalTokens: 0 };
    entry.totalTokens += total;
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
