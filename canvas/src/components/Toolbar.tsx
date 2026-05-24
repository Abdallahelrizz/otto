import { useCallback, useEffect, useRef, useState } from 'react';
import { Sun, Moon, Settings } from 'lucide-react';
import { useStore, buildDefinition } from '../store';
import { api } from '../api';

type BtnState = 'idle' | 'running' | 'success' | 'error';

export function Toolbar() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const executionPhase = useStore((s) => s.executionPhase);
  const executionId = useStore((s) => s.executionId);
  const setExecutionStarted = useStore((s) => s.setExecutionStarted);
  const setNodeExecutions = useStore((s) => s.setNodeExecutions);
  const setExecutionPhase = useStore((s) => s.setExecutionPhase);
  const resetExecution = useStore((s) => s.resetExecution);
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const workflowName = useStore((s) => s.workflowName);
  const setWorkflowName = useStore((s) => s.setWorkflowName);

  const [btnState, setBtnState] = useState<BtnState>('idle');
  const [editingName, setEditingName] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

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

  useEffect(() => {
    if (executionPhase !== 'running' || !executionId) { stopPolling(); return; }

    pollRef.current = setInterval(async () => {
      try {
        const data = await api.getExecution(executionId);
        setNodeExecutions(data.nodes);
        const done = ['success', 'error', 'cancelled'].includes(data.execution.status);
        if (done) {
          setExecutionPhase(data.execution.status === 'success' ? 'success' : 'error');
          stopPolling();
        }
      } catch { /* swallow */ }
    }, 500);

    return stopPolling;
  }, [executionPhase, executionId]);

  const handleRun = useCallback(async () => {
    if (btnState === 'running') return;
    resetExecution();
    const definition = buildDefinition(nodes, edges);
    if (definition.nodes.length === 0) { alert('Add some nodes first.'); return; }
    try {
      const { executionId } = await api.execute(definition);
      setExecutionStarted(executionId);
    } catch (err: unknown) {
      alert(`Run failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [nodes, edges, btnState]);

  const iconBtn: React.CSSProperties = {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '5px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    transition: 'background 0.1s ease, color 0.1s ease',
    flexShrink: 0,
  };

  const runBg =
    btnState === 'success' ? 'var(--node-success)' :
    btnState === 'error'   ? 'var(--node-error)' :
    btnState === 'running' ? 'var(--bg-hover)' :
    'var(--accent)';

  const runLabel =
    btnState === 'running' ? 'Running...' :
    btnState === 'success' ? '✓ Done' :
    btnState === 'error'   ? '✗ Failed' :
    'Run';

  const sep = (
    <div style={{ width: '1px', height: '16px', background: 'var(--border)', flexShrink: 0 }} />
  );

  return (
    <header
      style={{
        height: '48px',
        flexShrink: 0,
        background: 'var(--bg-toolbar)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: '8px',
      }}
    >
      {/* Wordmark — Inter 700 */}
      <span
        style={{
          fontFamily: "'Inter'",
          fontSize: '16px',
          fontWeight: 700,
          letterSpacing: '-0.022em',
          color: 'var(--text-primary)',
          flexShrink: 0,
        }}
      >
        otto
      </span>

      <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(150,150,160,0.5)', fontFamily: "'Inter'", flexShrink: 0 }}>/</span>

      {/* Editable workflow name — Inter 500 */}
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
            fontWeight: 500,
            letterSpacing: '-0.008em',
            color: 'var(--text-primary)',
            background: 'var(--bg-input)',
            border: '1px solid var(--accent)',
            borderRadius: '4px',
            padding: '2px 7px',
            minWidth: '140px',
          }}
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          style={{
            fontFamily: "'Inter'",
            fontSize: '13px',
            fontWeight: 500,
            letterSpacing: '-0.008em',
            color: 'rgba(232,232,238,0.92)',
            background: 'none',
            border: 'none',
            cursor: 'text',
            padding: '2px 6px',
            borderRadius: '4px',
            transition: 'color 0.1s ease, background 0.1s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'none';
          }}
        >
          {workflowName}
        </button>
      )}

      <div style={{ flex: 1 }} />

      {/* Node / edge counter — JetBrains Mono */}
      <span style={{
        fontFamily: "'JetBrains Mono'",
        fontSize: '11px',
        fontWeight: 500,
        color: 'rgba(120,120,135,0.7)',
        letterSpacing: '0.08em',
        flexShrink: 0,
      }}>
        {nodes.length}n · {edges.length}e
      </span>

      {sep}

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        style={iconBtn}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
        }}
      >
        {theme === 'dark'
          ? <Sun size={13} strokeWidth={1.75} />
          : <Moon size={13} strokeWidth={1.75} />
        }
      </button>

      {/* Settings */}
      <button
        title="Settings"
        style={iconBtn}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
          (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
        }}
      >
        <Settings size={13} strokeWidth={1.75} />
      </button>

      {sep}

      {/* Save */}
      <button
        onClick={() => { setSaveFeedback(true); setTimeout(() => setSaveFeedback(false), 2000); }}
        style={{
          height: '28px',
          padding: '0 11px',
          borderRadius: '5px',
          border: `1px solid ${saveFeedback ? 'var(--node-success)' : 'var(--border-input)'}`,
          background: 'transparent',
          cursor: 'pointer',
          fontSize: '12px',
          fontWeight: 500,
          color: saveFeedback ? 'var(--node-success)' : 'var(--text-secondary)',
          fontFamily: "'Inter'",
          transition: 'color 0.2s, border-color 0.2s',
          flexShrink: 0,
        }}
      >
        {saveFeedback ? '✓ Saved' : 'Save'}
      </button>

      {/* Run */}
      <button
        onClick={handleRun}
        disabled={btnState === 'running'}
        style={{
          height: '28px',
          padding: '0 14px',
          borderRadius: '5px',
          border: 'none',
          background: runBg,
          color: btnState === 'running' ? 'var(--text-secondary)' : '#fff',
          cursor: btnState === 'running' ? 'not-allowed' : 'pointer',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: "'Inter'",
          transition: 'background 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (btnState === 'idle') {
            (e.currentTarget as HTMLElement).style.background = 'var(--accent-hover)';
          }
        }}
        onMouseLeave={(e) => {
          if (btnState === 'idle') {
            (e.currentTarget as HTMLElement).style.background = runBg;
          }
        }}
      >
        {btnState === 'running' && (
          <span className="animate-spin" style={{ display: 'inline-block', fontSize: '11px' }}>◌</span>
        )}
        {runLabel}
      </button>
    </header>
  );
}
