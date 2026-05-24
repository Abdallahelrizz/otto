import { useState, useEffect } from 'react';
import { NODE_TYPE_DEFS, NODE_CATEGORIES, nodeColor, nodeRadius, OTTO_AMBER, type NodeTypeDef } from './nodes/nodeConfig';
import { NodeIcon } from './NodeIcon';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../store';
import { api } from '../api';
import type { Node } from 'reactflow';
import type { WorkflowListItem } from '../types';

const AMBER = OTTO_AMBER;

const NAV_ITEMS = [
  { id: 'workflows',    label: 'Workflows',    badge: null },
  { id: 'library',     label: 'Node library', badge: null },
  { id: 'history',     label: 'History',      badge: null },
  { id: 'integrations',label: 'Integrations', badge: null },
  { id: 'models',      label: 'Models',       badge: 4    },
  { id: 'memory',      label: 'Memory',       badge: null },
  { id: 'settings',    label: 'Settings',     badge: null },
];

function NavIcon({ id }: { id: string }) {
  const paths: Record<string, React.ReactNode> = {
    workflows: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><line x1="6" y1="15" x2="6" y2="3"/><line x1="18" y1="21" x2="18" y2="9"/><line x1="6" y1="3" x2="18" y2="3"/>
      </svg>
    ),
    library: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
    history: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
        <polyline points="12 7 12 12 16 14"/>
      </svg>
    ),
    models: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
      </svg>
    ),
    memory: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
    integrations: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    ),
    settings: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  };
  return <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{paths[id] ?? null}</span>;
}

const STORAGE_KEY = 'otto_sidebar_open_cat';
function readStorage(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); }
  catch { return null; }
}
function writeStorage(val: string | null) {
  try { if (val) localStorage.setItem(STORAGE_KEY, val); else localStorage.removeItem(STORAGE_KEY); }
  catch { /* noop */ }
}

// ── Workflows Tab ─────────────────────────────────────────────────────────────
function WorkflowsTab() {
  const workflowList = useStore((s) => s.workflowList);
  const workflowListLoading = useStore((s) => s.workflowListLoading);
  const workflowListHasMore = useStore((s) => s.workflowListHasMore);
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const fetchWorkflows = useStore((s) => s.fetchWorkflows);
  const loadWorkflow = useStore((s) => s.loadWorkflow);
  const deleteWorkflow = useStore((s) => s.deleteWorkflow);
  const newWorkflow = useStore((s) => s.newWorkflow);

  const [importOpen, setImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  useEffect(() => { fetchWorkflows(); }, []);

  const handleImport = async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      const parsed = JSON.parse(importJson);
      const { id, warnings } = await api.importN8n(parsed);
      await loadWorkflow(id);
      setImportOpen(false);
      setImportJson('');
      if (warnings.length > 0) alert(`Imported with warnings:\n${warnings.join('\n')}`);
      fetchWorkflows();
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
        <button
          onClick={() => setImportOpen((x) => !x)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: "'Inter'",
            fontWeight: 500,
            color: 'var(--text-secondary)',
            letterSpacing: '-0.005em',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Import from n8n
        </button>

        {importOpen && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder="Paste n8n workflow JSON here…"
              style={{
                width: '100%',
                height: '100px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-input)',
                borderRadius: '5px',
                color: 'var(--text-primary)',
                fontFamily: "'JetBrains Mono'",
                fontSize: '11px',
                padding: '8px',
                resize: 'vertical',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            {importError && <span style={{ fontSize: '11px', color: 'var(--node-error)' }}>{importError}</span>}
            <button
              onClick={handleImport}
              disabled={importLoading || !importJson.trim()}
              style={{
                padding: '6px',
                background: AMBER,
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                fontFamily: "'Inter'",
                fontSize: '12px',
                fontWeight: 600,
                cursor: importLoading || !importJson.trim() ? 'not-allowed' : 'pointer',
                opacity: importLoading || !importJson.trim() ? 0.6 : 1,
              }}
            >
              {importLoading ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 8px' }}>
        {workflowListLoading && (
          <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
            Loading…
          </div>
        )}
        {!workflowListLoading && workflowList.length === 0 && (
          <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            No saved workflows yet.<br />Save a workflow to see it here.
          </div>
        )}
        {workflowList.map((wf) => (
          <WorkflowRow
            key={wf.id}
            wf={wf}
            isActive={wf.id === savedWorkflowId}
            onLoad={() => loadWorkflow(wf.id)}
            onDelete={() => deleteWorkflow(wf.id)}
          />
        ))}
        {workflowListHasMore && (
          <button
            onClick={() => fetchWorkflows(false)}
            disabled={workflowListLoading}
            style={{
              width: '100%',
              padding: '7px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              cursor: workflowListLoading ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              fontFamily: "'Inter'",
              marginTop: '4px',
            }}
          >
            {workflowListLoading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}

function WorkflowRow({ wf, isActive, onLoad, onDelete }: {
  wf: WorkflowListItem;
  isActive: boolean;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const ts = new Date(wf.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div
      onClick={onLoad}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 8px',
        borderRadius: '5px',
        background: isActive ? 'var(--bg-node-lift)' : hovered ? 'var(--bg-hover)' : 'transparent',
        cursor: 'pointer',
        transition: 'background 100ms ease',
        border: isActive ? `1px solid ${AMBER}33` : '1px solid transparent',
      }}
    >
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: wf.active ? 'var(--live)' : 'var(--border-input)',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <span style={{
          fontSize: '12.5px',
          fontWeight: isActive ? 600 : 500,
          color: 'var(--text-primary)',
          fontFamily: "'Inter'",
          letterSpacing: '-0.008em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {wf.name}
        </span>
        <span style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: "'JetBrains Mono'",
          letterSpacing: '0.01em',
        }}>
          {ts}
        </span>
      </div>
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${wf.name}"?`)) onDelete(); }}
          style={{
            padding: '3px 5px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'var(--node-error)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────────────────
function HistoryTab() {
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const loadExecutionDetail = useStore((s) => s.loadExecutionDetail);
  const [executions, setExecutions] = useState<Array<{ id: string; status: string; started_at: string | null }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.listExecutions(savedWorkflowId ?? undefined).then((res) => {
      setExecutions(res.executions as Array<{ id: string; status: string; started_at: string | null }>);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [savedWorkflowId]);

  const statusColor: Record<string, string> = {
    success: 'var(--node-success)',
    error: 'var(--node-error)',
    running: 'var(--node-running)',
    pending: 'var(--text-muted)',
    cancelled: 'var(--text-muted)',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
      {loading && (
        <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</div>
      )}
      {!loading && executions.length === 0 && (
        <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          No executions yet.<br />Run a workflow to see history here.
        </div>
      )}
      {executions.map((ex) => {
        const ts = ex.started_at
          ? new Date(ex.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : '—';
        return (
          <div
            key={ex.id}
            onClick={() => loadExecutionDetail(ex.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 8px',
              borderRadius: '5px',
              marginBottom: '1px',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor[ex.status] ?? 'var(--text-muted)', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono'", color: 'var(--text-muted)', letterSpacing: '0.01em' }}>
                {ex.id.slice(0, 8)}…
              </span>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'Inter'" }}>{ts}</div>
            </div>
            <span style={{
              fontSize: '10px',
              fontFamily: "'JetBrains Mono'",
              fontWeight: 600,
              color: statusColor[ex.status] ?? 'var(--text-muted)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {ex.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Integrations Tab ──────────────────────────────────────────────────────────
function IntegrationsTab() {
  const [all, setAll] = useState<import('../types').Integration[]>([]);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const refresh = async () => {
    setLoading(true);
    try {
      const [allRes, instRes] = await Promise.all([api.listIntegrations(), api.listInstalledIntegrations()]);
      setAll(allRes);
      setInstalled(new Set(instRes.map((i) => i.id)));
    } catch { /* noop */ }
    finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const toggle = async (id: string, isInstalled: boolean) => {
    setBusy((s) => new Set(s).add(id));
    try {
      if (isInstalled) await api.uninstallIntegration(id);
      else await api.installIntegration(id);
      setInstalled((s) => { const n = new Set(s); if (isInstalled) n.delete(id); else n.add(id); return n; });
    } catch { /* noop */ }
    finally { setBusy((s) => { const n = new Set(s); n.delete(id); return n; }); }
  };

  const byCategory = all.reduce<Record<string, import('../types').Integration[]>>((acc, i) => {
    const cat = i.category ?? 'other';
    (acc[cat] ??= []).push(i);
    return acc;
  }, {});

  if (loading) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
      Loading…
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: '16px' }}>
          <div style={{
            fontFamily: "'JetBrains Mono'",
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '0 4px 6px',
          }}>
            {cat}
          </div>
          {items.map((intg) => {
            const isInstalled = installed.has(intg.id);
            const isBusy = busy.has(intg.id);
            return (
              <div key={intg.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px',
                borderRadius: '6px',
                marginBottom: '2px',
                background: isInstalled ? 'var(--bg-node-lift)' : 'transparent',
                border: isInstalled ? '1px solid var(--border)' : '1px solid transparent',
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '6px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '12px',
                  fontWeight: 700,
                  color: AMBER,
                  fontFamily: "'Inter'",
                }}>
                  {intg.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Inter'", letterSpacing: '-0.005em' }}>
                    {intg.name}
                  </div>
                  {intg.description && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {intg.description}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => toggle(intg.id, isInstalled)}
                  disabled={isBusy}
                  style={{
                    padding: '4px 10px',
                    background: isInstalled ? 'transparent' : AMBER,
                    border: isInstalled ? '1px solid var(--border)' : 'none',
                    borderRadius: '4px',
                    color: isInstalled ? 'var(--text-secondary)' : '#fff',
                    fontFamily: "'Inter'",
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                    opacity: isBusy ? 0.5 : 1,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isBusy ? '…' : isInstalled ? 'Remove' : 'Install'}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Settings Tab (Credentials) ────────────────────────────────────────────────
function SettingsTab() {
  const credentials = useStore((s) => s.credentials);
  const credentialsLoading = useStore((s) => s.credentialsLoading);
  const fetchCredentials = useStore((s) => s.fetchCredentials);
  const createCredential = useStore((s) => s.createCredential);
  const deleteCredential = useStore((s) => s.deleteCredential);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('api_key');
  const [keyValue, setKeyValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchCredentials(); }, []);

  const CRED_TYPES = ['api_key', 'basic_auth', 'bearer_token', 'smtp', 'resend', 'postgres', 'oauth2'];

  const handleAdd = async () => {
    if (!name.trim() || !keyValue.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const value = keyValue.trim();
      let data: Record<string, string>;
      if (type === 'postgres') {
        data = { connectionString: value };
      } else if (type === 'resend') {
        data = { provider: 'resend', apiKey: value, value, key: value };
      } else {
        data = { value, key: value };
      }
      await createCredential(name.trim(), type, data);
      setName(''); setType('api_key'); setKeyValue('');
      setAddOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'JetBrains Mono'", padding: '0 2px 6px' }}>
          Credentials
        </div>
        <button
          onClick={() => setAddOpen((x) => !x)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            padding: '6px 10px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '5px',
            cursor: 'pointer',
            fontSize: '12px',
            fontFamily: "'Inter'",
            fontWeight: 500,
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add credential
        </button>

        {addOpen && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. OpenAI key)"
              style={inputStyle}
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={inputStyle}
            >
              {CRED_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="API key / value"
              type="password"
              style={inputStyle}
            />
            {error && <span style={{ fontSize: '11px', color: 'var(--node-error)' }}>{error}</span>}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={handleAdd}
                disabled={saving || !name.trim() || !keyValue.trim()}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: AMBER,
                  border: 'none',
                  borderRadius: '4px',
                  color: '#fff',
                  fontFamily: "'Inter'",
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setAddOpen(false)}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  fontFamily: "'Inter'",
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 8px' }}>
        {credentialsLoading && (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</div>
        )}
        {!credentialsLoading && credentials.length === 0 && (
          <div style={{ padding: '16px 12px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            No credentials yet.<br />Add API keys to use in nodes.
          </div>
        )}
        {credentials.map((cred) => (
          <div
            key={cred.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 8px',
              borderRadius: '5px',
              marginBottom: '1px',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: "'Inter'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {cred.name}
              </div>
              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono'", letterSpacing: '0.04em' }}>
                {cred.type}
              </div>
            </div>
            <button
              onClick={() => { if (confirm(`Delete "${cred.name}"?`)) deleteCredential(cred.id); }}
              style={{
                padding: '3px 5px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--node-error)',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: '4px',
  color: 'var(--text-primary)',
  fontFamily: "'Inter'",
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};

// ── Main Sidebar ──────────────────────────────────────────────────────────────
export function Sidebar() {
  const setNodes = useStore((s) => s.setNodes);
  const nodes = useStore((s) => s.nodes);
  const activeSidebarTab = useStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useStore((s) => s.setActiveSidebarTab);
  const newWorkflow = useStore((s) => s.newWorkflow);
  const theme = useStore((s) => s.theme);
  const isDark = theme === 'dark';

  const [openCat, setOpenCat] = useState<string | null>(readStorage);

  const toggle = (id: string) => {
    setOpenCat((prev) => {
      const next = prev === id ? null : id;
      writeStorage(next);
      return next;
    });
  };

  function onDragStart(e: React.DragEvent, nodeType: string) {
    e.dataTransfer.setData('application/otto-node-type', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  }

  function addToCanvas(nodeType: string) {
    const def = NODE_TYPE_DEFS.find((d) => d.type === nodeType)!;
    const newNode: Node = {
      id: uuidv4(),
      type: nodeType === 'ai_agent' ? 'agentNode' : 'ottoNode',
      position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: def.label, nodeType: def.type, config: { ...def.defaultConfig } },
    };
    setNodes([...nodes, newNode]);
  }

  return (
    <aside
      style={{
        width: '216px',
        height: '100%',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Brand mark */}
      <div style={{
        height: '54px',
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{
          width: 22,
          height: 22,
          borderRadius: '5px',
          background: AMBER,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </span>
        <span style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.022em',
          fontFamily: "'Inter'",
        }}>
          otto
        </span>
      </div>

      {/* Nav items */}
      <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeSidebarTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSidebarTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 10px',
                borderRadius: '5px',
                background: isActive
                  ? (isDark ? 'var(--bg-node-lift)' : '#EAE7E2')
                  : 'transparent',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                transition: 'background 100ms ease',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <NavIcon id={item.id} />
              <span style={{
                flex: 1,
                fontSize: '12.5px',
                fontWeight: isActive ? 600 : 500,
                color: 'inherit',
                letterSpacing: '-0.008em',
                textAlign: 'left',
                fontFamily: "'Inter'",
              }}>
                {item.label}
              </span>
              {item.badge != null && (
                <span style={{
                  fontFamily: "'JetBrains Mono'",
                  fontSize: '9.5px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em',
                  padding: '1px 6px',
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,15,10,0.04)',
                  borderRadius: '8px',
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'var(--border)', flexShrink: 0 }} />

      {/* Tab content */}
      {activeSidebarTab === 'library' && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px' }}>
          {NODE_CATEGORIES.map((cat) => {
            const items = NODE_TYPE_DEFS.filter((d) => d.category === cat.id);
            const isOpen = openCat === cat.id;

            return (
              <div key={cat.id}>
                <button
                  onClick={() => toggle(cat.id)}
                  style={{
                    width: '100%',
                    height: '34px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Inter'",
                    transition: 'background 120ms ease-out',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{
                    fontFamily: "'JetBrains Mono'",
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.14em',
                    flex: 1,
                    textAlign: 'left',
                    textTransform: 'uppercase',
                  }}>
                    {cat.label}
                  </span>
                  {!isOpen && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500 }}>
                      {items.length}
                    </span>
                  )}
                  <span style={{
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                  }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                <div style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    {items.map((def) => (
                      <NodeRow key={def.type} def={def} theme={theme} onDragStart={onDragStart} onClick={addToCanvas} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeSidebarTab === 'workflows' && <WorkflowsTab />}
      {activeSidebarTab === 'history' && <HistoryTab />}
      {activeSidebarTab === 'integrations' && <IntegrationsTab />}
      {activeSidebarTab === 'settings' && <SettingsTab />}

      {/* Placeholder tabs */}
      {['models', 'memory'].includes(activeSidebarTab) && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px 16px',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '-0.005em' }}>
            {activeSidebarTab === 'models' && 'Model registry coming soon'}
            {activeSidebarTab === 'memory' && 'Memory explorer coming soon'}
          </span>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '10px 8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '4px 6px' }}>
          <span style={{
            width: 26,
            height: 26,
            borderRadius: '13px',
            background: `linear-gradient(135deg, ${AMBER}, #FF8A47)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Inter',
            fontSize: '10.5px',
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-0.01em',
            flexShrink: 0,
          }}>
            AE
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.008em',
              fontFamily: "'Inter'",
            }}>
              Abdallah Elrizz
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono'",
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              letterSpacing: '0.02em',
            }}>
              Pro · 38%
            </span>
          </div>
        </div>

        <button
          onClick={newWorkflow}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '100%',
            padding: '8px 12px',
            background: AMBER,
            border: 'none',
            color: '#fff',
            fontFamily: 'Inter',
            fontSize: '12.5px',
            fontWeight: 600,
            letterSpacing: '-0.005em',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FF8A47'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = AMBER; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New workflow
        </button>
      </div>
    </aside>
  );
}

function NodeRow({
  def,
  theme,
  onDragStart,
  onClick,
}: {
  def: NodeTypeDef;
  theme: 'dark' | 'light';
  onDragStart: (e: React.DragEvent, type: string) => void;
  onClick: (type: string) => void;
}) {
  const color = nodeColor(def, theme);
  const radius = nodeRadius(def);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, def.type)}
      onClick={() => onClick(def.type)}
      title={def.description}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '0 10px',
        height: '34px',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'background 120ms ease-out',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '22px',
        height: '22px',
        borderRadius: radius,
        background: `${color}1a`,
        border: `1px solid ${color}33`,
      }}>
        <NodeIcon type={def.type} size={12} color={color} />
      </span>
      <span style={{
        fontFamily: "'Inter'",
        fontSize: '12.5px',
        fontWeight: 500,
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {def.label}
      </span>
    </div>
  );
}
