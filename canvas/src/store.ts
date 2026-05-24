import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import type { Node, Edge, NodeChange, EdgeChange, Connection } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import type { NodeExecution, ExecutionPhase, WorkflowListItem, Credential, ExecutionDetail } from './types';
import { getNodeDef, EDGE_COLOR_DARK, EDGE_COLOR_LIGHT } from './components/nodes/nodeConfig';
import { api } from './api';

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

  // Saved workflow persistence
  savedWorkflowId: string | null;
  workflowList: WorkflowListItem[];
  workflowListLoading: boolean;
  isSaving: boolean;
  saveWorkflow: () => Promise<void>;
  loadWorkflow: (id: string) => Promise<void>;
  restoreLastWorkflow: () => Promise<void>;
  fetchWorkflows: () => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  newWorkflow: () => void;

  // Credentials
  credentials: Credential[];
  credentialsLoading: boolean;
  fetchCredentials: () => Promise<void>;
  createCredential: (name: string, type: string, data: Record<string, string>) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;

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
  selectedExecutionDetail: ExecutionDetail | null;
  executionDetailLoading: boolean;
  setExecutionStarted: (executionId: string) => void;
  setNodeExecutions: (executions: NodeExecution[]) => void;
  loadExecutionDetail: (executionId: string) => Promise<void>;
  setExecutionPhase: (phase: ExecutionPhase) => void;
  resetExecution: () => void;
  _sseSource: EventSource | null;
  startSSE: (executionId: string) => void;
  stopSSE: () => void;
}

const LAST_WORKFLOW_KEY = 'otto_last_workflow_id';

function readLastWorkflowId(): string | null {
  try { return localStorage.getItem(LAST_WORKFLOW_KEY); }
  catch { return null; }
}

function writeLastWorkflowId(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_WORKFLOW_KEY, id);
    else localStorage.removeItem(LAST_WORKFLOW_KEY);
  } catch {
    // Browser storage can be disabled.
  }
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
  setWorkflowActive: async (active) => {
    const prev = get().workflowActive;
    set({ workflowActive: active });
    try {
      if (active && !get().savedWorkflowId) {
        await get().saveWorkflow();
      }
      const { savedWorkflowId } = get();
      if (savedWorkflowId) {
        await api.updateWorkflow(savedWorkflowId, { active });
      }
    } catch (err) {
      set({ workflowActive: prev });
      throw err;
    }
  },

  // Saved workflow persistence
  savedWorkflowId: null,
  workflowList: [],
  workflowListLoading: false,
  isSaving: false,

  saveWorkflow: async () => {
    const { nodes, edges, workflowName, savedWorkflowId } = get();
    const definition = buildDefinition(nodes, edges);
    set({ isSaving: true });
    try {
      if (savedWorkflowId) {
        await api.updateWorkflow(savedWorkflowId, { name: workflowName, definition });
      } else {
        const { id } = await api.createWorkflow(workflowName, definition);
        set({ savedWorkflowId: id });
        writeLastWorkflowId(id);
      }
      if (savedWorkflowId) writeLastWorkflowId(savedWorkflowId);
      get().fetchWorkflows();
    } finally {
      set({ isSaving: false });
    }
  },

  loadWorkflow: async (id) => {
    const wf = await api.getWorkflow(id);
    const def = wf.definition ?? { nodes: [], edges: [] };

    const loadedNodes = (def.nodes as Array<{ id: string; type: string; name: string; config: Record<string, unknown>; position?: { x: number; y: number } }>).map((n) => {
      const nodeDef = getNodeDef(n.type);
      return {
        id: n.id,
        type: n.type === 'ai_agent' ? 'agentNode' : 'ottoNode',
        position: n.position ?? { x: 100, y: 100 },
        data: {
          label: n.name,
          nodeType: n.type,
          config: n.config ?? (nodeDef?.defaultConfig ?? {}),
        },
      };
    });

    const loadedEdges = (def.edges as Array<{ id: string; source: string; target: string; sourceHandle?: string; targetHandle?: string }>).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      type: 'default',
      style: { strokeWidth: 1.4, stroke: get().theme === 'dark' ? EDGE_COLOR_DARK : EDGE_COLOR_LIGHT },
    }));

    set({
      savedWorkflowId: id,
      workflowName: wf.name,
      workflowActive: wf.active,
      nodes: loadedNodes,
      edges: loadedEdges,
      selectedNodeId: null,
    });
    writeLastWorkflowId(id);
  },

  restoreLastWorkflow: async () => {
    const id = readLastWorkflowId();
    if (!id) return;
    try {
      await get().loadWorkflow(id);
    } catch {
      writeLastWorkflowId(null);
    }
  },

  fetchWorkflows: async () => {
    set({ workflowListLoading: true });
    try {
      const list = await api.listWorkflows();
      set({ workflowList: list });
    } finally {
      set({ workflowListLoading: false });
    }
  },

  deleteWorkflow: async (id) => {
    await api.deleteWorkflow(id);
    const { savedWorkflowId } = get();
    if (savedWorkflowId === id) {
      set({ savedWorkflowId: null, workflowName: 'Untitled Workflow', nodes: [], edges: [], workflowActive: false });
      writeLastWorkflowId(null);
    }
    get().fetchWorkflows();
  },

  newWorkflow: () => {
    set({
      savedWorkflowId: null,
      workflowName: 'Untitled Workflow',
      workflowActive: false,
      nodes: [],
      edges: [],
      selectedNodeId: null,
    });
    writeLastWorkflowId(null);
  },

  // Credentials
  credentials: [],
  credentialsLoading: false,

  fetchCredentials: async () => {
    set({ credentialsLoading: true });
    try {
      const list = await api.listCredentials();
      set({ credentials: list });
    } finally {
      set({ credentialsLoading: false });
    }
  },

  createCredential: async (name, type, data) => {
    await api.createCredential(name, type, data);
    get().fetchCredentials();
  },

  deleteCredential: async (id) => {
    await api.deleteCredential(id);
    set((s) => ({ credentials: s.credentials.filter((c) => c.id !== id) }));
  },

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
  selectedExecutionDetail: null,
  executionDetailLoading: false,
  _sseSource: null,

  setExecutionStarted: (executionId) =>
    set({ executionId, executionPhase: 'running', nodeExecutions: {}, selectedExecutionDetail: null }),

  setNodeExecutions: (executions) =>
    set({
      nodeExecutions: Object.fromEntries(executions.map((e) => [e.node_id, e])),
    }),

  loadExecutionDetail: async (executionId) => {
    set({ executionDetailLoading: true });
    try {
      const detail = await api.getExecution(executionId);
      set({
        selectedExecutionDetail: detail,
        executionId,
        executionPhase: detail.execution.status === 'running' || detail.execution.status === 'pending'
          ? 'running'
          : detail.execution.status === 'success'
            ? 'success'
            : detail.execution.status === 'error'
              ? 'error'
              : 'idle',
        nodeExecutions: Object.fromEntries(detail.nodes.map((e) => [e.node_id, e])),
      });
    } finally {
      set({ executionDetailLoading: false });
    }
  },

  setExecutionPhase: (phase) => set({ executionPhase: phase }),

  resetExecution: () => {
    get().stopSSE();
    set({ executionId: null, executionPhase: 'idle', nodeExecutions: {} });
  },

  startSSE: (executionId) => {
    get().stopSSE();
    const source = api.streamExecution(executionId);

    const mergeEvent = (raw: unknown, status: NodeExecution['status']) => {
      const data = raw as { nodeId?: string; node_id?: string; nodeName?: string; node_name?: string; nodeType?: string; node_type?: string; error?: string | null };
      const nodeId = data.node_id ?? data.nodeId;
      if (!nodeId) return;
      const ne: NodeExecution = {
        id: `${executionId}:${nodeId}:${status}`,
        node_id: nodeId,
        node_name: data.node_name ?? data.nodeName ?? nodeId,
        node_type: data.node_type ?? data.nodeType ?? 'unknown',
        status,
        started_at: status === 'running' ? new Date().toISOString() : null,
        completed_at: status !== 'running' ? new Date().toISOString() : null,
        duration_ms: null,
        input: null,
        output: null,
        error: data.error ?? null,
        retry_count: 0,
      };
      set((s) => ({ nodeExecutions: { ...s.nodeExecutions, [nodeId]: { ...s.nodeExecutions[nodeId], ...ne } } }));
    };

    source.addEventListener('snapshot', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as ExecutionDetail;
        const phase = data.execution.status === 'success'
          ? 'success'
          : data.execution.status === 'error'
            ? 'error'
            : 'running';
        set({
          selectedExecutionDetail: data,
          executionPhase: phase,
          nodeExecutions: Object.fromEntries(data.nodes.map((ne) => [ne.node_id, ne])),
        });
      } catch {}
    });

    source.addEventListener('node:start', (e: MessageEvent) => {
      try {
        mergeEvent(JSON.parse(e.data), 'running');
      } catch {}
    });

    source.addEventListener('node:end', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        mergeEvent(data, data.status === 'error' ? 'error' : 'success');
      } catch {}
    });

    source.addEventListener('node:skipped', (e: MessageEvent) => {
      try {
        mergeEvent(JSON.parse(e.data), 'skipped');
      } catch {}
    });

    source.addEventListener('execution:end', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { status: string };
        const phase = data.status === 'success' ? 'success' : 'error';
        set({ executionPhase: phase });
        api.getExecution(executionId).then((detail) => {
          set({
            selectedExecutionDetail: detail,
            nodeExecutions: Object.fromEntries(detail.nodes.map((ne) => [ne.node_id, ne])),
          });
        }).catch(() => {});
        setTimeout(() => {
          set({ executionPhase: 'idle' });
        }, 3000);
      } catch {}
      get().stopSSE();
    });

    source.onerror = () => {
      set({ executionPhase: 'error' });
      get().stopSSE();
    };

    set({ _sseSource: source });
  },

  stopSSE: () => {
    const { _sseSource } = get();
    if (_sseSource) {
      _sseSource.close();
      set({ _sseSource: null });
    }
  },
}));

export function buildDefinition(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.nodeType as string,
      name: n.data.label as string,
      config: (n.data.config as Record<string, unknown>) ?? {},
      position: n.position,
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
