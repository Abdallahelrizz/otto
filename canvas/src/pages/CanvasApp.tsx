import { useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import { Toolbar } from '../components/Toolbar';
import { Sidebar } from '../components/Sidebar';
import { Canvas } from '../components/Canvas';
import { ConfigPanel } from '../components/ConfigPanel';
import { ContextMenu } from '../components/ContextMenu';
import { BottomPanels } from '../components/panels/BottomPanels';
import { ShortcutReference } from '../components/ShortcutReference';
import { AuthGate } from '../components/AuthGate';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useStore } from '../store';
import { useEditorShortcuts } from '../hooks/useEditorShortcuts';

function EditorShell() {
  const theme = useStore((s) => s.theme);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const [shortcutRefOpen, setShortcutRefOpen] = useState(false);

  useEditorShortcuts(shortcutRefOpen, setShortcutRefOpen);

  // The right panel is the single node editor; it shows whenever a node is selected.
  const panelOpen = !!selectedNodeId;

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden theme-${theme}`}
      style={{ background: 'var(--bg-canvas)', color: 'var(--text-primary)' }}
    >
      <Toolbar />

      <div className="flex flex-1 overflow-hidden" style={{ position: 'relative', minHeight: 0 }}>
        <div
          className="sidebar-wrap"
          style={{ width: sidebarOpen ? '216px' : '0px' }}
        >
          <Sidebar />
        </div>

        <button
          className="sidebar-chevron"
          onClick={toggleSidebar}
          title={sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
          style={{ left: sidebarOpen ? '216px' : '0px' }}
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

export function CanvasApp() {
  return (
    <AuthGate>
      <ReactFlowProvider>
        <EditorShell />
      </ReactFlowProvider>
    </AuthGate>
  );
}
