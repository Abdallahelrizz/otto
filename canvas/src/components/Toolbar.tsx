import { useCallback, useEffect, useState } from 'react';
import { useStore, buildDefinition } from '../store';
import { api } from '../api';

type BtnState = 'idle' | 'running' | 'success' | 'error';

const AMBER = '#FF6F1A';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 32,
        height: 18,
        borderRadius: 10,
        background: on ? 'var(--live)' : 'var(--border-input)',
        border: 'none',
        cursor: 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 150ms ease',
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2,
        left: on ? 'calc(100% - 16px)' : 2,
        width: 14,
        height: 14,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left 150ms ease',
        display: 'block',
      }} />
    </button>
  );
}

export function Toolbar() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const executionPhase = useStore((s) => s.executionPhase);
  const setExecutionStarted = useStore((s) => s.setExecutionStarted);
  const setNodeExecutions = useStore((s) => s.setNodeExecutions);
  const resetExecution = useStore((s) => s.resetExecution);
  const startSSE = useStore((s) => s.startSSE);
  const workflowName = useStore((s) => s.workflowName);
  const setWorkflowName = useStore((s) => s.setWorkflowName);
  const workflowVersion = useStore((s) => s.workflowVersion);
  const workflowActive = useStore((s) => s.workflowActive);
  const setWorkflowActive = useStore((s) => s.setWorkflowActive);
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const saveWorkflow = useStore((s) => s.saveWorkflow);
  const isSaving = useStore((s) => s.isSaving);

  const [btnState, setBtnState] = useState<BtnState>('idle');
  const [editingName, setEditingName] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (executionPhase === 'running') {
      setBtnState('running');
    } else if (executionPhase === 'success') {
      setBtnState('success');
      const t = setTimeout(() => setBtnState('idle'), 3000);
      return () => clearTimeout(t);
    } else if (executionPhase === 'error') {
      setBtnState('error');
      const t = setTimeout(() => setBtnState('idle'), 3000);
      return () => clearTimeout(t);
    } else {
      setBtnState('idle');
    }
  }, [executionPhase]);

  const handleRun = useCallback(async () => {
    if (btnState === 'running' || workflowActive) return;
    resetExecution();
    const definition = buildDefinition(nodes, edges);
    if (definition.nodes.length === 0) { alert('Add some nodes first.'); return; }
    try {
      let executionId: string;
      if (savedWorkflowId) {
        const res = await api.executeSaved(savedWorkflowId);
        executionId = res.executionId;
      } else {
        const res = await api.execute(definition);
        executionId = res.executionId;
      }
      setExecutionStarted(executionId);
      startSSE(executionId);
      // Load initial snapshot via REST as a fallback
      setTimeout(async () => {
        try {
          const data = await api.getExecution(executionId);
          setNodeExecutions(data.nodes);
        } catch {}
      }, 800);
    } catch (err: unknown) {
      alert(`Run failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [nodes, edges, btnState, workflowActive, savedWorkflowId]);

  const handleSave = useCallback(async () => {
    await saveWorkflow();
  }, [saveWorkflow]);

  const iconBtn: React.CSSProperties = {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '5px',
    border: '1px solid var(--border)',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    transition: 'background 0.1s ease, color 0.1s ease',
    flexShrink: 0,
  };

  return (
    <header
      style={{
        height: '54px',
        flexShrink: 0,
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '0 16px',
      }}
    >
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, flex: 1 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><line x1="6" y1="15" x2="6" y2="3"/><line x1="18" y1="21" x2="18" y2="9"/><line x1="6" y1="3" x2="18" y2="3"/>
        </svg>
        <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', letterSpacing: '-0.005em', fontWeight: 500, whiteSpace: 'nowrap' }}>Workflows</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>/</span>

        {/* Editable workflow name */}
        {editingName ? (
          <input
            autoFocus
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false); }}
            style={{
              fontFamily: "'Inter'",
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '-0.012em',
              color: 'var(--text-primary)',
              background: 'var(--bg-input)',
              border: `1px solid ${AMBER}`,
              borderRadius: '4px',
              padding: '2px 7px',
              minWidth: '120px',
              maxWidth: '220px',
            }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            style={{
              fontFamily: "'Inter'",
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '-0.012em',
              color: 'var(--text-primary)',
              background: 'none',
              border: 'none',
              cursor: 'text',
              padding: '2px 4px',
              borderRadius: '4px',
              transition: 'background 0.1s ease',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '200px',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
          >
            {workflowName}
          </button>
        )}

        {/* Version pill */}
        <span style={{
          fontFamily: "'JetBrains Mono'",
          fontSize: '9.5px',
          color: 'var(--text-muted)',
          letterSpacing: '0.06em',
          fontWeight: 600,
          marginLeft: '4px',
          padding: '2px 6px',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {workflowVersion}
        </span>

        {/* Unsaved indicator */}
        {!savedWorkflowId && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 4 }}>unsaved</span>
        )}
      </div>

      {/* Right side controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        {/* Active toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Toggle on={workflowActive} onToggle={() => setWorkflowActive(!workflowActive)} />
          <span style={{
            fontSize: '12.5px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            letterSpacing: '-0.005em',
          }}>
            Active
          </span>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 11px',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: isSaving ? 'var(--text-muted)' : 'var(--text-primary)',
            fontFamily: 'Inter',
            fontSize: '12px',
            fontWeight: 500,
            borderRadius: '5px',
            cursor: isSaving ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.005em',
            height: '30px',
            transition: 'background 0.1s ease',
          }}
          onMouseEnter={(e) => { if (!isSaving) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
          </svg>
          {isSaving ? 'Saving…' : 'Save'}
        </button>

        {/* Run */}
        <button
          onClick={handleRun}
          disabled={btnState === 'running' || workflowActive}
          style={{
            padding: '7px 14px',
            background: btnState === 'success' ? 'var(--node-success)' : btnState === 'error' ? 'var(--node-error)' : AMBER,
            border: 'none',
            color: '#fff',
            fontFamily: 'Inter',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '5px',
            cursor: (btnState === 'running' || workflowActive) ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.005em',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            opacity: workflowActive ? 0.5 : 1,
            transition: 'background 0.2s ease, opacity 0.2s ease',
          }}
        >
          {btnState === 'running' && (
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'otto-spin 0.7s linear infinite', display: 'inline-block' }} />
          )}
          {btnState === 'running' ? 'Running…' : btnState === 'success' ? '✓ Done' : btnState === 'error' ? '✗ Failed' : 'Run'}
        </button>

        {/* More (⋯) */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMoreOpen((x) => !x)}
            style={iconBtn}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>
            </svg>
          </button>

          {moreOpen && (
            <div
              style={{
                position: 'absolute',
                top: '36px',
                right: 0,
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: '7px',
                padding: '4px',
                minWidth: '160px',
                boxShadow: 'var(--shadow-main)',
                zIndex: 50,
              }}
              onMouseLeave={() => setMoreOpen(false)}
            >
              {[
                { label: 'Duplicate workflow', action: () => {} },
                {
                  label: 'Export JSON',
                  action: () => {
                    const def = buildDefinition(nodes, edges);
                    const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${workflowName.replace(/\s+/g, '-').toLowerCase()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  },
                },
              ].map(({ label, action }) => (
                <button
                  key={label}
                  onClick={() => { action(); setMoreOpen(false); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '7px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12.5px',
                    fontFamily: "'Inter'",
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.005em',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
