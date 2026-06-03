import { useEffect, useState, useCallback, useRef } from 'react';
import { DashboardShell } from '../dashboard/DashboardShell';
import { api } from '../api';
import type { Execution } from '../types';
import { useStore } from '../store';
import type { OttoNotification } from '../store';
import {
  ArrowsClockwise,
  CaretDown,
  CheckCircle,
  Clock,
  MagnifyingGlass,
  PlayCircle,
} from '@phosphor-icons/react';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all',   label: 'All statuses' },
  { value: 'error', label: 'Errors only' },
] as const;

type StatusFilter = 'all' | 'error';

function StatusFilterDropdown({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = STATUS_OPTIONS.find(o => o.value === value)?.label ?? '';

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close as unknown as EventListener);
    return () => document.removeEventListener('mousedown', close as unknown as EventListener);
  }, [open]);

  return (
    <div className="otto-sort-wrap" ref={ref}>
      <button className="otto-sort-trigger" type="button" onClick={() => setOpen(o => !o)}>
        {current}
        <CaretDown size={12} />
      </button>
      {open && (
        <div className="otto-sort-menu" role="listbox">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`otto-sort-option${value === opt.value ? ' is-active' : ''}`}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls = { success: 'is-success', error: 'is-error', running: 'is-running', cancelled: 'is-cancelled' }[status] ?? '';
  return <span className={`otto-status-pill ${cls}`}>{status}</span>;
}

function SkeletonRows({ count = 8 }: { count?: number }) {
  const widths = [
    ['60%', '40%', '50%', '35%', '70%', '25%'],
    ['55%', '45%', '48%', '40%', '65%', '28%'],
    ['62%', '38%', '52%', '30%', '72%', '30%'],
    ['58%', '42%', '46%', '38%', '68%', '22%'],
    ['65%', '36%', '54%', '32%', '74%', '26%'],
    ['52%', '44%', '50%', '36%', '66%', '24%'],
    ['60%', '40%', '48%', '34%', '70%', '28%'],
    ['56%', '43%', '52%', '33%', '69%', '25%'],
  ];
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="otto-table-skeleton-row">
          {widths[i % widths.length].map((w, j) => (
            <td key={j}>
              <div
                className="otto-table-skeleton-cell"
                style={{ width: w, borderRadius: j === 2 ? 5 : 4 }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function duration(start: string | null, end: string | null): string {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ExecutionHistory() {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);      // initial load
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const offsetRef = useRef(0);
  const sentinelRef = useRef<HTMLTableRowElement>(null);

  const addNotifications = useStore((s) => s.addNotifications);

  // Push error executions into global notifications
  const pushErrors = useCallback((list: Execution[]) => {
    const errItems: OttoNotification[] = list
      .filter(e => e.status === 'error')
      .map(e => ({
        id: e.id,
        type: 'error' as const,
        title: e.workflow_name
          ? `"${e.workflow_name}" failed`
          : `Execution failed — ${e.id.slice(0, 12)}…`,
        workflowName: e.workflow_name ?? null,
        executionId: e.id,
        timestamp: e.started_at ?? new Date().toISOString(),
        urgent: true,
      }));
    if (errItems.length) addNotifications(errItems);
  }, [addNotifications]);

  // Refresh icon animation
  const refreshSpanRef = useRef<HTMLSpanElement>(null);
  const rotRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const isSpinningRef = useRef(false);

  const readAngle = (): number => {
    const el = refreshSpanRef.current;
    if (!el) return rotRef.current;
    const t = window.getComputedStyle(el).transform;
    if (!t || t === 'none') return rotRef.current;
    const m = new DOMMatrix(t);
    return Math.atan2(m.m12, m.m11) * (180 / Math.PI);
  };
  const freeze = () => {
    const el = refreshSpanRef.current;
    if (!el) return;
    if (rafRef.current === null) rotRef.current = readAngle();
    el.style.transition = 'none';
    el.style.transform = `rotate(${rotRef.current}deg)`;
    el.getAnimations().forEach(a => a.cancel());
  };
  const slideTo = (to: number, ms: number) => {
    const el = refreshSpanRef.current;
    if (!el) return;
    void el.offsetWidth;
    el.style.transition = `transform ${ms}ms ease-out`;
    el.style.transform = `rotate(${to}deg)`;
  };
  const stopSpin = () => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    lastTsRef.current = null;
  };
  const handleRefreshEnter = () => { if (isSpinningRef.current) return; freeze(); slideTo(120, 350); };
  const handleRefreshLeave = () => { if (isSpinningRef.current) return; freeze(); slideTo(0, 350); rotRef.current = 0; };

  // Initial load / reset
  const loadFresh = useCallback(async () => {
    setLoading(true);
    offsetRef.current = 0;
    try {
      const res = await api.listExecutions(undefined, 1, PAGE_SIZE);
      const list = res.executions as Execution[];
      setExecutions(list);
      setTotal(res.total ?? 0);
      setHasMore(list.length >= PAGE_SIZE);
      offsetRef.current = list.length;
      pushErrors(list);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [pushErrors]);

  // Append next batch
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = Math.floor(offsetRef.current / PAGE_SIZE) + 1;
      const res = await api.listExecutions(undefined, page, PAGE_SIZE);
      const list = res.executions as Execution[];
      setExecutions(prev => [...prev, ...list]);
      setHasMore(list.length >= PAGE_SIZE);
      offsetRef.current += list.length;
      pushErrors(list);
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }, [loadingMore, hasMore, pushErrors]);

  // Animated refresh (resets to page 1)
  const handleRefreshClick = async () => {
    if (isSpinningRef.current) return;
    isSpinningRef.current = true;
    const el = refreshSpanRef.current;
    if (el) {
      freeze();
      const tick = (ts: number) => {
        if (!lastTsRef.current) lastTsRef.current = ts;
        const dt = Math.min(ts - lastTsRef.current, 50);
        lastTsRef.current = ts;
        rotRef.current -= (dt / 900) * 360;
        el.style.transform = `rotate(${rotRef.current}deg)`;
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    await loadFresh();
    stopSpin();
    if (el) {
      const from = rotRef.current;
      const to = Math.floor(from / 360) * 360;
      const dist = Math.abs(to - from);
      const dur = Math.max((dist / 360) * 700, 180);
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        el.style.transition = 'none'; el.style.transform = 'rotate(0deg)';
        rotRef.current = 0; isSpinningRef.current = false;
      };
      if (dist < 1) { finish(); return; }
      slideTo(to, dur);
      el.addEventListener('transitionend', finish, { once: true });
      window.setTimeout(finish, dur + 150);
    } else { isSpinningRef.current = false; }
  };

  useEffect(() => { void loadFresh(); }, [loadFresh]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) void loadMore(); },
      { threshold: 0.1 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [loadMore]);

  const filtered = executions.filter(e => {
    if (statusFilter === 'error' && e.status !== 'error') return false;
    return (
      e.id?.toLowerCase().includes(search.toLowerCase()) ||
      e.trigger_type?.toLowerCase().includes(search.toLowerCase())
    );
  });

  const successCount = executions.filter(e => e.status === 'success').length;
  const runningCount = executions.filter(e => e.status === 'running').length;
  const successRate = executions.length ? `${Math.round((successCount / executions.length) * 100)}%` : '—';
  const avgDuration = (() => {
    const timed = executions.filter(e => e.started_at && e.completed_at);
    if (!timed.length) return '—';
    const avg = timed.reduce((s, e) =>
      s + (new Date(e.completed_at!).getTime() - new Date(e.started_at!).getTime()), 0
    ) / timed.length;
    return `${(avg / 1000).toFixed(1)}s`;
  })();

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">

        {/* ── Hero ── */}
        <div className="otto-page-hero">
          <div>
            <span className="otto-title-bar" aria-hidden="true" />
            <h1>Executions</h1>
            <p className="otto-hero-copy">
              Every workflow run in one place. Inspect inputs, outputs, and timing for each node.
            </p>
          </div>
          <div className="otto-hero-actions">
            <button
              className="otto-icon-button"
              type="button"
              onClick={() => void handleRefreshClick()}
              onMouseEnter={handleRefreshEnter}
              onMouseLeave={handleRefreshLeave}
              title="Refresh"
            >
              <span ref={refreshSpanRef} style={{ display: 'inline-flex' }}>
                <ArrowsClockwise size={16} weight="bold" />
              </span>
            </button>
          </div>
        </div>

        {/* ── Metric strip ── */}
        <div className="otto-metric-strip">
          <div className="otto-metric-card">
            <PlayCircle size={18} weight="duotone" />
            <strong>{loading ? '—' : total.toLocaleString()}</strong>
            <span>Total Runs</span>
          </div>
          <div className="otto-metric-card">
            <CheckCircle size={18} weight="duotone" />
            <strong>{loading ? '—' : successRate}</strong>
            <span>Success Rate</span>
          </div>
          <div className="otto-metric-card">
            <Clock size={18} weight="duotone" />
            <strong>{loading ? '—' : avgDuration}</strong>
            <span>Avg Duration</span>
          </div>
          <div className="otto-metric-card">
            <ArrowsClockwise size={18} weight="bold" />
            <strong>{loading ? '—' : runningCount}</strong>
            <span>Running Now</span>
          </div>
        </div>

        {/* ── Table panel ── */}
        <div className="otto-resource-panel">
          <div className="otto-resource-toolbar">
            <div>
              <h2>Run History</h2>
              <p>{loading ? 'Loading…' : `${total.toLocaleString()} total`}</p>
            </div>
            <div className="otto-topbar-actions">
              <label className="otto-search">
                <MagnifyingGlass size={14} weight="bold" />
                <input
                  placeholder="Filter by ID or trigger…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </label>
              <StatusFilterDropdown value={statusFilter} onChange={setStatusFilter} />
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="otto-table">
              <thead>
                <tr>
                  {['Execution ID', 'Workflow', 'Status', 'Trigger', 'Started', 'Duration'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows count={8} />
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="otto-empty-state" style={{ minHeight: 260 }}>
                        <PlayCircle size={40} weight="duotone" />
                        <h3>No executions found</h3>
                        <p>Run a workflow from the canvas, or adjust your filter.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {filtered.map(e => (
                      <tr key={e.id}>
                        <td className="td-mono">{e.id?.slice(0, 16)}…</td>
                        <td style={{ color: 'var(--dash-text)', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.workflow_name ?? e.workflow_id?.slice(0, 8) + '…'}
                        </td>
                        <td><StatusPill status={e.status} /></td>
                        <td style={{ textTransform: 'capitalize' }}>{e.trigger_type ?? '—'}</td>
                        <td>{formatDate(e.started_at)}</td>
                        <td className="td-mono">{duration(e.started_at, e.completed_at)}</td>
                      </tr>
                    ))}
                    {/* Infinite scroll sentinel */}
                    {hasMore && !loadingMore && <tr ref={sentinelRef} style={{ height: 1 }} />}
                    {loadingMore && <SkeletonRows count={4} />}
                    {!hasMore && filtered.length > 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '16px 18px', color: 'var(--dash-faint)', fontSize: 12 }}>
                          All {total.toLocaleString()} executions loaded
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
