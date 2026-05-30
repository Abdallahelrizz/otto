import { useCallback, useEffect, useState } from 'react';
import { DashboardShell } from '../../dashboard/DashboardShell';
import { SettingsNav } from '../../dashboard/SettingsNav';
import { api } from '../../api';
import type { AuditEvent } from '../../types';
import { ArrowsClockwise, CaretDown } from '@phosphor-icons/react';

const LIMITS = [50, 100, 200];

function isDangerAction(a: string): boolean {
  return /denied|failed|revoke|remove|delete|error/i.test(a);
}

export function SettingsAuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [summary, setSummary] = useState<Array<{ action: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const [action, setAction] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { events } = await api.getAuditLog({ limit, action: action || undefined });
      setEvents(events);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [limit, action]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void api.getAuditSummary().then((r) => setSummary(r.summary)).catch(() => {}); }, []);

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <DashboardShell>
      <div className="otto-dashboard-content">
        <SettingsNav />
        <div className="otto-page-hero">
          <div>
            <p className="otto-eyebrow">Settings</p>
            <h1>Audit Log</h1>
            <p className="otto-hero-copy">Security and admin events for this workspace. Owner/admin only.</p>
          </div>
          <div className="otto-hero-actions">
            <button className="otto-icon-button" type="button" onClick={() => void load()} title="Refresh">
              <ArrowsClockwise size={15} weight="bold" />
            </button>
          </div>
        </div>

        <div className="otto-audit-toolbar">
          <select className="otto-audit-select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {summary.map((s) => (
              <option key={s.action} value={s.action}>{s.action} ({s.count})</option>
            ))}
          </select>
          <select className="otto-audit-select" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {LIMITS.map((n) => <option key={n} value={n}>Last {n}</option>)}
          </select>
        </div>

        <div className="otto-resource-panel otto-settings-panel">
          {error ? (
            <div className="otto-spend-empty">{error}</div>
          ) : loading ? (
            <div className="otto-spend-empty"><span className="otto-dots"><span /><span /><span /></span></div>
          ) : events.length === 0 ? (
            <div className="otto-spend-empty">No audit events{action ? ' for this action' : ''} yet.</div>
          ) : (
            <div className="otto-audit-list">
              {events.map((e) => {
                const open = expanded.has(e.id);
                return (
                  <div key={e.id} className="otto-audit-row-wrap">
                    <button type="button" className="otto-audit-row" onClick={() => toggle(e.id)}>
                      <span className={`otto-audit-action${isDangerAction(e.action) ? ' is-danger' : ''}`}>{e.action}</span>
                      <span className="otto-audit-resource">
                        {e.resourceType ?? '—'}{e.resourceId ? ` · ${e.resourceId}` : ''}
                      </span>
                      <span className="otto-audit-when">{new Date(e.createdAt).toLocaleString()}</span>
                      <CaretDown size={13} weight="bold" className={`otto-spend-caret${open ? ' is-open' : ''}`} />
                    </button>
                    {open && (
                      <dl className="otto-audit-details">
                        <dt>User</dt><dd>{e.userId ?? '—'}</dd>
                        <dt>IP</dt><dd>{e.ipAddress ?? '—'}</dd>
                        {e.userAgent && (<><dt>Agent</dt><dd>{e.userAgent}</dd></>)}
                        {e.metadata && Object.keys(e.metadata).length > 0 && (
                          <pre className="otto-audit-meta">{JSON.stringify(e.metadata, null, 2)}</pre>
                        )}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
