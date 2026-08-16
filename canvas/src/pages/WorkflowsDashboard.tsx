import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowsClockwise,
  CaretDown,
  Copy,
  DotsThree,
  PencilSimple,
  GridFour,
  Lightning,
  ListBullets,
  MagnifyingGlass,
  Play,
  Plus,
  Power,
  Trash,
} from '@phosphor-icons/react';
import { api } from '../api';
import { DashboardShell } from '../dashboard/DashboardShell';
import { useStore } from '../store';
import type { WorkflowListItem } from '../types';

function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return '--';
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'WF';
}

interface NewWorkflowModalProps {
  onClose: () => void;
  onCreated: (id: string) => void;
}

function NewWorkflowModal({ onClose, onCreated }: NewWorkflowModalProps) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const cleanName = name.trim();
    // `saving` guard: the Enter key handler fires regardless of the (disabled)
    // button state, so a quick double-Enter would otherwise POST two blank
    // workflows before the first request resolves.
    if (!cleanName || saving) return;

    setSaving(true);
    setError('');
    try {
      const result = await api.createWorkflow(cleanName, { nodes: [], edges: [] });
      onCreated(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create workflow');
      setSaving(false);
    }
  };

  return (
    <div className="otto-modal-backdrop" onClick={onClose}>
      <section className="otto-modal" onClick={(event) => event.stopPropagation()} aria-modal="true" role="dialog">
        <div className="otto-modal-header">
          <div>
            <h2>New workflow</h2>
            <p>Create a blank automation and open it in the editor.</p>
          </div>
          <button className="otto-icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <DotsThree size={20} />
          </button>
        </div>

        <label className="otto-field">
          <span>Workflow name</span>
          <input
            autoFocus
            value={name}
            placeholder="Customer intake router"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void handleCreate();
              if (event.key === 'Escape') onClose();
            }}
          />
        </label>

        {error && <div className="otto-inline-error">{error}</div>}

        <div className="otto-modal-actions">
          <button className="otto-button is-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="otto-button is-primary"
            type="button"
            disabled={saving || !name.trim()}
            onClick={() => void handleCreate()}
          >
            {saving ? 'Creating' : 'Create workflow'}
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteConfirmModal({ workflow, onClose, onConfirm }: {
  workflow: WorkflowListItem;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [input, setInput] = useState('');
  const matches = input === workflow.name;

  return (
    <div className="otto-modal-backdrop" onClick={onClose}>
      <section className="otto-modal otto-modal--danger" onClick={(e) => e.stopPropagation()} aria-modal="true" role="dialog">
        <div className="otto-modal-header">
          <div>
            <h2>Delete workflow</h2>
            <p>This is permanent and cannot be undone. All executions and version history will be lost.</p>
          </div>
        </div>

        <div className="otto-delete-name-chip">{workflow.name}</div>

        <label className="otto-field">
          <span>Type the workflow name to confirm</span>
          <input
            autoFocus
            value={input}
            placeholder={workflow.name}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches) onConfirm();
              if (e.key === 'Escape') onClose();
            }}
          />
        </label>

        <div className="otto-modal-actions">
          <button className="otto-button is-ghost" type="button" onClick={onClose}>Cancel</button>
          <button
            className="otto-button is-danger"
            type="button"
            disabled={!matches}
            onClick={onConfirm}
          >
            Delete workflow
          </button>
        </div>
      </section>
    </div>
  );
}

const NODE_W = 200;
const NODE_H = 60;
const SVG_W = 380;
const SVG_H = 155;
const PAD = 20;

function nodeColor(type: string): string {
  if (['webhook_trigger', 'schedule_trigger', 'manual_trigger'].includes(type)) return '#f59e0b';
  if (['llm_call', 'ai_agent', 'vector_search'].includes(type)) return '#8b5cf6';
  if (['postgres_query', 'redis_get', 'redis_set'].includes(type)) return '#06b6d4';
  return '#64748b';
}

function WorkflowMiniMap({ workflow }: { workflow: WorkflowListItem }) {
  const theme = useStore((s) => s.theme);
  const nodes = workflow.definition?.nodes ?? [];
  const edges = workflow.definition?.edges ?? [];
  const edgeColor = theme === 'dark' ? 'rgba(168,156,164,0.6)' : 'rgba(86,66,65,0.6)';

  let svgContent: ReactNode;

  if (nodes.length === 0) {
    svgContent = (
      <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" dominantBaseline="middle"
        fill="rgba(244,238,240,0.18)" fontSize="11" fontFamily="inherit">
        empty workflow
      </text>
    );
  } else {
    const validNodes = nodes.filter((n) => n.position != null);
    const xs = validNodes.map((n) => n.position.x);
    const ys = validNodes.map((n) => n.position.y);
    const bx = Math.min(...xs);
    const by = Math.min(...ys);
    const bw = Math.max(...xs) + NODE_W - bx;
    const bh = Math.max(...ys) + NODE_H - by;

    const scale = Math.min(
      (SVG_W - PAD * 2) / Math.max(bw, 1),
      (SVG_H - PAD * 2) / Math.max(bh, 1),
      0.45,
    );

    const scaledW = bw * scale;
    const scaledH = bh * scale;
    const ox = PAD + (SVG_W - PAD * 2 - scaledW) / 2;
    const oy = PAD + (SVG_H - PAD * 2 - scaledH) / 2;

    const tx = (x: number) => ox + (x - bx) * scale;
    const ty = (y: number) => oy + (y - by) * scale;
    const nw = Math.max(NODE_W * scale, 18);
    const nh = Math.max(NODE_H * scale, 8);

    const nodeMap = new Map(validNodes.map((n) => [n.id, n]));

    svgContent = (
      <>
        {edges.map((e) => {
          const src = nodeMap.get(e.source);
          const tgt = nodeMap.get(e.target);
          if (!src || !tgt || !src.position || !tgt.position) return null;
          const x1 = tx(src.position.x) + nw;
          const y1 = ty(src.position.y) + nh / 2;
          const x2 = tx(tgt.position.x);
          const y2 = ty(tgt.position.y) + nh / 2;
          const cx = (x1 + x2) / 2;
          return (
            <path key={e.id}
              d={`M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}`}
              fill="none" stroke={edgeColor} strokeWidth="1.5" strokeLinecap="round"
            />
          );
        })}
        {validNodes.map((n) => {
          const color = nodeColor(n.type);
          return (
            <rect key={n.id}
              x={tx(n.position.x)} y={ty(n.position.y)}
              width={nw} height={nh} rx={3}
              fill={color} fillOpacity={0.5}
              stroke={color} strokeOpacity={0.4} strokeWidth={0.5}
            />
          );
        })}
      </>
    );
  }

  return (
    <div className="workflow-minimap" aria-hidden="true">
      <div className="workflow-minimap-grid" />
      <svg className="workflow-minimap-svg" viewBox={`0 0 ${SVG_W} ${SVG_H}`} preserveAspectRatio="xMidYMid meet">
        {svgContent}
      </svg>
      <div className="workflow-minimap-footer">
        <span className={workflow.active ? 'status-dot is-on' : 'status-dot'} />
        <span>{workflow.active ? 'active workflow' : 'draft workflow'}</span>
      </div>
    </div>
  );
}

interface WorkflowCardProps {
  workflow: WorkflowListItem;
  menuOpen: boolean;
  onMenuToggle: (event: MouseEvent<HTMLButtonElement>, workflow: WorkflowListItem) => void;
  onOpen: (workflow: WorkflowListItem) => void;
  onRun: (event: MouseEvent<HTMLButtonElement>, workflow: WorkflowListItem) => void;
  onDuplicate: (workflow: WorkflowListItem) => void;
  onDelete: (workflow: WorkflowListItem) => void;
  onToggleActive: (workflow: WorkflowListItem) => void;
}

function WorkflowActionsMenu({
  workflow,
  onOpen,
  onRun,
  onDuplicate,
  onDelete,
  onToggleActive,
}: {
  workflow: WorkflowListItem;
  onOpen: (workflow: WorkflowListItem) => void;
  onRun: (event: MouseEvent<HTMLButtonElement>, workflow: WorkflowListItem) => void;
  onDuplicate: (workflow: WorkflowListItem) => void;
  onDelete: (workflow: WorkflowListItem) => void;
  onToggleActive: (workflow: WorkflowListItem) => void;
}) {
  return (
    <div className="otto-workflow-menu" role="menu" onClick={(event) => event.stopPropagation()}>
      <button type="button" role="menuitem" onClick={() => onOpen(workflow)}>
        <PencilSimple size={15} />
        Open editor
      </button>
      <button type="button" role="menuitem" onClick={() => onDuplicate(workflow)}>
        <Copy size={15} />
        Duplicate
      </button>
      <button type="button" role="menuitem" onClick={() => onToggleActive(workflow)}>
        <Power size={15} />
        {workflow.active ? 'Deactivate' : 'Activate'}
      </button>
      <button className="is-danger" type="button" role="menuitem" onClick={() => onDelete(workflow)}>
        <Trash size={15} />
        Delete
      </button>
    </div>
  );
}

function WorkflowCard({
  workflow,
  menuOpen,
  onMenuToggle,
  onOpen,
  onRun,
  onDuplicate,
  onDelete,
  onToggleActive,
}: WorkflowCardProps) {
  return (
    <article className="otto-workflow-card" onClick={() => onOpen(workflow)}>
      <div className="otto-workflow-card-header">
        <div>
          <h3>{workflow.name}</h3>
          <p>Updated {timeAgo(workflow.updated_at)}</p>
        </div>
        <div className="otto-workflow-menu-wrap">
          <button
            className="otto-icon-button"
            type="button"
            aria-label="Workflow actions"
            aria-expanded={menuOpen}
            onClick={(event) => onMenuToggle(event, workflow)}
          >
            <DotsThree size={18} />
          </button>
          {menuOpen && (
            <WorkflowActionsMenu
              workflow={workflow}
              onOpen={onOpen}
              onRun={onRun}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              onToggleActive={onToggleActive}
            />
          )}
        </div>
      </div>

      <WorkflowMiniMap workflow={workflow} />

      <div className="otto-workflow-card-footer">
        <div className="otto-tag-list">
          {/* Show only REAL tags. This used to fall back to a fabricated 'automation'
              pill for untagged workflows, which contradicted the list view ("No tags")
              and the "N tags across this workspace" count — and, worse, displayed a tag
              that search could never match, because filtering runs on workflow.tags. */}
          {workflow.tags?.length
            ? workflow.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)
            : <span className="otto-tag-empty">No tags</span>}
        </div>
      </div>
    </article>
  );
}

function WorkflowRow({
  workflow,
  menuOpen,
  onMenuToggle,
  onOpen,
  onRun,
  onDuplicate,
  onDelete,
  onToggleActive,
}: {
  workflow: WorkflowListItem;
  menuOpen: boolean;
  onMenuToggle: (event: MouseEvent<HTMLButtonElement>, workflow: WorkflowListItem) => void;
  onOpen: (workflow: WorkflowListItem) => void;
  onRun: (event: MouseEvent<HTMLButtonElement>, workflow: WorkflowListItem) => void;
  onDuplicate: (workflow: WorkflowListItem) => void;
  onDelete: (workflow: WorkflowListItem) => void;
  onToggleActive: (workflow: WorkflowListItem) => void;
}) {
  return (
    <div
      className="otto-workflow-row"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(workflow)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(workflow);
        }
      }}
    >
      <span className="otto-row-mark">{initials(workflow.name).slice(0, 2)}</span>
      <span className="otto-row-main">
        <strong>{workflow.name}</strong>
        <small>{workflow.tags?.join(', ') || 'No tags'}</small>
      </span>
      <span className={workflow.active ? 'otto-row-status is-active' : 'otto-row-status'}>
        {workflow.active ? 'Active' : 'Draft'}
      </span>
      <span className="otto-row-meta">{formatDate(workflow.updated_at)}</span>
      <span className="otto-workflow-menu-wrap">
        <button
          type="button"
          className="otto-row-run"
          aria-label="Workflow actions"
          aria-expanded={menuOpen}
          onClick={(event) => onMenuToggle(event, workflow)}
        >
          <DotsThree size={16} />
        </button>
        {menuOpen && (
          <WorkflowActionsMenu
            workflow={workflow}
            onOpen={onOpen}
            onRun={onRun}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onToggleActive={onToggleActive}
          />
        )}
      </span>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: 'recent' as const, label: 'Recent activity' },
  { value: 'name' as const, label: 'Name' },
];

function SortDropdown({ value, onChange }: { value: 'recent' | 'name'; onChange: (v: 'recent' | 'name') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.value === value)?.label ?? '';

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
      <button className="otto-sort-trigger" type="button" onClick={() => setOpen((o) => !o)}>
        {current}
        <CaretDown size={13} />
      </button>
      {open && (
        <div className="otto-sort-menu" role="listbox">
          {SORT_OPTIONS.map((opt) => (
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

export function WorkflowsDashboard() {
  const navigate = useNavigate();
  const deleteSavedWorkflow = useStore((s) => s.deleteWorkflow);
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [showNewModal, setShowNewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowListItem | null>(null);
  const [runMessage, setRunMessage] = useState('');
  const [runMessageType, setRunMessageType] = useState<'info' | 'error'>('info');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Refresh icon animation — all via refs, zero re-renders
  const refreshSpanRef = useRef<HTMLSpanElement>(null);
  const rotRef   = useRef(0);           // tracked rotation in degrees
  const rafRef   = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const isSpinningRef = useRef(false);

  // Read the element's current visual angle (works mid-transition too)
  const readAngle = (): number => {
    const el = refreshSpanRef.current;
    if (!el) return rotRef.current;
    const t = window.getComputedStyle(el).transform;
    if (!t || t === 'none') return rotRef.current;
    const m = new DOMMatrix(t);
    return Math.atan2(m.m12, m.m11) * (180 / Math.PI);
  };

  // Freeze element at its current visual position and kill any transition
  const freeze = () => {
    const el = refreshSpanRef.current;
    if (!el) return;
    if (rafRef.current === null) rotRef.current = readAngle(); // sync if not RAF-driven
    el.style.transition = 'none';
    el.style.transform = `rotate(${rotRef.current}deg)`;
    el.getAnimations().forEach(a => a.cancel());
  };

  // Smooth transition to a target angle (caller must call freeze() first)
  const slideTo = (to: number, ms: number) => {
    const el = refreshSpanRef.current;
    if (!el) return;
    void el.offsetWidth; // flush so browser picks up the frozen position
    el.style.transition = `transform ${ms}ms ease-out`;
    el.style.transform = `rotate(${to}deg)`;
  };

  // Stop RAF spin
  const stopSpin = () => {
    if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    lastTsRef.current = null;
  };

  const handleRefreshEnter = () => {
    if (isSpinningRef.current) return;
    freeze();
    slideTo(120, 350);
  };

  const handleRefreshLeave = () => {
    if (isSpinningRef.current) return;
    freeze();
    slideTo(0, 350);
    rotRef.current = 0;
  };

  const handleRefreshClick = async () => {
    if (isSpinningRef.current) return;
    isSpinningRef.current = true;

    const el = refreshSpanRef.current;
    if (el) {
      freeze(); // capture current visual angle into rotRef
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

    setLoading(true);
    try {
      const list = await api.listWorkflows(100);
      setWorkflows(list);
    } catch {
      setWorkflows([]);
    } finally {
      setLoading(false);
    }

    stopSpin();

    if (el) {
      const from = rotRef.current;
      const to   = Math.floor(from / 360) * 360; // nearest 0° going CCW
      const dist = Math.abs(to - from);
      const dur  = Math.max((dist / 360) * 700, 180);

      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        el.style.transition = 'none';
        el.style.transform  = 'rotate(0deg)';
        rotRef.current = 0;
        isSpinningRef.current = false;
      };

      if (dist < 1) { finish(); return; }

      slideTo(to, dur);
      el.addEventListener('transitionend', finish, { once: true });
      window.setTimeout(finish, dur + 150); // fallback
    } else {
      isSpinningRef.current = false;
    }
  };

  const toast = (msg: string, type: 'info' | 'error' = 'info', ms = 3500) => {
    setRunMessage(msg);
    setRunMessageType(type);
    window.setTimeout(() => setRunMessage(''), ms);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listWorkflows(100);
      setWorkflows(list);
    } catch (e) {
      setWorkflows([]);
      toast(e instanceof Error ? e.message : 'Could not load workflows', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setOpenMenuId(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenuId(null);
    };

    document.addEventListener('click', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = workflows.filter((workflow) => {
      if (!query) return true;
      const tagText = workflow.tags?.join(' ').toLowerCase() ?? '';
      return workflow.name.toLowerCase().includes(query) || tagText.includes(query);
    });

    return [...matches].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [search, sort, workflows]);

  const tagCount = new Set(workflows.flatMap((workflow) => workflow.tags ?? [])).size;

  const openWorkflow = (workflow: WorkflowListItem) => {
    navigate(`/app/editor/${workflow.id}`);
  };

  const runWorkflow = async (event: MouseEvent<HTMLButtonElement>, workflow: WorkflowListItem) => {
    event.stopPropagation();
    setOpenMenuId(null);
    setRunMessage(`Running ${workflow.name}...`);
    try {
      await api.executeSaved(workflow.id);
      toast(`${workflow.name} queued`);
    } catch (e) {
      toast(e instanceof Error ? e.message : `Could not run ${workflow.name}`, 'error');
    }
  };

  const toggleMenu = (event: MouseEvent<HTMLButtonElement>, workflow: WorkflowListItem) => {
    event.preventDefault();
    event.stopPropagation();
    setOpenMenuId((id) => (id === workflow.id ? null : workflow.id));
  };

  const duplicateWorkflow = async (workflow: WorkflowListItem) => {
    setOpenMenuId(null);
    toast(`Duplicating ${workflow.name}...`);
    try {
      await api.duplicateWorkflow(workflow.id);
      await load();
      toast(`${workflow.name} duplicated`);
    } catch (e) {
      toast(e instanceof Error ? e.message : `Could not duplicate ${workflow.name}`, 'error');
    }
  };

  const deleteWorkflow = (workflow: WorkflowListItem) => {
    setOpenMenuId(null);
    setDeleteTarget(workflow);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const workflow = deleteTarget;
    setDeleteTarget(null);
    toast(`Deleting ${workflow.name}...`);
    try {
      await deleteSavedWorkflow(workflow.id);
      setWorkflows((items) => items.filter((item) => item.id !== workflow.id));
      toast(`${workflow.name} deleted`);
    } catch (e) {
      toast(e instanceof Error ? e.message : `Could not delete ${workflow.name}`, 'error');
    }
  };

  const toggleWorkflowActive = async (workflow: WorkflowListItem) => {
    setOpenMenuId(null);
    const nextActive = !workflow.active;
    toast(`${nextActive ? 'Activating' : 'Deactivating'} ${workflow.name}...`);
    try {
      await api.updateWorkflow(workflow.id, { active: nextActive });
      setWorkflows((items) =>
        items.map((item) => (item.id === workflow.id ? { ...item, active: nextActive } : item))
      );
      toast(`${workflow.name} ${nextActive ? 'activated' : 'deactivated'}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : `Could not update ${workflow.name}`, 'error');
    }
  };

  const handleCreated = (id: string) => {
    setShowNewModal(false);
    navigate(`/app/editor/${id}`);
  };

  return (
    <DashboardShell>
      <section className="otto-page-hero">
        <div>
          <span className="otto-title-bar" aria-hidden="true" />
          <h1>Workflows</h1>
          <p className="otto-hero-copy">
            Manage runnable automations, check status, and open the editor without losing operational context.
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
              <ArrowsClockwise size={16} />
            </span>
          </button>
          <button className="otto-button is-primary otto-btn-new" type="button" onClick={() => setShowNewModal(true)}>
            <Plus size={16} weight="bold" />
            New workflow
          </button>
        </div>
      </section>

      <section className="otto-resource-panel">
        <div className="otto-resource-toolbar">
          <div>
            <h2>{filtered.length} {filtered.length === 1 ? 'workflow' : 'workflows'}</h2>
            <p>{tagCount || 0} tags across this workspace</p>
          </div>

          <div className="otto-toolbar-controls">
            <label className="otto-search">
              <MagnifyingGlass size={17} />
              <input
                value={search}
                placeholder="Search workflows or tags"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <SortDropdown value={sort} onChange={setSort} />

            <div className="otto-view-toggle" aria-label="View mode">
              <button className={view === 'grid' ? 'is-active' : ''} type="button" onClick={() => setView('grid')} aria-label="Grid view">
                <GridFour size={16} />
              </button>
              <button className={view === 'list' ? 'is-active' : ''} type="button" onClick={() => setView('list')} aria-label="List view">
                <ListBullets size={16} />
              </button>
            </div>
          </div>
        </div>

        {runMessage && (
          <div className={`otto-run-toast${runMessageType === 'error' ? ' is-error' : ''}`}>{runMessage}</div>
        )}

        {loading ? (
          <div className="otto-workflow-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div className="otto-workflow-skeleton" key={index} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="otto-empty-state">
            <Lightning size={36} weight="duotone" />
            <h3>{search.trim() ? 'No matching workflows' : 'No workflows yet'}</h3>
            <p>{search.trim() ? 'Try a different workflow name or tag.' : 'Create the first workflow for this workspace.'}</p>
            {!search.trim() && (
              <button className="otto-button is-primary" type="button" onClick={() => setShowNewModal(true)}>
                <Plus size={16} weight="bold" />
                Create workflow
              </button>
            )}
          </div>
        ) : view === 'grid' ? (
          <div className="otto-workflow-grid">
            {filtered.map((workflow, index) => (
              <WorkflowCard
                key={workflow.id}
                workflow={workflow}
                menuOpen={openMenuId === workflow.id}
                onMenuToggle={toggleMenu}
                onOpen={openWorkflow}
                onRun={runWorkflow}
                onDuplicate={duplicateWorkflow}
                onDelete={deleteWorkflow}
                onToggleActive={toggleWorkflowActive}
              />
            ))}
          </div>
        ) : (
          <div className="otto-workflow-list">
            {filtered.map((workflow) => (
              <WorkflowRow
                key={workflow.id}
                workflow={workflow}
                menuOpen={openMenuId === workflow.id}
                onMenuToggle={toggleMenu}
                onOpen={openWorkflow}
                onRun={runWorkflow}
                onDuplicate={duplicateWorkflow}
                onDelete={deleteWorkflow}
                onToggleActive={toggleWorkflowActive}
              />
            ))}
          </div>
        )}
      </section>

      {showNewModal && (
        <NewWorkflowModal onClose={() => setShowNewModal(false)} onCreated={handleCreated} />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          workflow={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDelete()}
        />
      )}
    </DashboardShell>
  );
}
