import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore, buildDefinition } from '../store';
import { api } from '../api';
import type { WorkflowSettings } from '../types';

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

function WorkflowSettingsModal({
  settings,
  workflowList,
  onSave,
  onClose,
}: {
  settings: WorkflowSettings;
  workflowList: Array<{ id: string; name: string }>;
  onSave: (patch: Partial<WorkflowSettings>) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<WorkflowSettings>({ ...settings });
  const backdropRef = useRef<HTMLDivElement>(null);

  const set = (key: keyof WorkflowSettings, value: unknown) =>
    setLocal((prev) => ({ ...prev, [key]: value }));

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: "'Inter'",
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    letterSpacing: '0.02em',
    marginBottom: '5px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: "'Inter'",
    fontSize: '13px',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-input)',
    borderRadius: '5px',
    padding: '7px 10px',
    color: 'var(--text-primary)',
    boxSizing: 'border-box',
  };
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2371717a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: '28px',
  };
  const helperStyle: React.CSSProperties = {
    marginTop: '4px',
    color: 'var(--text-muted)',
    fontSize: '11px',
    lineHeight: 1.35,
  };

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '440px',
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: 'var(--shadow-main)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.012em' }}>
            Workflow Settings
          </span>
          <button
            onClick={onClose}
            style={{
              width: '24px', height: '24px', borderRadius: '4px', border: 'none',
              background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Timezone */}
          <div>
            <label style={labelStyle}>Timezone</label>
            <input
              style={inputStyle}
              value={local.timezone}
              placeholder="UTC"
              onChange={(e) => set('timezone', e.target.value)}
            />
            <div style={helperStyle}>IANA timezone name. Used for schedule triggers and time-based expressions. E.g. America/New_York</div>
          </div>

          {/* Execution timeout */}
          <div>
            <label style={labelStyle}>Execution timeout (seconds)</label>
            <input
              type="number"
              min={0}
              max={3600}
              style={inputStyle}
              value={local.timeoutSeconds ?? ''}
              placeholder="No timeout"
              onChange={(e) => set('timeoutSeconds', e.target.value ? Math.max(1, parseInt(e.target.value, 10)) : null)}
            />
            <div style={helperStyle}>Max seconds a workflow run may take before being cancelled. Leave empty for no limit.</div>
          </div>

          {/* Error workflow */}
          <div>
            <label style={labelStyle}>Error workflow</label>
            <select
              style={selectStyle}
              value={local.errorWorkflowId ?? ''}
              onChange={(e) => set('errorWorkflowId', e.target.value || null)}
            >
              <option value="">None — don't run on failure</option>
              {workflowList.map((wf) => (
                <option key={wf.id} value={wf.id}>{wf.name}</option>
              ))}
            </select>
            <div style={helperStyle}>Workflow to run automatically when this workflow fails. Receives failure context as input.</div>
          </div>

          {/* Caller policy */}
          <div>
            <label style={labelStyle}>Caller policy</label>
            <select
              style={selectStyle}
              value={local.callerPolicy ?? 'any'}
              onChange={(e) => set('callerPolicy', e.target.value as WorkflowSettings['callerPolicy'])}
            >
              <option value="any">Any workflow can call this</option>
              <option value="same_workspace">Same workspace only</option>
              <option value="none">Cannot be called as sub-workflow</option>
            </select>
            <div style={helperStyle}>Controls which workflows can invoke this as a sub-workflow.</div>
          </div>

          {/* Save policy */}
          <div>
            <label style={{ ...labelStyle, marginBottom: '10px' }}>Execution data retention</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {([
                { key: 'saveOnSuccess' as const, label: 'Save successful executions', description: 'Retain full input/output data for runs that complete without errors.' },
                { key: 'saveOnError' as const, label: 'Save failed executions', description: 'Always retain data when a workflow errors, regardless of success setting.' },
                { key: 'saveManual' as const, label: 'Save manual runs', description: 'Save data when the workflow is triggered via the Run button or API.' },
              ] as const).map(({ key, label, description }) => (
                <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={local[key]}
                    onChange={(e) => set(key, e.target.checked)}
                    style={{ marginTop: '2px', accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <span>
                    <span style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</span>
                    <span style={{ display: 'block', marginTop: '2px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.35 }}>{description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
          padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: '5px', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: '12px', fontFamily: "'Inter'", fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(local); onClose(); }}
            style={{
              padding: '6px 14px', background: AMBER, border: 'none',
              borderRadius: '5px', color: '#fff', cursor: 'pointer',
              fontSize: '12px', fontFamily: "'Inter'", fontWeight: 600,
            }}
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}

export function Toolbar() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const pinnedData = useStore((s) => s.pinnedData);
  const executionPhase = useStore((s) => s.executionPhase);
  const runExecution = useStore((s) => s.runExecution);
  const cancelExecution = useStore((s) => s.cancelExecution);
  const workflowName = useStore((s) => s.workflowName);
  const setWorkflowName = useStore((s) => s.setWorkflowName);
  const workflowVersion = useStore((s) => s.workflowVersion);
  const workflowActive = useStore((s) => s.workflowActive);
  const setWorkflowActive = useStore((s) => s.setWorkflowActive);
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const saveWorkflow = useStore((s) => s.saveWorkflow);
  const loadWorkflow = useStore((s) => s.loadWorkflow);
  const fetchWorkflows = useStore((s) => s.fetchWorkflows);
  const isSaving = useStore((s) => s.isSaving);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const workflowSettings = useStore((s) => s.workflowSettings);
  const updateWorkflowSettings = useStore((s) => s.updateWorkflowSettings);
  const workflowList = useStore((s) => s.workflowList);

  const [btnState, setBtnState] = useState<BtnState>('idle');
  const [editingName, setEditingName] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
    if (btnState === 'running') {
      await cancelExecution();
      return;
    }
    await runExecution('full');
  }, [btnState, cancelExecution, runExecution]);

  const handleSave = useCallback(async () => {
    await saveWorkflow();
  }, [saveWorkflow]);

  const handleActiveToggle = useCallback(async () => {
    try {
      await setWorkflowActive(!workflowActive);
    } catch (err: unknown) {
      alert(`Activation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [setWorkflowActive, workflowActive]);

  const handleDuplicateWorkflow = useCallback(async () => {
    try {
      const definition = buildDefinition(nodes, edges, pinnedData);
      const { id } = await api.createWorkflow(`${workflowName} Copy`, definition);
      await loadWorkflow(id);
      fetchWorkflows();
    } catch (err: unknown) {
      alert(`Duplicate failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [nodes, edges, pinnedData, workflowName, loadWorkflow, fetchWorkflows]);

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
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ ...iconBtn }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          {theme === 'dark' ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        {/* Active toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Toggle on={workflowActive} onToggle={handleActiveToggle} />
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
          disabled={workflowActive && btnState !== 'running'}
          style={{
            padding: '7px 14px',
            background: btnState === 'success' ? 'var(--node-success)' : btnState === 'error' ? 'var(--node-error)' : AMBER,
            border: 'none',
            color: '#fff',
            fontFamily: 'Inter',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '5px',
            cursor: (workflowActive && btnState !== 'running') ? 'not-allowed' : 'pointer',
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
          {btnState === 'running' ? 'Stop' : btnState === 'success' ? 'Done' : btnState === 'error' ? 'Failed' : 'Run'}
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
                { label: 'Duplicate workflow', action: handleDuplicateWorkflow },
                { label: 'Workflow settings', action: () => setSettingsOpen(true) },
                {
                  label: 'Export JSON',
                  action: () => {
                    const def = buildDefinition(nodes, edges, pinnedData);
                    const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${workflowName.replace(/\s+/g, '-').toLowerCase()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  },
                },
                {
                  label: 'Sign out',
                  action: async () => {
                    await api.logout().catch(() => null);
                    window.location.reload();
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

      {settingsOpen && (
        <WorkflowSettingsModal
          settings={workflowSettings}
          workflowList={workflowList}
          onSave={updateWorkflowSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </header>
  );
}
