import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import type { Node, Edge, NodeChange, EdgeChange, Connection } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import type { NodeExecution, ExecutionPhase } from './types';
import { getNodeDef, EDGE_COLOR_DARK, EDGE_COLOR_LIGHT } from './components/nodes/nodeConfig';

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

interface OttoStore {
  // React Flow state
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;

  // Selection
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;

  // Node config editing
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  updateNodeLabel: (id: string, label: string) => void;

  // Node actions
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;

  // Workflow name + meta
  workflowName: string;
  setWorkflowName: (name: string) => void;
  workflowVersion: string;
  workflowActive: boolean;
  setWorkflowActive: (active: boolean) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  activeSidebarTab: string;
  setActiveSidebarTab: (tab: string) => void;

  // Bottom panels
  bottomPanelsOpen: boolean;
  setBottomPanelsOpen: (open: boolean) => void;

  // Context menu
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Execution state
  executionPhase: ExecutionPhase;
  executionId: string | null;
  nodeExecutions: Record<string, NodeExecution>;
  setExecutionStarted: (executionId: string) => void;
  setNodeExecutions: (executions: NodeExecution[]) => void;
  setExecutionPhase: (phase: ExecutionPhase) => void;
  resetExecution: () => void;
}

export const useStore = create<OttoStore>((set, get) => ({
  nodes: [],
  edges: [],

  onNodesChange: (changes) =>
    set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),

  onEdgesChange: (changes) =>
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),

  onConnect: (connection) => {
    const stroke = get().theme === 'dark' ? EDGE_COLOR_DARK : EDGE_COLOR_LIGHT;
    set((s) => ({
      edges: addEdge({ ...connection, type: 'default', style: { strokeWidth: 1.4, stroke } }, s.edges),
    }));
  },

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  selectedNodeId: null,
  selectNode: (id) => set({ selectedNodeId: id }),

  updateNodeConfig: (id, config) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, config } } : n
      ),
    })),

  updateNodeLabel: (id, label) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label } } : n
      ),
    })),

  duplicateNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    const newNode: Node = {
      ...node,
      id: uuidv4(),
      position: { x: node.position.x + 32, y: node.position.y + 32 },
      selected: false,
    };
    set((s) => ({ nodes: [...s.nodes, newNode] }));
  },

  deleteNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
      contextMenu: null,
    })),

  workflowName: 'Untitled Workflow',
  setWorkflowName: (name) => set({ workflowName: name }),
  workflowVersion: 'v1.0.0',
  workflowActive: false,
  setWorkflowActive: (active) => set({ workflowActive: active }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  activeSidebarTab: 'library',
  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),

  bottomPanelsOpen: true,
  setBottomPanelsOpen: (open) => set({ bottomPanelsOpen: open }),

  contextMenu: null,
  setContextMenu: (menu) => set({ contextMenu: menu }),

  theme: 'dark',
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  executionPhase: 'idle',
  executionId: null,
  nodeExecutions: {},

  setExecutionStarted: (executionId) =>
    set({ executionId, executionPhase: 'running', nodeExecutions: {} }),

  setNodeExecutions: (executions) =>
    set({
      nodeExecutions: Object.fromEntries(executions.map((e) => [e.node_id, e])),
    }),

  setExecutionPhase: (phase) => set({ executionPhase: phase }),

  resetExecution: () =>
    set({ executionId: null, executionPhase: 'idle', nodeExecutions: {} }),
}));

export function buildDefinition(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType as string,
      name: n.data.label as string,
      config: (n.data.config as Record<string, unknown>) ?? {},
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
  };
}
