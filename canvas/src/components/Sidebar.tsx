import { useState, useEffect, useMemo } from 'react';
import { Lightning, Toolbox, Robot, Globe, GearSix, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { NODE_TYPE_DEFS, NODE_CATEGORIES, nodeColor, nodeRadius, NODE_SERVICE_LOGO, OTTO_AMBER, OTTO_AMBER_HOVER, type NodeTypeDef } from './nodes/nodeConfig';
import { NodeIcon } from './NodeIcon';
import { ServiceLogo } from './ServiceLogo';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../store';
import { api } from '../api';
import type { Node } from 'reactflow';
import type {
  ImportCompatibilityReport,
  ImportCompatibilityStatus,
  MemoryInteraction,
  MemoryPattern,
  MemorySummary,
  ObservabilitySummary,
  Variable,
  WorkflowListItem,
} from '../types';

const AMBER = OTTO_AMBER;

const NAV_ITEMS = [
  { id: 'library', label: 'Node library', badge: null },
];

// Natural-case display names for category labels (source labels are ALL-CAPS).
const CAT_DISPLAY: Record<string, string> = {
  all: 'All',
  triggers: 'Triggers',
  core: 'Core',
  ai: 'AI',
  data: 'Data',
  integrations: 'Integrations',
};
const catDisplay = (id: string, fallback: string) =>
  CAT_DISPLAY[id] ?? (fallback.charAt(0) + fallback.slice(1).toLowerCase());

// Bucket-level icon + one-line description for the node-library category rows.
const CATEGORY_META: Record<string, { description: string; Icon: PhosphorIcon }> = {
  triggers:     { description: 'Start a workflow on an event, schedule, or request.', Icon: Lightning },
  core:         { description: 'Logic, data, code, HTTP, and files — the built-in blocks.', Icon: Toolbox },
  ai:           { description: 'Models, agents, memory, and semantic search.', Icon: Robot },
  integrations: { description: 'Act in apps like Slack, Notion, GitHub, or Postgres.', Icon: Globe },
};

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
    observability: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15l3-4 3 2 4-7"/><circle cx="8" cy="15" r="1"/><circle cx="11" cy="11" r="1"/><circle cx="14" cy="13" r="1"/><circle cx="18" cy="6" r="1"/>
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
  const [importPreview, setImportPreview] = useState<ImportCompatibilityReport | null>(null);
  const [tagFilter, setTagFilter] = useState('');

  useEffect(() => { fetchWorkflows(); }, []);

  const parseImportJson = () => JSON.parse(importJson);

  const handleAnalyzeImport = async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      const parsed = parseImportJson();
      const { report } = await api.importN8n(parsed, false);
      setImportPreview(report);
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : 'Import analysis failed');
    } finally {
      setImportLoading(false);
    }
  };

  const handleImport = async () => {
    setImportLoading(true);
    setImportError(null);
    try {
      const parsed = parseImportJson();
      const { id } = await api.importN8n(parsed, true);
      if (!id) throw new Error('Import did not return a workflow id');
      await loadWorkflow(id);
      setImportOpen(false);
      setImportJson('');
      setImportPreview(null);
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
              onChange={(e) => {
                setImportJson(e.target.value);
                setImportPreview(null);
              }}
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
            {importPreview && <ImportReportPanel report={importPreview} />}
            <button
              onClick={importPreview ? handleImport : handleAnalyzeImport}
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
              <span>{importLoading ? 'Working...' : importPreview ? 'Import workflow' : 'Analyze import'}</span>
              <span style={{ display: 'none' }}>
              {importLoading ? 'Importing…' : 'Import'}
              </span>
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '0 8px 4px', flexShrink: 0 }}>
        <input
          type="text"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          placeholder="Filter by tag…"
          style={{
            width: '100%',
            padding: '5px 8px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-input)',
            borderRadius: '5px',
            color: 'var(--text-primary)',
            fontFamily: "'Inter'",
            fontSize: '11.5px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
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
        {workflowList
          .filter((wf) => !tagFilter.trim() || (wf.tags ?? []).some((t) => t.toLowerCase().includes(tagFilter.trim().toLowerCase())))
          .map((wf) => (
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

function ImportReportPanel({ report }: { report: ImportCompatibilityReport }) {
  const summary = report.summary;
  const visibleNodes = report.nodes.filter((node) => node.status !== 'exact').slice(0, 8);
  const riskCount = (summary.placeholder ?? 0) + (summary.unsupported ?? 0);

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '5px',
      background: 'var(--bg-input)',
      padding: '8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
        {(['exact', 'partial', 'placeholder', 'unsupported'] as ImportCompatibilityStatus[]).map((status) => (
          <div key={status} style={{
            border: '1px solid var(--border)',
            borderRadius: '4px',
            padding: '5px 6px',
            color: importStatusColor(status),
            fontFamily: 'Geist Mono',
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            {status} {summary[status] ?? 0}
          </div>
        ))}
      </div>

      <div style={{
        fontSize: '11px',
        color: riskCount > 0 ? 'var(--node-error)' : 'var(--text-secondary)',
        lineHeight: 1.35,
      }}>
        {riskCount > 0
          ? `${riskCount} imported item${riskCount === 1 ? '' : 's'} must be replaced before this is fully runnable.`
          : 'No blocked nodes found. Review partial nodes before production use.'}
      </div>

      {visibleNodes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: 150, overflow: 'auto' }}>
          {visibleNodes.map((node) => (
            <div key={node.id} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
              <span style={{
                flexShrink: 0,
                marginTop: 2,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: importStatusColor(node.status),
              }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {node.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {node.status} / {node.ottoType}
                </div>
              </div>
            </div>
          ))}
          {report.nodes.filter((node) => node.status !== 'exact').length > visibleNodes.length && (
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
              +{report.nodes.filter((node) => node.status !== 'exact').length - visibleNodes.length} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function importStatusColor(status: ImportCompatibilityStatus) {
  if (status === 'exact') return 'var(--node-success)';
  if (status === 'partial') return 'var(--node-running)';
  if (status === 'placeholder') return 'var(--node-error)';
  return 'var(--text-muted)';
}

type WorkflowVersion = { version_number: number; created_at: string; created_by_email: string | null };

function WorkflowRow({ wf, isActive, onLoad, onDelete }: {
  wf: WorkflowListItem;
  isActive: boolean;
  onLoad: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const ts = new Date(wf.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      const vs = await api.listWorkflowVersions(wf.id);
      setVersions(vs);
    } catch { /* ignore */ } finally {
      setVersionsLoading(false);
    }
  };

  const toggleVersions = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!versionsOpen) await loadVersions();
    setVersionsOpen((v) => !v);
  };

  const handleRestore = async (e: React.MouseEvent, vnum: number) => {
    e.stopPropagation();
    if (!confirm(`Restore workflow to v${vnum}? The current definition will be saved as a new version.`)) return;
    try {
      await api.restoreWorkflowVersion(wf.id, vnum);
      setVersionsOpen(false);
      onLoad();
    } catch (err: unknown) {
      alert(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const iconBtnStyle: React.CSSProperties = {
    padding: '3px 5px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  };

  return (
    <div style={{ borderRadius: '5px', border: versionsOpen ? `1px solid var(--border)` : '1px solid transparent', background: versionsOpen ? 'var(--bg-node)' : 'transparent' }}>
      <div
        onClick={onLoad}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 8px',
          borderRadius: versionsOpen ? '5px 5px 0 0' : '5px',
          background: isActive ? 'var(--bg-node-lift)' : hovered ? 'var(--bg-hover)' : 'transparent',
          cursor: 'pointer',
          transition: 'background 100ms ease',
          border: isActive && !versionsOpen ? `1px solid ${AMBER}33` : '1px solid transparent',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: wf.active ? 'var(--live)' : 'var(--border-input)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ fontSize: '12.5px', fontWeight: isActive ? 600 : 500, color: 'var(--text-primary)', fontFamily: "'Inter'", letterSpacing: '-0.008em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {wf.name}
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono'", letterSpacing: '0.01em' }}>
            {ts}
          </span>
          {(wf.tags ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
              {(wf.tags ?? []).map((t) => (
                <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        {(hovered || versionsOpen) && (
          <button onClick={toggleVersions} title="Version history" style={{ ...iconBtnStyle, color: versionsOpen ? AMBER : 'var(--text-secondary)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
        )}
        {hovered && (
          <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${wf.name}"?`)) onDelete(); }} style={{ ...iconBtnStyle, color: 'var(--node-error)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        )}
      </div>

      {versionsOpen && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono'", letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '2px' }}>Version history</div>
          {versionsLoading && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loading…</div>}
          {!versionsLoading && versions.length === 0 && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No saved versions yet.</div>}
          {versions.map((v) => (
            <div key={v.version_number} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono'", minWidth: 28 }}>v{v.version_number}</span>
              <span style={{ flex: 1, fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {new Date(v.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}{v.created_by_email ? ` · ${v.created_by_email.split('@')[0]}` : ''}
              </span>
              <button onClick={(e) => handleRestore(e, v.version_number)} style={{ fontSize: '10px', padding: '1px 6px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '3px', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0, fontFamily: "'Inter'" }}>
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Observability Tab ─────────────────────────────────────────────────────────
function ObservabilityTab() {
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const [days, setDays] = useState(7);
  const [currentOnly, setCurrentOnly] = useState(Boolean(savedWorkflowId));
  const [summary, setSummary] = useState<ObservabilitySummary | null>(null);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [pruneLoading, setPruneLoading] = useState(false);
  const [pruneResult, setPruneResult] = useState<string | null>(null);
  const workflowId = currentOnly ? savedWorkflowId : null;

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, retentionData] = await Promise.all([
        api.getObservabilitySummary({ workflowId, days }),
        api.getObservabilityRetention().catch(() => ({ retentionDays: 30 })),
      ]);
      setSummary(summaryData);
      setRetentionDays(retentionData.retentionDays);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => setSummary(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, days]);

  const prune = async () => {
    if (!window.confirm(`Delete all finished executions older than ${retentionDays} days? This cannot be undone.`)) return;
    setPruneLoading(true);
    setPruneResult(null);
    try {
      const result = await api.pruneExecutions({
        workflowId,
        olderThanDays: retentionDays,
        statuses: ['success', 'error', 'cancelled'],
        dryRun: false,
      });
      setPruneResult(`${result.deleted} executions deleted`);
      await load();
    } catch (err: unknown) {
      setPruneResult(err instanceof Error ? err.message : 'Prune failed');
    } finally {
      setPruneLoading(false);
    }
  };

  // Compute success rate string with 1 decimal
  const successRateStr = summary
    ? `${((summary.totals.successRate ?? 0) * 100).toFixed(1)}%`
    : '—';
  const successRateTone: 'good' | 'warn' | 'bad' =
    !summary ? 'warn'
    : summary.totals.successRate >= 0.9 ? 'good'
    : summary.totals.successRate >= 0.7 ? 'warn'
    : 'bad';

  const errorCount = summary ? (summary.byStatus.error ?? 0) : 0;

  const statusRows: Array<{ label: string; count: number; color: string }> = summary
    ? [
        { label: 'Success',   count: summary.byStatus.success ?? 0,   color: 'var(--node-success)' },
        { label: 'Error',     count: summary.byStatus.error ?? 0,     color: 'var(--node-error)' },
        { label: 'Running',   count: summary.byStatus.running ?? 0,   color: 'var(--node-running)' },
        { label: 'Cancelled', count: summary.byStatus.cancelled ?? 0, color: 'var(--text-muted)' },
        { label: 'Pending',   count: summary.byStatus.pending ?? 0,   color: 'var(--accent)' },
      ].filter((s) => s.count > 0)
    : [];

  const maxStatusCount = Math.max(...statusRows.map((s) => s.count), 1);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Header */}
      <div style={settingsHeaderStyle}>
        <span>Observability</span>
        <button style={smallButtonStyle} disabled={loading} onClick={load}>{loading ? '...' : 'Refresh'}</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select style={{ ...inputStyle, flex: 1 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>Last 1 day</option>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          fontSize: '11px',
          color: savedWorkflowId ? 'var(--text-secondary)' : 'var(--text-muted)',
          opacity: savedWorkflowId ? 1 : 0.45,
          cursor: savedWorkflowId ? 'pointer' : 'not-allowed',
          userSelect: 'none',
        }}>
          <input
            type="checkbox"
            checked={currentOnly}
            disabled={!savedWorkflowId}
            onChange={(e) => setCurrentOnly(e.target.checked)}
          />
          Current
        </label>
      </div>

      {loading && !summary && (
        <div style={{ ...emptyStateStyle, opacity: 0.5 }}>Loading...</div>
      )}
      {!loading && !summary && (
        <div style={emptyStateStyle}>No execution metrics yet.</div>
      )}

      {summary && (
        <>
          {/* KPI Grid — 2×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <ObsKpiCard
              label={`Total (${days}d)`}
              value={formatInt(summary.totals.executions)}
            />
            <ObsKpiCard
              label="Success rate"
              value={successRateStr}
              tone={successRateTone}
            />
            <ObsKpiCard
              label="Avg duration"
              value={formatDuration(summary.totals.avgDurationMs)}
            />
            <ObsKpiCard
              label="Errors"
              value={formatInt(errorCount)}
              tone={errorCount > 0 ? 'bad' : 'neutral'}
            />
          </div>

          {/* Status breakdown — CSS bar chart */}
          {statusRows.length > 0 && (
            <ObsSection title="Status breakdown">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {statusRows.map((s) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <div style={{ width: '60px', fontSize: '10.5px', color: 'var(--text-secondary)', flexShrink: 0, fontFamily: 'Geist Mono' }}>
                      {s.label}
                    </div>
                    <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bg-node)', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(s.count / maxStatusCount) * 100}%`,
                        background: s.color,
                        borderRadius: '4px',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <div style={{ width: '28px', textAlign: 'right', fontSize: '10.5px', fontFamily: 'Geist Mono', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {s.count}
                    </div>
                  </div>
                ))}
              </div>
            </ObsSection>
          )}

          {/* Run trend sparkbar */}
          {summary.daily.length > 0 && (
            <ObsSection title="Run trend">
              <ObsDailyBars rows={summary.daily} />
            </ObsSection>
          )}

          {/* Slow nodes table */}
          <ObsSection title="Slow nodes (top 5)">
            {summary.slowNodes.length === 0 ? (
              <div style={emptyStateStyle}>No node timing data yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    {['Node', 'Type', 'Avg', 'P95'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Avg' || h === 'P95' ? 'right' : 'left', padding: '3px 4px', color: 'var(--text-muted)', fontFamily: 'Geist Mono', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.slowNodes.slice(0, 5).map((node) => (
                    <tr key={node.node_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '4px 4px', color: 'var(--text-primary)', fontWeight: 600, maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.node_name ?? node.node_id}>
                        {node.node_name ?? node.node_id}
                      </td>
                      <td style={{ padding: '4px 4px', color: 'var(--text-muted)', fontFamily: 'Geist Mono', fontSize: '10px' }}>
                        {node.node_type ?? '—'}
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'Geist Mono' }}>
                        {formatDuration(node.avg_duration_ms)}
                      </td>
                      <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--node-running)', fontFamily: 'Geist Mono', fontWeight: 700 }}>
                        {formatDuration(node.p95_duration_ms)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </ObsSection>

          {/* Failing nodes table */}
          <ObsSection title="Failing nodes (top 5)">
            {summary.errorNodes.length === 0 ? (
              <div style={emptyStateStyle}>No node errors in this range.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                <thead>
                  <tr>
                    {['Node', 'Type', 'Err %', 'Runs'].map((h) => (
                      <th key={h} style={{ textAlign: h === 'Err %' || h === 'Runs' ? 'right' : 'left', padding: '3px 4px', color: 'var(--text-muted)', fontFamily: 'Geist Mono', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.errorNodes.slice(0, 5).map((node) => {
                    // Approximate error rate from errorNodes errors vs slowNodes runs for same node_id
                    const slowMatch = summary.slowNodes.find((s) => s.node_id === node.node_id);
                    const totalRuns = slowMatch ? slowMatch.runs + node.errors : node.errors;
                    const errPct = totalRuns > 0 ? ((node.errors / totalRuns) * 100).toFixed(1) : '100';
                    return (
                      <tr key={node.node_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '4px 4px', color: 'var(--text-primary)', fontWeight: 600, maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={node.node_name ?? node.node_id}>
                          {node.node_name ?? node.node_id}
                        </td>
                        <td style={{ padding: '4px 4px', color: 'var(--text-muted)', fontFamily: 'Geist Mono', fontSize: '10px' }}>
                          {node.node_type ?? '—'}
                        </td>
                        <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--node-error)', fontFamily: 'Geist Mono', fontWeight: 700 }}>
                          {errPct}%
                        </td>
                        <td style={{ padding: '4px 4px', textAlign: 'right', color: 'var(--text-secondary)', fontFamily: 'Geist Mono' }}>
                          {formatInt(totalRuns)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ObsSection>

          {/* Data retention row */}
          <ObsSection title="Data retention">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', flex: 1 }}>
                Retention: <span style={{ fontFamily: 'Geist Mono', color: 'var(--node-running)', fontWeight: 700 }}>{retentionDays}d</span>
              </div>
              <button
                style={{ ...smallButtonStyle, color: 'var(--node-error)', borderColor: 'rgba(239,68,68,0.3)' }}
                disabled={pruneLoading}
                onClick={prune}
              >
                {pruneLoading ? 'Pruning...' : 'Prune now'}
              </button>
            </div>
            {pruneResult && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'Geist Mono' }}>{pruneResult}</div>
            )}
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Deletes finished executions older than {retentionDays} days. Node logs are removed with the execution.
            </div>
          </ObsSection>
        </>
      )}
    </div>
  );
}

function ObsKpiCard({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const valueColor =
    tone === 'good' ? 'var(--node-success)' :
    tone === 'warn' ? 'var(--node-running)' :
    tone === 'bad'  ? 'var(--node-error)' :
    AMBER;
  return (
    <div style={{
      background: 'var(--bg-node)',
      border: '1px solid var(--border)',
      borderRadius: '7px',
      padding: '10px 10px 8px',
      display: 'flex',
      flexDirection: 'column',
      gap: '3px',
    }}>
      <div style={{
        fontFamily: 'Geist Mono',
        fontSize: '20px',
        fontWeight: 800,
        color: valueColor,
        letterSpacing: '-0.03em',
        lineHeight: 1,
      }}>{value}</div>
      <div style={{
        fontSize: '10px',
        color: 'var(--text-muted)',
        fontFamily: 'Geist Mono',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}>{label}</div>
    </div>
  );
}

function ObsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontFamily: 'Geist Mono', fontSize: '9.5px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function ObsDailyBars({ rows }: { rows: ObservabilitySummary['daily'] }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '56px' }}>
      {rows.map((row) => {
        const hasError = row.error > 0;
        const barHeight = Math.max(4, (row.total / max) * 44);
        const label = row.day ? row.day.slice(5) : '';
        return (
          <div
            key={row.day}
            title={`${row.day}: ${row.total} total, ${row.success} ok, ${row.error} err`}
            style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}
          >
            <div style={{
              width: '100%',
              height: `${barHeight}px`,
              borderRadius: '2px 2px 1px 1px',
              background: hasError ? 'var(--node-error)' : 'var(--node-success)',
              opacity: 0.8,
            }} />
            <div style={{ fontSize: '8px', color: 'var(--text-muted)', fontFamily: 'Geist Mono', letterSpacing: '-0.02em' }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}

function formatPercent(value: number) {
  return `${Math.round((value || 0) * 100)}%`;
}

function formatDuration(ms: number) {
  if (!ms) return '0ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatInt(value: number) {
  return new Intl.NumberFormat().format(value ?? 0);
}

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

  const CRED_TYPES = ['api_key', 'basic_auth', 'bearer_token', 'smtp', 'resend', 'postgres', 'redis', 's3', 'oauth2'];

  const handleAdd = async () => {
    if (!name.trim() || !keyValue.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const value = keyValue.trim();
      let data: Record<string, string>;
      if (type === 'postgres') {
        data = { connectionString: value };
      } else if (type === 'redis') {
        data = { url: value };
      } else if (type === 's3') {
        data = { accessKeyId: value, secretAccessKey: '', region: 'us-east-1' };
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
type CredentialField = {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'number';
  placeholder?: string;
};

const CREDENTIAL_TYPE_OPTIONS = [
  { value: 'api_key', label: 'API key' },
  { value: 'bearer_token', label: 'Bearer token' },
  { value: 'basic', label: 'Basic auth' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'smtp', label: 'SMTP' },
  { value: 'resend', label: 'Resend' },
  { value: 'postgres', label: 'Postgres' },
  { value: 'redis', label: 'Redis' },
  { value: 's3', label: 'S3 compatible' },
];

function credentialFields(type: string): CredentialField[] {
  if (type === 'api_key') return [
    { key: 'header', label: 'Header', placeholder: 'Authorization' },
    { key: 'value', label: 'Value', type: 'password' },
  ];
  if (type === 'bearer_token') return [{ key: 'value', label: 'Token', type: 'password' }];
  if (type === 'basic') return [
    { key: 'username', label: 'Username' },
    { key: 'password', label: 'Password', type: 'password' },
  ];
  if (['openai', 'anthropic', 'openrouter'].includes(type)) return [{ key: 'value', label: 'API key', type: 'password' }];
  if (type === 'smtp') return [
    { key: 'host', label: 'Host', placeholder: 'smtp.example.com' },
    { key: 'port', label: 'Port', type: 'number', placeholder: '587' },
    { key: 'user', label: 'User' },
    { key: 'pass', label: 'Password', type: 'password' },
  ];
  if (type === 'resend') return [{ key: 'apiKey', label: 'API key', type: 'password' }];
  if (type === 'postgres') return [{ key: 'connectionString', label: 'Connection string', type: 'password' }];
  if (type === 'redis') return [{ key: 'url', label: 'Redis URL', type: 'password' }];
  if (type === 's3') return [
    { key: 'accessKeyId', label: 'Access key ID' },
    { key: 'secretAccessKey', label: 'Secret access key', type: 'password' },
    { key: 'region', label: 'Region', placeholder: 'us-east-1' },
    { key: 'endpoint', label: 'Endpoint', placeholder: 'https://s3.us-east-1.amazonaws.com' },
    { key: 'bucket', label: 'Default bucket' },
    { key: 'sessionToken', label: 'Session token', type: 'password' },
    { key: 'forcePathStyle', label: 'Force path style', placeholder: 'true' },
  ];
  return [{ key: 'value', label: 'Value', type: 'password' }];
}

function defaultCredentialData(type: string): Record<string, string> {
  if (type === 'api_key') return { header: 'Authorization', value: '' };
  if (type === 'smtp') return { host: '', port: '587', user: '', pass: '' };
  if (type === 's3') return { accessKeyId: '', secretAccessKey: '', region: 'us-east-1', endpoint: '', bucket: '', sessionToken: '', forcePathStyle: 'true' };
  return Object.fromEntries(credentialFields(type).map((field) => [field.key, '']));
}

function buildCredentialData(type: string, data: Record<string, string>): Record<string, string> {
  return Object.fromEntries(credentialFields(type).map((field) => [field.key, data[field.key] ?? '']));
}

function hasCredentialData(type: string, data: Record<string, string>): boolean {
  return credentialFields(type).some((field) => String(data[field.key] ?? '').trim().length > 0);
}

const VAR_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function VariablesSection() {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [varName, setVarName] = useState('');
  const [varType, setVarType] = useState('string');
  const [varValue, setVarValue] = useState('');
  const [varDesc, setVarDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const vars = await api.listVariables();
      setVariables(vars);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setVarName('');
    setVarType('string');
    setVarValue('');
    setVarDesc('');
    setAddOpen(false);
    setMsg(null);
  };

  const handleSave = async () => {
    const trimName = varName.trim();
    if (!trimName) { setMsg('Name is required.'); return; }
    if (!VAR_NAME_RE.test(trimName)) { setMsg('Name must match /^[a-zA-Z_][a-zA-Z0-9_]*$/'); return; }
    setSaving(true);
    setMsg(null);
    try {
      await api.createVariable(trimName, varValue, varType, varDesc.trim() || undefined);
      resetForm();
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete variable "${name}"?`)) return;
    try {
      await api.deleteVariable(id);
      await load();
    } catch { /* ignore */ }
  };

  const typeColor: Record<string, string> = {
    string: 'var(--text-secondary)',
    number: '#6366f1',
    boolean: '#0f766e',
    json: '#f59e0b',
  };

  return (
    <section>
      <div style={settingsHeaderStyle}>
        <span>Variables</span>
        <button style={smallButtonStyle} onClick={() => { setAddOpen((x) => !x); setMsg(null); }}>+</button>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '7px', fontFamily: "'Inter'" }}>
        Available in expressions as{' '}
        <code style={{ fontFamily: 'Geist Mono', color: '#f59e0b', background: 'rgba(245,158,11,0.1)', padding: '1px 4px', borderRadius: '3px' }}>
          {'{{ $vars.VARIABLE_NAME }}'}
        </code>
      </div>

      {addOpen && (
        <div style={panelBoxStyle}>
          <input
            style={inputStyle}
            value={varName}
            onChange={(e) => setVarName(e.target.value)}
            placeholder="VARIABLE_NAME"
          />
          <select style={inputStyle} value={varType} onChange={(e) => setVarType(e.target.value)}>
            <option value="string">string</option>
            <option value="number">number</option>
            <option value="boolean">boolean</option>
            <option value="json">json</option>
          </select>
          {varType === 'json' ? (
            <textarea
              style={{ ...inputStyle, minHeight: 64, resize: 'vertical', fontFamily: 'Geist Mono' }}
              value={varValue}
              onChange={(e) => setVarValue(e.target.value)}
              placeholder="{}"
            />
          ) : (
            <input
              style={inputStyle}
              value={varValue}
              onChange={(e) => setVarValue(e.target.value)}
              placeholder="value"
            />
          )}
          <input
            style={inputStyle}
            value={varDesc}
            onChange={(e) => setVarDesc(e.target.value)}
            placeholder="Description (optional)"
          />
          {msg && (
            <div style={{ fontSize: '11px', color: 'var(--node-error)' }}>{msg}</div>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={{ ...primaryButtonStyle, flex: 1 }} disabled={saving} onClick={handleSave}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button style={smallButtonStyle} onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {loading && <div style={emptyStateStyle}>Loading...</div>}
      {!loading && variables.length === 0 && !addOpen && <div style={emptyStateStyle}>No variables yet.</div>}
      {variables.map((v) => (
        <div key={v.id} style={listRowStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...rowTitleStyle, fontFamily: 'Geist Mono', color: '#f59e0b', fontSize: '12px' }}>
              {v.name}
            </div>
            <div style={{ ...rowMetaStyle, display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{
                padding: '1px 5px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 700,
                color: typeColor[v.type] ?? 'var(--text-muted)',
                border: `1px solid ${typeColor[v.type] ?? 'var(--border)'}`,
                fontFamily: "'Inter'",
                flexShrink: 0,
              }}>
                {v.type}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Geist Mono' }}>
                {v.value.length > 40 ? `${v.value.slice(0, 40)}…` : v.value || <em style={{ opacity: 0.5 }}>empty</em>}
              </span>
            </div>
          </div>
          <button
            style={{ ...smallButtonStyle, color: 'var(--node-error)' }}
            onClick={() => handleDelete(v.id, v.name)}
          >
            Delete
          </button>
        </div>
      ))}
    </section>
  );
}

function EvaluationsSection() {
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const [datasets, setDatasets] = useState<Array<{ id: number; name: string; description: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dsName, setDsName] = useState('');
  const [dsDesc, setDsDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listEvalDatasets() as any;
      setDatasets(Array.isArray(res) ? res : (res?.datasets ?? []));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const trimName = dsName.trim();
    if (!trimName) { setMsg('Name is required.'); return; }
    setSaving(true);
    setMsg(null);
    try {
      await api.createEvalDataset({ name: trimName, description: dsDesc.trim() || undefined });
      setDsName('');
      setDsDesc('');
      setAddOpen(false);
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete dataset "${name}"?`)) return;
    try {
      await api.deleteEvalDataset(id);
      await load();
    } catch { /* ignore */ }
  };

  const handleRunEval = async (datasetId: number) => {
    if (!savedWorkflowId) {
      alert('Open a saved workflow first to run an evaluation.');
      return;
    }
    try {
      const result = await api.startEvalRun(Number(savedWorkflowId), datasetId) as any;
      alert(`Eval run started — run ID: ${result?.evalRunId ?? '?'}`);
    } catch (err: unknown) {
      alert(`Failed to start eval run: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={settingsHeaderStyle}>
        <span>Evaluations</span>
        <button style={smallButtonStyle} onClick={() => { setAddOpen((x) => !x); setMsg(null); }}>
          New Dataset
        </button>
      </div>

      {addOpen && (
        <div style={panelBoxStyle}>
          <input
            style={inputStyle}
            value={dsName}
            onChange={(e) => setDsName(e.target.value)}
            placeholder="Dataset name"
          />
          <input
            style={inputStyle}
            value={dsDesc}
            onChange={(e) => setDsDesc(e.target.value)}
            placeholder="Description (optional)"
          />
          {msg && <div style={{ fontSize: '11px', color: 'var(--node-error)' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              style={{ ...primaryButtonStyle, flex: 1 }}
              disabled={saving}
              onClick={handleCreate}
            >
              {saving ? 'Creating...' : 'Create'}
            </button>
            <button style={smallButtonStyle} onClick={() => { setAddOpen(false); setMsg(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading && <div style={emptyStateStyle}>Loading...</div>}
      {!loading && datasets.length === 0 && !addOpen && (
        <div style={emptyStateStyle}>No eval datasets yet.</div>
      )}

      {datasets.map((ds) => (
        <div key={ds.id} style={listRowStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={rowTitleStyle}>{ds.name}</div>
            <div style={rowMetaStyle}>
              {ds.description ? `${ds.description} · ` : ''}
              {new Date(ds.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <button
            style={smallButtonStyle}
            onClick={() => handleRunEval(ds.id)}
            title={savedWorkflowId ? 'Run eval against current workflow' : 'Open a saved workflow first'}
          >
            Run
          </button>
          <button
            style={{ ...smallButtonStyle, color: 'var(--node-error)' }}
            onClick={() => handleDelete(ds.id, ds.name)}
          >
            Delete
          </button>
        </div>
      ))}
    </section>
  );
}

function SettingsTabV2() {
  const credentials = useStore((s) => s.credentials);
  const credentialsLoading = useStore((s) => s.credentialsLoading);
  const fetchCredentials = useStore((s) => s.fetchCredentials);
  const createCredential = useStore((s) => s.createCredential);
  const updateCredential = useStore((s) => s.updateCredential);
  const testCredential = useStore((s) => s.testCredential);
  const deleteCredential = useStore((s) => s.deleteCredential);
  const apiKeys = useStore((s) => s.apiKeys);
  const apiKeysLoading = useStore((s) => s.apiKeysLoading);
  const fetchApiKeys = useStore((s) => s.fetchApiKeys);
  const createApiKey = useStore((s) => s.createApiKey);
  const deleteApiKey = useStore((s) => s.deleteApiKey);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('api_key');
  const [data, setData] = useState<Record<string, string>>(defaultCredentialData('api_key'));
  const [testUrl, setTestUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [keyName, setKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [keyBusy, setKeyBusy] = useState(false);

  useEffect(() => {
    fetchCredentials();
    fetchApiKeys();
  }, [fetchCredentials, fetchApiKeys]);

  const editingCredential = editingId ? credentials.find((cred) => cred.id === editingId) : null;
  const fields = credentialFields(type);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setType('api_key');
    setData(defaultCredentialData('api_key'));
    setFormOpen(false);
    setMessage(null);
  };

  const startCreate = () => {
    setEditingId(null);
    setName('');
    setType('api_key');
    setData(defaultCredentialData('api_key'));
    setMessage(null);
    setFormOpen(true);
  };

  const startEdit = (cred: { id: string; name: string; type: string }) => {
    setEditingId(cred.id);
    setName(cred.name);
    setType(cred.type);
    setData(defaultCredentialData(cred.type));
    setMessage(null);
    setFormOpen(true);
  };

  const changeType = (nextType: string) => {
    setType(nextType);
    setData(defaultCredentialData(nextType));
  };

  const saveCredential = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const dataProvided = hasCredentialData(type, data);
    if (!editingId && !dataProvided) {
      setMessage('Credential data is required.');
      return;
    }
    if (editingCredential && editingCredential.type !== type && !dataProvided) {
      setMessage('Re-enter credential data when changing type.');
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = buildCredentialData(type, data);
      if (editingId) {
        await updateCredential(editingId, {
          name: trimmedName,
          type,
          ...(dataProvided ? { data: payload } : {}),
        });
      } else {
        await createCredential(trimmedName, type, payload);
      }
      resetForm();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Credential save failed');
    } finally {
      setSaving(false);
    }
  };

  const runCredentialTest = async (id: string) => {
    setTestingId(id);
    setMessage(null);
    try {
      const result = await testCredential(id, testUrl.trim() || undefined);
      setMessage(result.ok ? `Credential test passed (${result.checked}).` : `Credential test failed: ${result.error ?? result.status ?? result.checked}`);
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Credential test failed');
    } finally {
      setTestingId(null);
    }
  };

  const createProgrammaticKey = async () => {
    const trimmedName = keyName.trim();
    if (!trimmedName) return;
    setKeyBusy(true);
    setMessage(null);
    try {
      const key = await createApiKey(trimmedName);
      setGeneratedKey(key);
      setKeyName('');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'API key create failed');
    } finally {
      setKeyBusy(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <section>
        <div style={settingsHeaderStyle}>
          <span>Credentials</span>
          <button style={smallButtonStyle} onClick={startCreate}>Add</button>
        </div>

        {formOpen && (
          <div style={panelBoxStyle}>
            <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <select style={inputStyle} value={type} onChange={(e) => changeType(e.target.value)}>
              {CREDENTIAL_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            {fields.map((field) => (
              <input
                key={field.key}
                style={inputStyle}
                type={field.type ?? 'text'}
                value={data[field.key] ?? ''}
                placeholder={field.placeholder ?? field.label}
                onChange={(e) => setData((current) => ({ ...current, [field.key]: e.target.value }))}
              />
            ))}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={{ ...primaryButtonStyle, flex: 1 }} disabled={saving} onClick={saveCredential}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Save'}
              </button>
              <button style={smallButtonStyle} onClick={resetForm}>Cancel</button>
            </div>
          </div>
        )}

        <input
          style={{ ...inputStyle, margin: '8px 0 6px' }}
          value={testUrl}
          onChange={(e) => setTestUrl(e.target.value)}
          placeholder="Optional test URL for HTTP credentials"
        />

        {message && (
          <div style={{
            padding: '7px 8px',
            borderRadius: '5px',
            border: '1px solid var(--border)',
            color: message.includes('failed') || message.includes('required') ? 'var(--node-error)' : 'var(--node-success)',
            fontSize: '11.5px',
            marginBottom: '6px',
          }}>
            {message}
          </div>
        )}

        {credentialsLoading && <div style={emptyStateStyle}>Loading...</div>}
        {!credentialsLoading && credentials.length === 0 && <div style={emptyStateStyle}>No credentials yet.</div>}
        {credentials.map((cred) => (
          <div key={cred.id} style={listRowStyle}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={rowTitleStyle}>{cred.name}</div>
              <div style={rowMetaStyle}>{cred.type}</div>
            </div>
            <button style={smallButtonStyle} disabled={testingId === cred.id} onClick={() => runCredentialTest(cred.id)}>
              {testingId === cred.id ? '...' : 'Test'}
            </button>
            <button style={smallButtonStyle} onClick={() => startEdit(cred)}>Edit</button>
            <button
              style={{ ...smallButtonStyle, color: 'var(--node-error)' }}
              onClick={() => { if (confirm(`Delete "${cred.name}"?`)) deleteCredential(cred.id); }}
            >
              Delete
            </button>
          </div>
        ))}
      </section>

      <section>
        <div style={settingsHeaderStyle}>
          <span>API keys</span>
        </div>
        <div style={panelBoxStyle}>
          <input style={inputStyle} value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Key name" />
          <button style={primaryButtonStyle} disabled={keyBusy || !keyName.trim()} onClick={createProgrammaticKey}>
            {keyBusy ? 'Creating...' : 'Create API key'}
          </button>
          {generatedKey && (
            <textarea
              readOnly
              value={generatedKey}
              onFocus={(e) => e.currentTarget.select()}
              style={{ ...inputStyle, minHeight: 72, fontFamily: 'Geist Mono', resize: 'vertical' }}
            />
          )}
        </div>

        {apiKeysLoading && <div style={emptyStateStyle}>Loading...</div>}
        {!apiKeysLoading && apiKeys.length === 0 && <div style={emptyStateStyle}>No API keys yet.</div>}
        {apiKeys.map((key) => (
          <div key={key.id} style={listRowStyle}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={rowTitleStyle}>{key.name}</div>
              <div style={rowMetaStyle}>
                {key.key_prefix ?? key.id.slice(0, 8)} / last used {key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'never'}
              </div>
            </div>
            <button
              style={{ ...smallButtonStyle, color: 'var(--node-error)' }}
              onClick={() => { if (confirm(`Delete API key "${key.name}"?`)) deleteApiKey(key.id); }}
            >
              Delete
            </button>
          </div>
        ))}
      </section>

      <VariablesSection />

      <EvaluationsSection />

      <ExternalSecretsSection />

      <TeamSection />
    </div>
  );
}

// ── External Secrets Section ──────────────────────────────────────────────────
const PROVIDER_TYPES = [
  { value: 'aws_secrets_manager', label: 'AWS Secrets Manager' },
  { value: 'azure_key_vault', label: 'Azure Key Vault' },
  { value: 'hashicorp_vault', label: 'HashiCorp Vault' },
  { value: 'gcp_secret_manager', label: 'GCP Secret Manager' },
];

const PROVIDER_TYPE_COLOR: Record<string, string> = {
  aws_secrets_manager: '#f59e0b',
  azure_key_vault: '#6366f1',
  hashicorp_vault: '#0f766e',
  gcp_secret_manager: '#06b6d4',
};

type SecretProvider = {
  id: number;
  name: string;
  provider_type: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
};

function ExternalSecretsSection() {
  const [providers, setProviders] = useState<SecretProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [provName, setProvName] = useState('');
  const [provType, setProvType] = useState('aws_secrets_manager');
  const [vaultUrl, setVaultUrl] = useState('');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [testSecretName, setTestSecretName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.listSecretProviders();
      setProviders(res.providers);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setProvName('');
    setProvType('aws_secrets_manager');
    setVaultUrl('');
    setRegion('');
    setAddOpen(false);
    setMsg(null);
  };

  const handleAdd = async () => {
    const trimName = provName.trim();
    if (!trimName) { setMsg('Name is required.'); return; }
    setSaving(true);
    setMsg(null);
    const config: Record<string, string> = {};
    if (vaultUrl.trim()) config.vault_url = vaultUrl.trim();
    if (region.trim()) config.region = region.trim();
    try {
      await api.createSecretProvider({ name: trimName, provider_type: provType, config });
      resetForm();
      await load();
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (provider: SecretProvider) => {
    try {
      await api.updateSecretProvider(provider.id, { is_active: !provider.is_active });
      setProviders((current) => current.map((p) => p.id === provider.id ? { ...p, is_active: !p.is_active } : p));
    } catch { /* ignore */ }
  };

  const handleDelete = async (provider: SecretProvider) => {
    if (!confirm(`Delete provider "${provider.name}"?`)) return;
    try {
      await api.deleteSecretProvider(provider.id);
      setProviders((current) => current.filter((p) => p.id !== provider.id));
    } catch { /* ignore */ }
  };

  const handleTest = async (provider: SecretProvider) => {
    const name = testSecretName.trim();
    if (!name) { setMsg('Enter a secret name to test.'); return; }
    setTestingId(provider.id);
    setMsg(null);
    try {
      const result = await api.testSecretProvider(provider.id, name);
      setMsg(result.ok ? `Test passed for "${name}".` : `Test failed: ${result.error}`);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={settingsHeaderStyle}>
        <span>External Secrets</span>
        <button style={smallButtonStyle} onClick={() => { setAddOpen((x) => !x); setMsg(null); }}>Add Provider</button>
      </div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: "'Inter'", lineHeight: 1.4 }}>
        Reference credentials stored in an external vault. Values are resolved at runtime and never stored in Otto.
      </div>

      {addOpen && (
        <div style={panelBoxStyle}>
          <input
            style={inputStyle}
            value={provName}
            onChange={(e) => setProvName(e.target.value)}
            placeholder="Provider name (e.g. prod-vault)"
          />
          <select style={inputStyle} value={provType} onChange={(e) => { setProvType(e.target.value); setVaultUrl(''); setRegion(''); }}>
            {PROVIDER_TYPES.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
          </select>
          {(provType === 'hashicorp_vault' || provType === 'azure_key_vault') && (
            <input
              style={inputStyle}
              value={vaultUrl}
              onChange={(e) => setVaultUrl(e.target.value)}
              placeholder={provType === 'hashicorp_vault' ? 'Vault URL (e.g. https://vault.example.com)' : 'Key Vault URL (e.g. https://myvault.vault.azure.net)'}
            />
          )}
          {provType === 'aws_secrets_manager' && (
            <input
              style={inputStyle}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="AWS region (e.g. us-east-1)"
            />
          )}
          {msg && <div style={{ fontSize: '11px', color: 'var(--node-error)' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={{ ...primaryButtonStyle, flex: 1 }} disabled={saving} onClick={handleAdd}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button style={smallButtonStyle} onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      <input
        style={{ ...inputStyle, marginTop: '4px' }}
        value={testSecretName}
        onChange={(e) => setTestSecretName(e.target.value)}
        placeholder="Secret name for test (e.g. prod/api-key)"
      />

      {msg && !addOpen && (
        <div style={{
          padding: '6px 8px',
          borderRadius: '4px',
          border: '1px solid var(--border)',
          fontSize: '11px',
          color: msg.includes('failed') || msg.includes('required') || msg.includes('Enter') ? 'var(--node-error)' : 'var(--node-success)',
        }}>
          {msg}
        </div>
      )}

      {loading && <div style={emptyStateStyle}>Loading...</div>}
      {!loading && providers.length === 0 && !addOpen && (
        <div style={emptyStateStyle}>No external secret providers yet.</div>
      )}

      {providers.map((provider) => (
        <div key={provider.id} style={listRowStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={rowTitleStyle}>{provider.name}</div>
            <div style={{ ...rowMetaStyle, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{
                padding: '1px 5px',
                borderRadius: '3px',
                fontSize: '9.5px',
                fontWeight: 700,
                color: PROVIDER_TYPE_COLOR[provider.provider_type] ?? 'var(--text-muted)',
                border: `1px solid ${PROVIDER_TYPE_COLOR[provider.provider_type] ?? 'var(--border)'}`,
                fontFamily: "'Inter'",
                flexShrink: 0,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.04em',
              }}>
                {provider.provider_type.replace(/_/g, ' ')}
              </span>
            </div>
          </div>
          <button
            style={{ ...smallButtonStyle, fontSize: '10.5px' }}
            disabled={testingId === provider.id}
            onClick={() => handleTest(provider)}
          >
            {testingId === provider.id ? '...' : 'Test'}
          </button>
          <button
            style={{
              ...smallButtonStyle,
              fontSize: '10.5px',
              color: provider.is_active ? 'var(--node-success)' : 'var(--text-muted)',
            }}
            onClick={() => handleToggleActive(provider)}
            title={provider.is_active ? 'Active — click to disable' : 'Disabled — click to enable'}
          >
            {provider.is_active ? 'On' : 'Off'}
          </button>
          <button
            style={{ ...smallButtonStyle, color: 'var(--node-error)', fontSize: '10.5px' }}
            onClick={() => handleDelete(provider)}
          >
            Delete
          </button>
        </div>
      ))}
    </section>
  );
}

type WorkspaceMember = { id: string; email: string; name: string | null; role: string };

function TeamSection() {
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/workspace/members', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members ?? []);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newEmail.trim() || !newPassword.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/v1/workspace/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || undefined, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setNewEmail(''); setNewName(''); setNewPassword(''); setNewRole('editor');
      setAddOpen(false);
      await load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string, email: string) => {
    if (!confirm(`Remove ${email} from this workspace?`)) return;
    await fetch(`/api/v1/workspace/members/${id}`, { method: 'DELETE', credentials: 'include' });
    await load();
  };

  const handleRoleChange = async (id: string, role: string) => {
    await fetch(`/api/v1/workspace/members/${id}/role`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    await load();
  };

  const ROLE_COLOR: Record<string, string> = { owner: '#f59e0b', admin: '#6366f1', editor: 'var(--text-secondary)', viewer: 'var(--text-muted)' };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={settingsHeaderStyle}>
        <span>Team</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={smallButtonStyle} onClick={load} disabled={loading}>{loading ? '…' : 'Refresh'}</button>
          <button style={primaryButtonStyle} onClick={() => setAddOpen((x) => !x)}>+ Add member</button>
        </div>
      </div>

      {addOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', background: 'var(--bg-node)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <input style={inputStyle} value={newEmail} placeholder="Email *" onChange={(e) => setNewEmail(e.target.value)} />
          <input style={inputStyle} value={newName} placeholder="Display name (optional)" onChange={(e) => setNewName(e.target.value)} />
          <input style={inputStyle} type="password" value={newPassword} placeholder="Initial password *" onChange={(e) => setNewPassword(e.target.value)} />
          <select style={inputStyle} value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          {msg && <div style={{ fontSize: '11px', color: 'var(--node-error)' }}>{msg}</div>}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={primaryButtonStyle} disabled={busy || !newEmail.trim() || !newPassword.trim()} onClick={handleAdd}>{busy ? 'Adding…' : 'Add'}</button>
            <button style={smallButtonStyle} onClick={() => { setAddOpen(false); setMsg(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {members.map((m) => (
        <div key={m.id} style={listRowStyle}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={rowTitleStyle}>{m.email}</div>
            {m.name && <div style={rowMetaStyle}>{m.name}</div>}
          </div>
          <select
            value={m.role}
            onChange={(e) => handleRoleChange(m.id, e.target.value)}
            disabled={m.role === 'owner'}
            style={{ fontSize: '11px', padding: '2px 4px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '3px', color: ROLE_COLOR[m.role] ?? 'var(--text-secondary)', cursor: m.role === 'owner' ? 'default' : 'pointer' }}
          >
            {['owner', 'admin', 'editor', 'viewer'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {m.role !== 'owner' && (
            <button style={{ ...smallButtonStyle, color: 'var(--node-error)' }} onClick={() => handleRemove(m.id, m.email)}>Remove</button>
          )}
        </div>
      ))}
      {!loading && members.length === 0 && <div style={emptyStateStyle}>No members yet.</div>}
    </section>
  );
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MemoryTab() {
  // Stats
  const [stats, setStats] = useState<{ patternsCount: number; sessionsCount: number } | null>(null);
  const [statsError, setStatsError] = useState(false);

  // Recent interactions
  const [recentInteractions, setRecentInteractions] = useState<any[]>([]);
  const [interactionsLoading, setInteractionsLoading] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Clear
  const [clearing, setClearing] = useState(false);

  // General error
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      const data = await api.getMemoryStats();
      setStats(data);
      setStatsError(false);
    } catch {
      setStatsError(true);
    }
  };

  const loadInteractions = async () => {
    setInteractionsLoading(true);
    try {
      const data = await api.getMemoryInteractions(10);
      setRecentInteractions(Array.isArray(data) ? data : []);
    } catch {
      setRecentInteractions([]);
    } finally {
      setInteractionsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadInteractions();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const data = await api.searchMemory(searchQuery.trim(), 5);
      setSearchResults(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleClearMemory = async () => {
    if (!window.confirm('This permanently deletes all stored patterns for this workspace. Are you sure?')) return;
    setClearing(true);
    setError(null);
    try {
      await api.clearMemory();
      setStats(null);
      setRecentInteractions([]);
      setSearchResults(null);
      await loadStats();
      await loadInteractions();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setClearing(false);
    }
  };

  const statCardStyle: React.CSSProperties = {
    flex: 1,
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--bg-node)',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const statValueStyle: React.CSSProperties = {
    fontSize: '22px',
    fontWeight: 700,
    color: AMBER,
    fontFamily: "'Geist Mono'",
    lineHeight: 1,
  };

  const statLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    fontFamily: "'JetBrains Mono'",
    marginBottom: '6px',
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Header */}
      <div style={settingsHeaderStyle}>
        <span>Memory</span>
        <button style={smallButtonStyle} onClick={() => { loadStats(); loadInteractions(); }}>Refresh</button>
      </div>

      {error && (
        <div style={{ fontSize: '12px', color: 'var(--node-error)', padding: '6px 8px', borderRadius: '4px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Memory Stats */}
      <div>
        <div style={sectionLabelStyle}>Memory Stats</div>
        {statsError ? (
          <div style={{ ...emptyStateStyle, fontSize: '12px' }}>Connect to view memory stats</div>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{stats ? (stats.patternsCount ?? 0) : '—'}</div>
              <div style={statLabelStyle}>Patterns stored</div>
            </div>
            <div style={statCardStyle}>
              <div style={statValueStyle}>{stats ? (stats.sessionsCount ?? 0) : '—'}</div>
              <div style={statLabelStyle}>Sessions recorded</div>
            </div>
          </div>
        )}
      </div>

      {/* Recent Interactions */}
      <div>
        <div style={sectionLabelStyle}>Recent Interactions</div>
        {interactionsLoading && <div style={emptyStateStyle}>Loading...</div>}
        {!interactionsLoading && recentInteractions.length === 0 && (
          <div style={emptyStateStyle}>
            No memory interactions yet. Add memory_read or memory_write nodes to your workflows.
          </div>
        )}
        {!interactionsLoading && recentInteractions.map((item: any, i: number) => {
          const content: string = item.output || item.input || item.content || '';
          const preview = content.length > 60 ? content.slice(0, 60) + '…' : content;
          const sessionId: string = item.session_id ?? item.sessionId ?? '';
          const shortSession = sessionId.length > 12 ? sessionId.slice(0, 12) + '…' : sessionId;
          const ts = item.created_at ? relativeTime(item.created_at) : '';
          return (
            <div
              key={item.id ?? i}
              style={{ ...listRowStyle, flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}
            >
              <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'Geist Mono'" }}>
                  {shortSession || 'no-session'}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{ts}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {preview || '(empty)'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Search Memory */}
      <div>
        <div style={sectionLabelStyle}>Search Memory</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search stored patterns..."
          />
          <button
            style={{ ...smallButtonStyle, background: AMBER, color: '#fff', border: 'none', flexShrink: 0 }}
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
          >
            {searching ? '...' : 'Search'}
          </button>
        </div>
        {searchError && (
          <div style={{ fontSize: '11px', color: 'var(--node-error)', marginTop: '6px' }}>{searchError}</div>
        )}
        {searchResults !== null && searchResults.length === 0 && (
          <div style={{ ...emptyStateStyle, marginTop: '6px' }}>No results found.</div>
        )}
        {searchResults !== null && searchResults.map((item: any, i: number) => {
          const content: string = item.content ?? item.output ?? item.input ?? '';
          const preview = content.length > 80 ? content.slice(0, 80) + '…' : content;
          const score: number | undefined = item.similarity ?? item.score;
          const workflow: string = item.workflow_name ?? item.source_workflow ?? '';
          return (
            <div
              key={item.id ?? i}
              style={{ ...listRowStyle, flexDirection: 'column', gap: '3px', alignItems: 'flex-start', marginTop: '6px' }}
            >
              <div style={{ display: 'flex', gap: '8px', width: '100%', justifyContent: 'space-between' }}>
                {score !== undefined && (
                  <span style={{ fontSize: '10px', color: AMBER, fontWeight: 700 }}>
                    {Math.round(score * 100)}% match
                  </span>
                )}
                {workflow && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: "'Geist Mono'", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
                    {workflow}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {preview || '(empty)'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Clear Memory */}
      <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>
          Warning: This permanently deletes all stored patterns for this workspace.
        </div>
        <button
          style={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: '5px',
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--node-error)',
            cursor: clearing ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: 700,
            fontFamily: "'Inter'",
            opacity: clearing ? 0.6 : 1,
          }}
          onClick={handleClearMemory}
          disabled={clearing}
        >
          {clearing ? 'Clearing...' : 'Clear all memory'}
        </button>
      </div>
    </div>
  );
}

function MemoryRow({ title, meta, onDelete }: { title: string; meta: string; onDelete?: () => void }) {
  return (
    <div style={listRowStyle}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ ...rowTitleStyle, whiteSpace: 'normal', lineHeight: 1.35 }}>{title}</div>
        <div style={rowMetaStyle}>{meta}</div>
      </div>
      {onDelete && (
        <button style={{ ...smallButtonStyle, color: 'var(--node-error)' }} onClick={onDelete}>Delete</button>
      )}
    </div>
  );
}

const settingsHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontFamily: "'JetBrains Mono'",
  marginBottom: '7px',
};

const panelBoxStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '8px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg-sidebar)',
};

const primaryButtonStyle: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '5px',
  border: 'none',
  background: AMBER,
  color: '#fff',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 700,
  fontFamily: "'Inter'",
};

const smallButtonStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: '4px',
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontSize: '11.5px',
  fontWeight: 600,
  fontFamily: "'Inter'",
  whiteSpace: 'nowrap',
};

const listRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 0',
  borderBottom: '1px solid var(--border)',
};

const rowTitleStyle: React.CSSProperties = {
  fontSize: '12.5px',
  fontWeight: 600,
  color: 'var(--text-primary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const rowMetaStyle: React.CSSProperties = {
  fontSize: '10.5px',
  color: 'var(--text-muted)',
  fontFamily: "'JetBrains Mono'",
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const emptyStateStyle: React.CSSProperties = {
  padding: '12px 8px',
  textAlign: 'center',
  color: 'var(--text-muted)',
  fontSize: '12px',
};

export function Sidebar() {
  const setNodes = useStore((s) => s.setNodes);
  const nodes = useStore((s) => s.nodes);
  const activeSidebarTab = useStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useStore((s) => s.setActiveSidebarTab);
  const libraryFocusCategory = useStore((s) => s.libraryFocusCategory);
  const setLibraryFocusCategory = useStore((s) => s.setLibraryFocusCategory);
  const theme = useStore((s) => s.theme);
  const isDark = theme === 'dark';

  const [openCat, setOpenCat] = useState<string | null>(readStorage);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // When something elsewhere (e.g. the canvas "Start with a trigger" box) asks to
  // focus a category, switch to the library tab, expand that category, clear signal.
  useEffect(() => {
    if (!libraryFocusCategory) return;
    setActiveSidebarTab('library');
    setOpenCat(libraryFocusCategory);
    writeStorage(libraryFocusCategory);
    setLibraryFocusCategory(null);
  }, [libraryFocusCategory, setActiveSidebarTab, setLibraryFocusCategory]);

  useEffect(() => {
    if (activeSidebarTab === 'history') setActiveSidebarTab('library');
  }, [activeSidebarTab, setActiveSidebarTab]);

  const libraryMatches = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    return NODE_TYPE_DEFS.filter((def) => {
      if (!q) return true;
      const haystack = [
        def.label,
        def.type,
        def.description,
        def.tag,
        def.slug,
        def.category,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [libraryQuery]);

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
        width: '280px',
        height: '100%',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
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
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px', scrollbarGutter: 'stable' }}>
          <div style={{
            padding: '10px 10px 8px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}>
            <div style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              border: `1px solid ${searchFocused ? AMBER : 'var(--border-input)'}`,
              borderRadius: '8px',
              background: 'var(--bg-input)',
              boxShadow: searchFocused ? `0 0 0 3px ${AMBER}24` : 'none',
              transition: 'border-color 130ms ease, box-shadow 130ms ease',
            }}>
              <span style={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '10px',
                color: searchFocused ? AMBER : 'var(--text-muted)',
                transition: 'color 130ms ease',
                flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                value={libraryQuery}
                onChange={(event) => setLibraryQuery(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder="Search nodes"
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  fontFamily: "'Inter'",
                  fontSize: '12.5px',
                  outline: 'none',
                  padding: '8px 8px 8px 8px',
                }}
              />
              {libraryQuery && (
                <button
                  type="button"
                  onClick={() => setLibraryQuery('')}
                  aria-label="Clear search"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '6px',
                    padding: '3px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          {NODE_CATEGORIES.map((cat) => {
            const items = libraryMatches.filter((d) => d.category === cat.id);
            if (items.length === 0) return null;
            const isFiltering = Boolean(libraryQuery.trim());
            const isOpen = Boolean(isFiltering) || openCat === cat.id;

            const meta = CATEGORY_META[cat.id];
            const BucketIcon = meta?.Icon;

            return (
              <div key={cat.id}>
                <button
                  onClick={() => toggle(cat.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '11px 12px',
                    gap: '12px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Inter'",
                    textAlign: 'left',
                    transition: 'background 120ms ease-out',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  {BucketIcon && (
                    <span style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '1px',
                      color: 'var(--text-secondary)',
                    }}>
                      <BucketIcon size={20} weight="regular" />
                    </span>
                  )}
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{
                      fontFamily: "'Inter'",
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.006em',
                    }}>
                      {catDisplay(cat.id, cat.label)}
                    </span>
                    {meta?.description && (
                      <span style={{
                        fontFamily: "'Inter'",
                        fontSize: '11px',
                        fontWeight: 400,
                        color: 'var(--text-muted)',
                        lineHeight: 1.35,
                      }}>
                        {meta.description}
                      </span>
                    )}
                  </span>
                  <span style={{
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    marginTop: '3px',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                  }}>
                    <svg width="9" height="9" viewBox="0 0 8 8" fill="none">
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
          {libraryMatches.length === 0 && (
            <div style={{
              color: 'var(--text-muted)',
              fontSize: '12px',
              lineHeight: 1.5,
              padding: '16px 12px',
              textAlign: 'center',
            }}>
              No nodes match this search.
            </div>
          )}
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
            background: `linear-gradient(135deg, ${AMBER}, ${OTTO_AMBER_HOVER})`,
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
          </div>
          <button
            type="button"
            title="Account settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              padding: '5px',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              transition: 'background 100ms ease, color 100ms ease',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
          >
            <GearSix size={18} weight="duotone" />
          </button>
        </div>
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
        padding: '6px 10px',
        minHeight: '46px',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'background 120ms ease-out',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {NODE_SERVICE_LOGO[def.type] ? (
        <span style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          borderRadius: '6px',
          overflow: 'hidden',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
        }}>
          <ServiceLogo catalogId={NODE_SERVICE_LOGO[def.type]} name={def.label} fallbackColor={color} size={22} />
        </span>
      ) : (
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
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minWidth: 0,
        }}>
          <span style={{
            fontFamily: "'Inter'",
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {def.label}
          </span>
        </span>
        <span style={{
          color: 'var(--text-muted)',
          fontFamily: "'Inter'",
          fontSize: '10.5px',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {def.description}
        </span>
      </span>
    </div>
  );
}
