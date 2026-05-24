import { useCallback, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useReactFlow,
  type NodeMouseHandler,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../store';
import { OttoNode } from './nodes/OttoNode';
import { AgentNode } from './nodes/AgentNode';
import { NODE_TYPE_MAP, getNodeDef, nodeColor } from './nodes/nodeConfig';

const nodeTypes = {
  ottoNode: OttoNode,
  agentNode: AgentNode,
};

function CanvasTabs() {
  const [active, setActive] = useState(0);
  const tabs = ['Editor', 'Executions', 'Test'];

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: '7px',
      padding: '3px',
      boxShadow: 'var(--shadow)',
      zIndex: 10,
      pointerEvents: 'all',
    }}>
      {tabs.map((label, i) => (
        <button
          key={label}
          onClick={() => setActive(i)}
          style={{
            padding: '5px 13px',
            fontSize: '12px',
            fontWeight: active === i ? 600 : 500,
            color: active === i ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: active === i ? 'var(--bg-node-lift)' : 'transparent',
            border: 'none',
            borderRadius: '4px',
            letterSpacing: '-0.005em',
            cursor: 'pointer',
            fontFamily: "'Inter'",
            transition: 'background 100ms ease, color 100ms ease',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
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
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const executionPhase = useStore((s) => s.executionPhase);
  const theme = useStore((s) => s.theme);
  const duplicateNode = useStore((s) => s.duplicateNode);
  const deleteNode = useStore((s) => s.deleteNode);
  const setContextMenu = useStore((s) => s.setContextMenu);

  const dotColor = theme === 'dark' ? 'rgba(255,255,255,0.035)' : 'rgba(15,15,10,0.06)';
  const minimapMask = theme === 'dark' ? 'rgba(10,9,8,0.75)' : 'rgba(244,243,240,0.75)';

  const displayEdges = useMemo(
    () => executionPhase === 'running' ? edges.map((e) => ({ ...e, animated: true })) : edges,
    [edges, executionPhase]
  );

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
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === 'd') { e.preventDefault(); if (selectedNodeId) duplicateNode(selectedNodeId); }
      if (meta && e.shiftKey && e.key === 'f') { e.preventDefault(); fitView({ padding: 0.15 }); }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) deleteNode(selectedNodeId);
      }
    },
    [selectedNodeId, duplicateNode, deleteNode, fitView]
  );

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
    (_e, node) => selectNode(node.id), [selectNode]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
  }, [selectNode, setContextMenu]);

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
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onNodeContextMenu={onNodeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onNodeDragStop={onNodeDragStop}
        fitView
        deleteKeyCode={null}
        multiSelectionKeyCode="Shift"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          animated: false,
          type: 'default',
          style: { strokeWidth: 1.4, stroke: 'var(--edge-idle)' },
        }}
        style={{ background: 'var(--bg-canvas)' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color={dotColor}
          gap={18}
          size={1}
          style={{ opacity: 0.20 }}
        />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap
          nodeColor={(n) => nodeColor(getNodeDef(n.data?.nodeType ?? ''), theme) + '90'}
          maskColor={minimapMask}
          position="bottom-right"
          style={{ width: 156, height: 96 }}
        />

        {nodes.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', userSelect: 'none',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px' }}>
              <p style={{
                fontFamily: "'Inter'",
                fontSize: '22px',
                fontWeight: 700,
                letterSpacing: '-0.018em',
                lineHeight: 1.1,
                color: 'var(--text-primary)',
                margin: 0,
                opacity: 0.7,
              }}>
                Start with a trigger.
              </p>
              <p style={{
                fontFamily: "'Inter'",
                fontSize: '14px',
                fontWeight: 400,
                color: 'var(--text-secondary)',
                letterSpacing: '-0.005em',
                lineHeight: 1.45,
                margin: 0,
              }}>
                Drop a Webhook or Manual trigger from the library.
              </p>
            </div>
          </div>
        )}
      </ReactFlow>

      {/* Floating canvas tabs */}
      <CanvasTabs />
    </div>
  );
}
