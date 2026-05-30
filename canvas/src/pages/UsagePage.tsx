import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardShell } from '../dashboard/DashboardShell';
import { api } from '../api';
import type { UsageSummary } from '../types';
import { ArrowsClockwise, CaretDown, CaretLeft, CaretRight } from '@phosphor-icons/react';

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function UsagePage() {
  const [cursor, setCursor] = useState(() => startOfMonthUTC(new Date()));
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const maxDaily = summary?.daily.reduce((m, d) => Math.max(m, d.totalTokens), 0) ?? 0;

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">
        <div className="otto-page-hero">
          <div>
            <p className="otto-eyebrow">Otto</p>
            <h1>Usage</h1>
            <p className="otto-hero-copy">Token usage by workflow for the selected month.</p>
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

        {/* Summary */}
        <div className="otto-resource-panel otto-spend-summary">
          <div className="otto-spend-summary-grid">
            <dl className="otto-spend-facts">
              <div><dt>Prompt tokens</dt><dd>{summary ? summary.totals.promptTokens.toLocaleString() : '—'}</dd></div>
              <div><dt>Completion tokens</dt><dd>{summary ? summary.totals.completionTokens.toLocaleString() : '—'}</dd></div>
              <div><dt>Models used</dt><dd>{summary ? summary.models.length : '—'}</dd></div>
            </dl>
            <div className="otto-spend-tiles">
              <div className="otto-spend-tile">
                <span>Total tokens</span>
                <strong>{summary ? fmtTokens(summary.totals.totalTokens) : '—'}</strong>
              </div>
              <div className="otto-spend-tile is-muted">
                <span>Runs</span>
                <strong>{summary ? summary.totals.runs.toLocaleString() : '—'}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Why there's no cost shown — Otto doesn't bill for model usage */}
        <div className="otto-plan-banner">
          <div>
            <strong>Your keys, your models</strong>
            <p>
              Otto never charges for model usage — you bring your own keys and pay your
              provider directly. For exact costs, check your provider’s billing page.
            </p>
          </div>
        </div>

        {summary && summary.retention.beyondRetention && (
          <div className="otto-spend-empty">
            Executions before {new Date(summary.retention.cutoff).toLocaleDateString()} were pruned
            (30-day retention). Raise EXECUTION_RETENTION_DAYS to keep more history.
          </div>
        )}

        {summary && summary.daily.length > 0 && (
          <div className="otto-resource-panel" style={{ marginBottom: 14 }}>
            <div className="otto-resource-toolbar"><div><h2>Token usage over time</h2><p>{summary.period.label}</p></div></div>
            <div className="otto-chart-bars">
              {summary.daily.map((d, i) => (
                <div key={i} className="otto-chart-bar"
                  style={{ height: `${maxDaily > 0 ? Math.max((d.totalTokens / maxDaily) * 100, 2) : 2}%` }}
                  title={`${d.day}: ${d.totalTokens.toLocaleString()} tokens`} />
              ))}
            </div>
          </div>
        )}

        <div className="otto-resource-panel">
          <div className="otto-resource-toolbar"><div><h2>Usage by workflow</h2></div></div>
          {summary && summary.byWorkflow.length === 0 && !loading && (
            <div className="otto-spend-empty">No token usage recorded for this period.</div>
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
                    <span className="otto-spend-row-usd">{fmtTokens(wf.totalTokens)} tok</span>
                    <CaretDown size={13} weight="bold" className={`otto-spend-caret${open ? ' is-open' : ''}`} />
                  </button>
                  {open && (
                    <div className="otto-spend-models">
                      {wf.byModel.map((m, i) => (
                        <div key={i} className="otto-spend-model">
                          <span>{m.model}</span>
                          <span>{fmtTokens(m.totalTokens)} tok</span>
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
    </DashboardShell>
  );
}
