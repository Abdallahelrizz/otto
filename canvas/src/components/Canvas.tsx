import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MiniMap,
  useReactFlow,
  type Connection,
  type NodeMouseHandler,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { Ban, Clipboard, CopyPlus, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import type { Execution } from '../types';
import { OttoNode } from './nodes/OttoNode';
import { AgentNode } from './nodes/AgentNode';
import { NODE_TYPE_MAP, getNodeDef, nodeColor, OTTO_AMBER } from './nodes/nodeConfig';

const nodeTypes = {
  ottoNode: OttoNode,
  agentNode: AgentNode,
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName.toLowerCase();
  // Monaco and nested contenteditable elements dispatch from child divs, so checking only
  // the event target let canvas delete/copy/paste shortcuts fire while the user was typing.
  return tag === 'input'
    || tag === 'textarea'
    || tag === 'select'
    || (target as HTMLElement).isContentEditable
    || Boolean(target.closest('[contenteditable], .monaco-editor'));
}

function wouldCreateCycle(edges: Array<{ source: string; target: string }>, source: string, target: string): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const pending = [target];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (nodeId === source) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    pending.push(...(outgoing.get(nodeId) ?? []));
  }
  return false;
}

function SelectionActionBar({
  count,
  allDisabled,
  canPaste,
  onCopy,
  onPaste,
  onDuplicate,
  onToggleDisabled,
  onDelete,
}: {
  count: number;
  allDisabled: boolean;
  canPaste: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onToggleDisabled: () => void;
  onDelete: () => void;
}) {
  if (count <= 1) return null;

  const buttonStyle: React.CSSProperties = {
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid var(--border)',
    borderRadius: '5px',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontFamily: "'Inter'",
    fontSize: '11.5px',
    fontWeight: 650,
    padding: '0 9px',
  };

  return (
    <div style={{
      position: 'absolute',
      bottom: 18,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 12,
      pointerEvents: 'all',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      background: 'var(--bg-panel)',
      boxShadow: 'var(--shadow-main)',
    }}>
      <span style={{
        fontFamily: 'Geist Mono',
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        padding: '0 7px',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {count} selected
      </span>
      <button type="button" title="Copy selection" style={buttonStyle} onClick={onCopy}>
        <Clipboard size={13} strokeWidth={1.8} />
        Copy
      </button>
      <button type="button" title="Paste copied nodes" style={{ ...buttonStyle, opacity: canPaste ? 1 : 0.45, cursor: canPaste ? 'pointer' : 'not-allowed' }} disabled={!canPaste} onClick={onPaste}>
        <Clipboard size={13} strokeWidth={1.8} />
        Paste
      </button>
      <button type="button" title="Duplicate selection" style={buttonStyle} onClick={onDuplicate}>
        <CopyPlus size={13} strokeWidth={1.8} />
        Duplicate
      </button>
      <button type="button" title={allDisabled ? 'Enable selection' : 'Disable selection'} style={buttonStyle} onClick={onToggleDisabled}>
        <Ban size={13} strokeWidth={1.8} />
        {allDisabled ? 'Enable' : 'Disable'}
      </button>
      <button type="button" title="Delete selection" style={{ ...buttonStyle, color: 'var(--node-error)' }} onClick={onDelete}>
        <Trash2 size={13} strokeWidth={1.8} />
        Delete
      </button>
    </div>
  );
}

function ImportCompatibilityBanner() {
  const report = useStore((s) => s.workflowImportReport);
  const setActiveSidebarTab = useStore((s) => s.setActiveSidebarTab);
  if (!report) return null;

  const partial = report.summary.partial ?? 0;
  const risky = (report.summary.placeholder ?? 0) + (report.summary.unsupported ?? 0);
  const color = risky > 0 ? 'var(--node-error)' : partial > 0 ? 'var(--node-running)' : 'var(--node-success)';

  return (
    <button
      type="button"
      onClick={() => setActiveSidebarTab('workflows')}
      style={{
        position: 'absolute',
        top: 58,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 8,
        pointerEvents: 'all',
        border: `1px solid ${color}`,
        background: 'var(--bg-panel)',
        color,
        borderRadius: '5px',
        padding: '6px 10px',
        fontFamily: 'Geist Mono',
        fontSize: '10.5px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: 'var(--shadow)',
      }}
    >
      n8n import: {report.summary.exact ?? 0} exact / {partial} partial / {risky} blocked
    </button>
  );
}

function CanvasModePage({
  tone = 'default',
  title,
  meta,
  children,
}: {
  tone?: 'default' | 'history';
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const isHistory = tone === 'history';
  return (
    <section
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 8,
        pointerEvents: 'all',
        overflow: 'auto',
        background: isHistory
          ? 'radial-gradient(circle at 18% 12%, var(--history-glow), transparent 34%), var(--history-bg)'
          : 'linear-gradient(180deg, var(--bg-canvas) 0%, var(--bg-panel) 100%)',
        color: isHistory ? 'var(--history-text)' : 'var(--text-primary)',
        padding: '42px clamp(24px, 4vw, 56px)',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <h1 style={{
            margin: 0,
            fontFamily: "'Inter'",
            fontSize: 22,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            color: isHistory ? 'var(--history-text)' : 'var(--text-primary)',
          }}>
            {title}
          </h1>
          {meta && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: isHistory ? 'var(--history-muted)' : 'var(--text-muted)',
              fontFamily: "'Geist Mono'",
              fontSize: 11,
              fontWeight: 600,
            }}>
              {meta}
            </div>
          )}
        </header>
        {children}
      </div>
    </section>
  );
}

function TestPanel() {
  const testInputText = useStore((s) => s.testInputText);
  const setTestInputText = useStore((s) => s.setTestInputText);
  const runExecution = useStore((s) => s.runExecution);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const executionPhase = useStore((s) => s.executionPhase);
  const disabled = executionPhase === 'running';

  return (
    <CanvasModePage
      title="Test input"
      meta={disabled ? 'running' : selectedNodeId ? 'node selected' : 'workflow'}
    >
      <div style={{
        width: 'min(720px, 100%)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-main)',
        overflow: 'hidden',
      }}>
      <div style={{
        height: 42,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        borderBottom: '1px solid var(--border)',
        gap: 8,
      }}>
        <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>Payload</span>
        <div style={{ flex: 1 }} />
        <button
          disabled={disabled}
          onClick={() => void runExecution('full')}
          style={testButtonStyle(disabled)}
        >
          Run workflow
        </button>
        <button
          disabled={disabled || !selectedNodeId}
          onClick={() => void runExecution('single_node', selectedNodeId)}
          style={testButtonStyle(disabled || !selectedNodeId)}
        >
          Run node
        </button>
      </div>
      <textarea
        value={testInputText}
        onChange={(e) => setTestInputText(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: 360,
          resize: 'vertical',
          background: 'var(--bg-input)',
          color: 'var(--text-primary)',
          border: 'none',
          outline: 'none',
          padding: '12px',
          fontFamily: 'Geist Mono',
          fontSize: '12px',
          lineHeight: 1.55,
          display: 'block',
        }}
      />
      </div>
    </CanvasModePage>
  );
}

function testButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 24,
    padding: '0 9px',
    borderRadius: '4px',
    border: '1px solid var(--border-input)',
    background: disabled ? 'var(--bg-hover)' : 'var(--bg-input)',
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: "'Inter'",
    fontSize: '11px',
    fontWeight: 600,
  };
}

function ExecutionsPanel() {
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const executionId = useStore((s) => s.executionId);
  const loadExecutionDetail = useStore((s) => s.loadExecutionDetail);
  const retryExecution = useStore((s) => s.retryExecution);
  const setBottomPanelsOpen = useStore((s) => s.setBottomPanelsOpen);
  const [rows, setRows] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!savedWorkflowId) {
      setRows([]);
      return;
    }

    setLoading(true);
    api.listExecutions(savedWorkflowId, 1, 20)
      .then((res) => { if (!cancelled) setRows(res.executions); })
      .catch(() => { if (!cancelled) setRows([]); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [savedWorkflowId, executionId]);

  return (
    <CanvasModePage
      tone="history"
      title="History"
      meta={loading ? 'loading' : `${rows.length} runs`}
    >
      <div style={{
        background: 'var(--history-panel)',
        border: '1px solid var(--history-border)',
        borderRadius: '8px',
        boxShadow: '0 24px 72px var(--history-shadow)',
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '104px minmax(180px, 1fr) 92px 104px 68px',
          gap: 10,
          alignItems: 'center',
          padding: '11px 14px',
          borderBottom: '1px solid var(--history-border)',
          color: 'var(--history-muted)',
          fontFamily: "'Geist Mono'",
          fontSize: 10,
          fontWeight: 750,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          <span>Status</span>
          <span>Execution</span>
          <span>Mode</span>
          <span style={{ textAlign: 'right' }}>Started</span>
          <span />
        </div>

        <div style={{ maxHeight: 'min(620px, calc(100vh - 220px))', overflow: 'auto', padding: 8 }}>
          {!savedWorkflowId && (
            <div style={emptyPanelStyle}>Save or run the workflow once to create execution history.</div>
          )}
          {savedWorkflowId && !loading && rows.length === 0 && (
            <div style={emptyPanelStyle}>No executions for this workflow yet.</div>
          )}
          {rows.map((row) => (
            <div
              role="button"
              tabIndex={0}
              key={row.id}
              onClick={() => {
                setBottomPanelsOpen(true);
                void loadExecutionDetail(row.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setBottomPanelsOpen(true);
                  void loadExecutionDetail(row.id);
                }
              }}
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '104px minmax(180px, 1fr) 92px 104px 68px',
                alignItems: 'center',
                gap: 10,
                padding: '9px 6px',
                border: '1px solid transparent',
                borderRadius: '6px',
                background: row.id === executionId ? 'var(--history-row-active)' : 'transparent',
                color: 'var(--history-text)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: "'Inter'",
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = 'var(--history-row-hover)';
                el.style.borderColor = 'var(--history-border)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = row.id === executionId ? 'var(--history-row-active)' : 'transparent';
                el.style.borderColor = 'transparent';
              }}
            >
              <span style={{ ...statusPillStyle(row.status), justifySelf: 'start' }}>{row.status}</span>
              <span style={{ fontFamily: 'Geist Mono', fontSize: '11px', color: 'var(--history-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.id}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--history-muted)' }}>{modeLabel(row.mode)}</span>
              <span style={{ fontSize: '11px', color: 'var(--history-muted)', textAlign: 'right' }}>{formatTime(row.started_at)}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void retryExecution(row.id);
                }}
                style={{
                  height: 26,
                  borderRadius: '5px',
                  border: '1px solid var(--history-border)',
                  background: 'var(--history-button)',
                  color: 'var(--history-text)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: "'Inter'",
                }}
              >
                Retry
              </button>
            </div>
          ))}
        </div>
      </div>
    </CanvasModePage>
  );
}

const emptyPanelStyle: React.CSSProperties = {
  padding: '22px 12px',
  color: 'var(--history-muted, var(--text-secondary))',
  fontSize: '12px',
  textAlign: 'center',
};

function statusPillStyle(status: Execution['status']): React.CSSProperties {
  const color = status === 'success'
    ? 'var(--node-success)'
    : status === 'error'
      ? 'var(--node-error)'
      : status === 'running'
        ? 'var(--node-running)'
        : 'var(--text-muted)';
  return {
    color,
    border: `1px solid ${color}`,
    borderRadius: '100px',
    padding: '2px 7px',
    fontFamily: 'Geist Mono',
    fontSize: '9.5px',
    fontWeight: 700,
    textTransform: 'uppercase',
  };
}

function modeLabel(mode?: Execution['mode']) {
  if (mode === 'single_node') return 'node';
  if (mode === 'to_node') return 'to node';
  if (mode === 'from_node') return 'from node';
  return 'full';
}

function formatTime(value: string | null) {
  if (!value) return '--';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function Canvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();

  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const onNodesChange = useStore((s) => s.onNodesChange);
  const onEdgesChange = useStore((s) => s.onEdgesChange);
  const onConnect = useStore((s) => s.onConnect);
  const setNodes = useStore((s) => s.setNodes);
  const selectNode = useStore((s) => s.selectNode);
  const setConfigPanelOpen = useStore((s) => s.setConfigPanelOpen);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const executionPhase = useStore((s) => s.executionPhase);
  const theme = useStore((s) => s.theme);
  const copyNodes = useStore((s) => s.copyNodes);
  const pasteNodes = useStore((s) => s.pasteNodes);
  const duplicateNodes = useStore((s) => s.duplicateNodes);
  const deleteNodes = useStore((s) => s.deleteNodes);
  const toggleNodesDisabled = useStore((s) => s.toggleNodesDisabled);
  const selectAllNodes = useStore((s) => s.selectAllNodes);
  const nodeClipboard = useStore((s) => s.nodeClipboard);
  const setContextMenu = useStore((s) => s.setContextMenu);
  const setActiveSidebarTab = useStore((s) => s.setActiveSidebarTab);
  const setLibraryFocusCategory = useStore((s) => s.setLibraryFocusCategory);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const setFitViewCallback = useStore((s) => s.setFitViewCallback);
  const activeCanvasTab = useStore((s) => s.activeCanvasTab);

  const dotColor = theme === 'dark' ? 'rgba(128,130,140,0.32)' : 'rgba(20,18,12,0.55)';
  const minimapMask = theme === 'dark' ? 'rgba(10,9,8,0.75)' : 'rgba(244,243,240,0.75)';
  const selectedNodes = useMemo(
    () => {
      const selected = nodes.filter((node) => node.selected);
      if (selected.length > 0) return selected;
      const fallback = selectedNodeId ? nodes.find((node) => node.id === selectedNodeId) : null;
      return fallback ? [fallback] : [];
    },
    [nodes, selectedNodeId]
  );
  const selectedNodeIds = useMemo(() => selectedNodes.map((node) => node.id), [selectedNodes]);
  const selectedCount = selectedNodes.length;
  const selectedAllDisabled = selectedCount > 0 && selectedNodes.every((node) => Boolean(node.data.disabled));
  const canPaste = Boolean(nodeClipboard?.nodes.length);

  const edgeColor = theme === 'dark' ? 'rgba(168,156,164,0.6)' : 'rgba(86,66,65,0.6)';

  const displayEdges = useMemo(
    () => edges.map((e) => ({
      ...e,
      animated: executionPhase === 'running',
      style: { ...(e.style || {}), strokeWidth: 1.4, stroke: edgeColor }
    })),
    [edges, executionPhase, edgeColor]
  );

  // Register fitView callback for the keyboard shortcut hook
  useEffect(() => {
    setFitViewCallback(() => fitView({ padding: 0.15, duration: 400, maxZoom: 1 }));
    return () => setFitViewCallback(null);
  }, [fitView, setFitViewCallback]);

  const prevPhaseRef = useRef(executionPhase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = executionPhase;
    if (prev === 'running' && (executionPhase === 'success' || executionPhase === 'error')) {
      fitView({ padding: 0.15, duration: 400, maxZoom: 1 });
    }
  }, [executionPhase, fitView]);

  const focusCanvas = useCallback(() => {
    reactFlowWrapper.current?.focus({ preventScroll: true });
  }, []);

  const onNodeDragStop: NodeMouseHandler = useCallback((_e, node) => {
    const el = document.querySelector(`.react-flow__node[data-id="${node.id}"]`);
    if (!el) return;
    el.classList.add('node-spring-release');
    const onEnd = () => {
      el.classList.remove('node-spring-release');
      el.removeEventListener('animationend', onEnd);
    };
    const fallback = setTimeout(() => el.classList.remove('node-spring-release'), 500);
    el.addEventListener('animationend', () => {
      clearTimeout(fallback);
      onEnd();
    }, { once: true });
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const meta = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (meta && key === 'a') { e.preventDefault(); selectAllNodes(); }
      if (meta && key === 'c') { e.preventDefault(); copyNodes(); }
      if (meta && key === 'v') { e.preventDefault(); pasteNodes(); }
      if (meta && e.shiftKey && e.key === 'f') { e.preventDefault(); fitView({ padding: 0.15, maxZoom: 1 }); }
      // Ctrl/Cmd+D and Delete are handled by useEditorShortcuts on document. Handling them
      // here too made the bubbling keydown duplicate twice (and dispatched delete twice).
    },
    [copyNodes, pasteNodes, selectAllNodes, fitView]
  );

  const onValidConnect = useCallback((connection: Connection) => {
    const { source, target } = connection;
    if (!source || !target) return;
    // React Flow permits these invalid DAG mutations by default; they otherwise fail only
    // when the backend parses the workflow at run time.
    if (source === target) return;
    if (edges.some((edge) => edge.source === source && edge.target === target)) return;
    if (wouldCreateCycle(edges, source, target)) return;
    onConnect(connection);
  }, [edges, onConnect]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const nodeType = e.dataTransfer.getData('application/otto-node-type');
      if (!nodeType || !NODE_TYPE_MAP[nodeType]) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const def = getNodeDef(nodeType);
      setNodes([...nodes, {
        id: uuidv4(),
        type: nodeType === 'ai_agent' ? 'agentNode' : 'ottoNode',
        position,
        data: { label: def.label, nodeType: def.type, config: { ...def.defaultConfig } },
      }]);
    },
    [nodes, screenToFlowPosition, setNodes]
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      focusCanvas();
      selectNode(node.id);
    },
    [focusCanvas, selectNode]
  );

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (e, node) => {
      e.stopPropagation();
      focusCanvas();
      selectNode(node.id);
      setConfigPanelOpen(true);
    },
    [focusCanvas, selectNode, setConfigPanelOpen]
  );

  const onPaneClick = useCallback(() => {
    focusCanvas();
    selectNode(null);
    setConfigPanelOpen(false);
    setContextMenu(null);
  }, [focusCanvas, selectNode, setConfigPanelOpen, setContextMenu]);

  const onNodeContextMenu = useCallback(
    (e: React.MouseEvent, node: Node) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
    },
    [setContextMenu]
  );

  const onPaneContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu(null);
  }, [setContextMenu]);

  return (
    <div
      ref={reactFlowWrapper}
      className="flex-1 h-full"
      style={{ background: 'var(--bg-canvas)', position: 'relative' }}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onValidConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          animated: false,
          type: 'default',
          style: { strokeWidth: 1.4, stroke: edgeColor },
        }}
        style={{ background: 'var(--bg-canvas)' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color={dotColor}
          gap={20}
          size={1.4}
        />
        <MiniMap
          nodeColor={(n) => nodeColor(getNodeDef(n.data?.nodeType ?? ''), theme) + '90'}
          maskColor={minimapMask}
          position="bottom-right"
          style={{ width: 156, height: 96 }}
        />

      </ReactFlow>

      {activeCanvasTab === 'editor' && nodes.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: '11px',
          pointerEvents: 'none', userSelect: 'none', zIndex: 4,
        }}>
          <button
            type="button"
            title="Start with a trigger"
            onClick={() => {
              setSidebarOpen(true);
              setActiveSidebarTab('library');
              setLibraryFocusCategory('triggers');
            }}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              background: 'transparent',
              border: '1.5px dashed var(--border-input)',
              borderRadius: '14px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'border-color 130ms ease, background 130ms ease, color 130ms ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = OTTO_AMBER;
              el.style.background = `${OTTO_AMBER}14`;
              el.style.color = OTTO_AMBER;
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = 'var(--border-input)';
              el.style.background = 'transparent';
              el.style.color = 'var(--text-muted)';
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <span style={{
            fontFamily: "'Inter'",
            fontSize: '12.5px',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            letterSpacing: '-0.005em',
          }}>
            Start with a trigger
          </span>
        </div>
      )}

      {activeCanvasTab === 'editor' && <ImportCompatibilityBanner />}
      {activeCanvasTab === 'editor' && (
        <SelectionActionBar
          count={selectedCount}
          allDisabled={selectedAllDisabled}
          canPaste={canPaste}
          onCopy={() => copyNodes(selectedNodeIds)}
          onPaste={() => pasteNodes()}
          onDuplicate={() => duplicateNodes(selectedNodeIds)}
          onToggleDisabled={() => toggleNodesDisabled(selectedNodeIds)}
          onDelete={() => deleteNodes(selectedNodeIds)}
        />
      )}
      {activeCanvasTab === 'test' && <TestPanel />}
      {activeCanvasTab === 'executions' && <ExecutionsPanel />}
    </div>
  );
}
