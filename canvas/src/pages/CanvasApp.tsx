import { useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { useNavigate, useParams } from 'react-router-dom';
import { Toolbar } from '../components/Toolbar';
import { Sidebar } from '../components/Sidebar';
import { Canvas } from '../components/Canvas';
import { ConfigPanel } from '../components/ConfigPanel';
import { ContextMenu } from '../components/ContextMenu';
import { BottomPanels } from '../components/panels/BottomPanels';
import { ShortcutReference } from '../components/ShortcutReference';
import { AuthGate } from '../components/AuthGate';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { buildDefinition, useStore } from '../store';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';

const SIDEBAR_WIDTH = 280;
const AUTOSAVE_DELAY_MS = 800;

function WorkflowAutosave({ sessionKey }: { sessionKey: string }) {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const workflowName = useStore((s) => s.workflowName);
  const pinnedData = useStore((s) => s.pinnedData);
  const workflowImportReport = useStore((s) => s.workflowImportReport);
  const workflowSettings = useStore((s) => s.workflowSettings);
  const markWorkflowDirty = useStore((s) => s.markWorkflowDirty);
  const saveWorkflow = useStore((s) => s.saveWorkflow);
  const timerRef = useRef<number | null>(null);
  const lastSnapshotRef = useRef<string | null>(null);
  const lastSessionRef = useRef<string | null>(null);

  const snapshot = useMemo(() => JSON.stringify({
    name: workflowName,
    definition: buildDefinition(nodes, edges, pinnedData, workflowImportReport, workflowSettings),
  }), [nodes, edges, workflowName, pinnedData, workflowImportReport, workflowSettings]);

  useEffect(() => {
    if (lastSessionRef.current !== sessionKey) {
      lastSessionRef.current = sessionKey;
      lastSnapshotRef.current = snapshot;
      return;
    }
    if (lastSnapshotRef.current === snapshot) return;

    lastSnapshotRef.current = snapshot;
    markWorkflowDirty();
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (useStore.getState().saveStatus === 'pending') {
        void saveWorkflow().catch(() => {});
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [markWorkflowDirty, saveWorkflow, sessionKey, snapshot]);

  useEffect(() => {
    const flush = () => {
      if (useStore.getState().saveStatus !== 'pending') return;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void useStore.getState().saveWorkflow().catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [sessionKey]);

  return null;
}

function EditorShell({ autosaveSession }: { autosaveSession: string }) {
  const theme = useStore((s) => s.theme);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const configPanelOpen = useStore((s) => s.configPanelOpen);
  const activeCanvasTab = useStore((s) => s.activeCanvasTab);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const [shortcutRefOpen, setShortcutRefOpen] = useState(false);

  useEditorShortcuts(shortcutRefOpen, setShortcutRefOpen);

  // Close the execution EventSource when the editor unmounts. Every other teardown
  // path (loading another workflow, starting a new run) calls stopSSE, but simply
  // navigating away did not — leaving a live stream writing execution state for a
  // workflow the user has already left.
  useEffect(() => () => useStore.getState().stopSSE(), []);

  const panelOpen = Boolean(activeCanvasTab === 'editor' && selectedNodeId && configPanelOpen);

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden theme-${theme}`}
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
    >
      <WorkflowAutosave sessionKey={autosaveSession} />
      <Toolbar />

      <div className="flex flex-1 overflow-hidden" style={{ position: 'relative', minHeight: 0 }}>
        <div
          className="sidebar-wrap"
          style={{ width: sidebarOpen ? `${SIDEBAR_WIDTH}px` : '0px' }}
        >
          <Sidebar />
        </div>

        <button
          className="sidebar-chevron"
          onClick={toggleSidebar}
          title={sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
          style={{ left: sidebarOpen ? `${SIDEBAR_WIDTH}px` : '0px' }}
        >
          <svg
            width="8"
            height="12"
            viewBox="0 0 8 12"
            fill="none"
            style={{
              transform: sidebarOpen ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 200ms var(--ease-out)',
            }}
          >
            <path d="M6 1L1 6L6 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <ErrorBoundary>
            <Canvas />
            <BottomPanels />
          </ErrorBoundary>
        </div>

        <div
          className="config-panel-wrap"
          style={{ width: panelOpen ? '320px' : '0px' }}
        >
          <div style={{ width: '320px', height: '100%' }}>
            <ErrorBoundary>
              <ConfigPanel />
            </ErrorBoundary>
          </div>
        </div>
      </div>

      <ContextMenu />
      {shortcutRefOpen && <ShortcutReference onClose={() => setShortcutRefOpen(false)} />}
    </div>
  );
}

function EditorRoute() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const loadWorkflow = useStore((s) => s.loadWorkflow);
  const restoreLastWorkflow = useStore((s) => s.restoreLastWorkflow);
  const newWorkflow = useStore((s) => s.newWorkflow);
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError('');

    const hydrate = async () => {
      try {
        if (id) {
          await loadWorkflow(id);
        } else {
          await restoreLastWorkflow();
          if (!useStore.getState().savedWorkflowId) newWorkflow();
        }

        if (cancelled) return;
        const loadedId = useStore.getState().savedWorkflowId;
        if (!id && loadedId) {
          navigate(`/app/editor/${loadedId}`, { replace: true });
          return;
        }
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Workflow could not be loaded');
        setState('error');
      }
    };

    void hydrate();
    return () => { cancelled = true; };
  }, [id, loadWorkflow, navigate, newWorkflow, restoreLastWorkflow]);

  useEffect(() => {
    if (state === 'ready' && !id && savedWorkflowId) {
      navigate(`/app/editor/${savedWorkflowId}`, { replace: true });
    }
  }, [id, navigate, savedWorkflowId, state]);

  if (state === 'loading') {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-canvas)', color: 'var(--text-muted)' }}>
        Loading workflow...
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <strong>Workflow could not be opened</strong>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{error}</span>
          <button type="button" onClick={() => navigate('/app/workflows')}>Back to workflows</button>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <EditorShell autosaveSession={id ?? savedWorkflowId ?? 'draft'} />
    </ReactFlowProvider>
  );
}

export function CanvasApp() {
  return (
    <AuthGate>
      <EditorRoute />
    </AuthGate>
  );
}
