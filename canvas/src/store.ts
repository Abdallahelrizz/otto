import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import type { Node, Edge, NodeChange, EdgeChange, Connection } from 'reactflow';
import { v4 as uuidv4 } from 'uuid';
import type {
  NodeExecution,
  ExecutionPhase,
  ExecutionMode,
  WorkflowListItem,
  Credential,
  ExecutionDetail,
  ApiKey,
  ImportCompatibilityReport,
  WorkflowValidationIssue,
  OttoNodeData,
  WorkflowSettings,
} from './types';
import { DEFAULT_WORKFLOW_SETTINGS } from './types';
import { getNodeDef, EDGE_COLOR_DARK, EDGE_COLOR_LIGHT } from './components/nodes/nodeConfig';
import { api } from './api';
import { hasBlockingValidationIssues, validateCanvasWorkflow } from './utils/workflowValidation';

/** Normalize a raw API execution detail: maps execution_type → executionType */
function normalizeExecutionDetail(detail: ExecutionDetail): ExecutionDetail {
  const raw = detail.execution as ExecutionDetail['execution'] & { execution_type?: string };
  if (raw.execution_type && !raw.executionType) {
    return {
      ...detail,
      execution: {
        ...raw,
        executionType: raw.executionType ?? raw.execution_type,
      },
    };
  }
  return detail;
}

export interface OttoNotification {
  id: string;
  type: 'error';
  title: string;
  workflowName?: string | null;
  executionId: string;
  timestamp: string;
  urgent: boolean; // true = new/unacknowledged; false = dismissed but kept
}

const NOTIF_KEY = 'otto-notifications-v1';
function loadStoredNotifications(): OttoNotification[] {
  try { return JSON.parse(localStorage.getItem(NOTIF_KEY) ?? '[]') as OttoNotification[]; }
  catch { return []; }
}
function persistNotifications(list: OttoNotification[]): void {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

type NodeClipboard = {
  nodes: Node[];
  edges: Edge[];
  pasteCount: number;
};

export type WorkflowSaveStatus = 'saved' | 'pending' | 'saving' | 'error';

let activeWorkflowSave: Promise<void> | null = null;
let workflowSaveQueued = false;
let workflowContextVersion = 0;
let workflowLoadRequest = 0;
let workflowListRequest = 0;
let workflowActiveRequest = 0;
let executionDetailRequest = 0;
let executionFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let executionPhaseTimer: ReturnType<typeof setTimeout> | null = null;

function clearExecutionTimers(): void {
  if (executionFallbackTimer) clearTimeout(executionFallbackTimer);
  if (executionPhaseTimer) clearTimeout(executionPhaseTimer);
  executionFallbackTimer = null;
  executionPhaseTimer = null;
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
  configPanelOpen: boolean;
  setConfigPanelOpen: (open: boolean) => void;

  // Node config editing
  updateNodeConfig: (id: string, config: Record<string, unknown>) => void;
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeControls: (id: string, patch: Partial<OttoNodeData>) => void;
  toggleNodeDisabled: (id: string) => void;

  // Node actions
  nodeClipboard: NodeClipboard | null;
  copyNodes: (ids?: string[]) => number;
  pasteNodes: () => number;
  duplicateNodes: (ids?: string[]) => number;
  deleteNodes: (ids?: string[]) => void;
  toggleNodesDisabled: (ids?: string[], disabled?: boolean) => void;
  selectNodes: (ids: string[]) => void;
  selectAllNodes: () => void;
  duplicateNode: (id: string) => void;
  deleteNode: (id: string) => void;

  // Workflow name + meta
  workflowName: string;
  setWorkflowName: (name: string) => void;
  workflowVersion: string;
  workflowActive: boolean;
  setWorkflowActive: (active: boolean) => void;
  workflowImportReport: ImportCompatibilityReport | null;
  setWorkflowImportReport: (report: ImportCompatibilityReport | null) => void;
  workflowSettings: WorkflowSettings;
  updateWorkflowSettings: (patch: Partial<WorkflowSettings>) => void;
  validationIssues: WorkflowValidationIssue[];
  setValidationIssues: (issues: WorkflowValidationIssue[]) => void;
  validateCurrentWorkflow: (mode?: ExecutionMode, nodeId?: string | null) => WorkflowValidationIssue[];

  // Saved workflow persistence
  savedWorkflowId: string | null;
  workflowList: WorkflowListItem[];
  workflowListLoading: boolean;
  workflowListHasMore: boolean;
  isSaving: boolean;
  saveStatus: WorkflowSaveStatus;
  saveError: string | null;
  markWorkflowDirty: () => void;
  saveWorkflow: () => Promise<void>;
  loadWorkflow: (id: string) => Promise<void>;
  restoreLastWorkflow: () => Promise<void>;
  fetchWorkflows: (reset?: boolean) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  newWorkflow: () => void;

  // Credentials
  credentials: Credential[];
  credentialsLoading: boolean;
  fetchCredentials: () => Promise<void>;
  createCredential: (name: string, type: string, data: Record<string, string>) => Promise<void>;
  updateCredential: (id: string, patch: { name?: string; type?: string; data?: Record<string, string> }) => Promise<void>;
  testCredential: (id: string, testUrl?: string) => Promise<{ ok: boolean; checked: string; status?: number; error?: string }>;
  deleteCredential: (id: string) => Promise<void>;

  // API keys
  apiKeys: ApiKey[];
  apiKeysLoading: boolean;
  fetchApiKeys: () => Promise<void>;
  createApiKey: (name: string) => Promise<string>;
  deleteApiKey: (id: string) => Promise<void>;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  activeSidebarTab: string;
  setActiveSidebarTab: (tab: string) => void;
  libraryFocusCategory: string | null;
  setLibraryFocusCategory: (cat: string | null) => void;

  // Canvas mode tabs + test input
  activeCanvasTab: 'editor' | 'executions' | 'test';
  setActiveCanvasTab: (tab: 'editor' | 'executions' | 'test') => void;
  testInputText: string;
  setTestInputText: (text: string) => void;

  // Pinned node data
  pinnedData: Record<string, unknown>;
  setPinnedDataForNode: (nodeId: string, data: unknown) => void;
  pinNodeOutput: (nodeId: string) => boolean;
  clearPinnedDataForNode: (nodeId: string) => void;
  clearAllPinnedData: () => void;

  // Bottom dock — individual panel visibility + layout
  bottomPanelsOpen: boolean;        // kept for backward-compat callers; maps to logsOpen
  setBottomPanelsOpen: (open: boolean) => void;
  ottobotOpen: boolean;
  logsOpen: boolean;
  dockHeight: number;               // persisted to localStorage
  dockSplit: number;                // 0–1, persisted to localStorage
  toggleOttobot: () => void;
  toggleLogs: () => void;
  setDockHeight: (h: number) => void;
  setDockSplit: (s: number) => void;

  // Fit view callback (registered by Canvas)
  fitViewCallback: (() => void) | null;
  setFitViewCallback: (fn: (() => void) | null) => void;

  // Context menu
  contextMenu: ContextMenuState | null;
  setContextMenu: (menu: ContextMenuState | null) => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Notifications
  notifications: OttoNotification[];
  unreadCount: number;
  addNotifications: (items: OttoNotification[]) => void;
  dismissNotification: (id: string) => void;
  removeNotification: (id: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;

  // Execution state
  executionPhase: ExecutionPhase;
  executionId: string | null;
  nodeExecutions: Record<string, NodeExecution>;
  selectedExecutionDetail: ExecutionDetail | null;
  executionDetailLoading: boolean;
  setExecutionStarted: (executionId: string) => void;
  setNodeExecutions: (executions: NodeExecution[]) => void;
  runExecution: (mode?: ExecutionMode, nodeId?: string | null) => Promise<void>;
  cancelExecution: () => Promise<void>;
  retryExecution: (executionId?: string | null) => Promise<void>;
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

function parseJsonObject(text: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Test input must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveNodeIds(nodes: Node[], selectedNodeId: string | null, ids?: string[]): string[] {
  const existing = new Set(nodes.map((node) => node.id));
  const explicit = ids?.filter((id, index, all) => existing.has(id) && all.indexOf(id) === index) ?? [];
  if (explicit.length > 0) return explicit;

  const selected = nodes
    .filter((node) => node.selected)
    .map((node) => node.id);
  if (selected.length > 0) return selected;

  return selectedNodeId && existing.has(selectedNodeId) ? [selectedNodeId] : [];
}

function cloneCanvasNode(node: Node, overrides: Partial<Node> = {}): Node {
  return {
    ...node,
    data: cloneValue(node.data ?? {}),
    position: { ...node.position },
    positionAbsolute: node.positionAbsolute ? { ...node.positionAbsolute } : undefined,
    selected: false,
    dragging: false,
    ...overrides,
  };
}

function cloneCanvasEdge(edge: Edge, overrides: Partial<Edge> = {}): Edge {
  return {
    ...edge,
    data: edge.data ? cloneValue(edge.data) : edge.data,
    style: edge.style ? { ...edge.style } : edge.style,
    selected: false,
    ...overrides,
  };
}

function cloneGraphSelection(sourceNodes: Node[], sourceEdges: Edge[], offset: number): { nodes: Node[]; edges: Edge[] } {
  const idMap = new Map<string, string>();
  const nodes = sourceNodes.map((node) => {
    const nextId = uuidv4();
    idMap.set(node.id, nextId);
    return cloneCanvasNode(node, {
      id: nextId,
      position: { x: node.position.x + offset, y: node.position.y + offset },
      selected: true,
    });
  });

  const edges: Edge[] = [];
  for (const edge of sourceEdges) {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) continue;
    edges.push(cloneCanvasEdge(edge, { id: uuidv4(), source, target }));
  }

  return { nodes, edges };
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
  selectNode: (id) => set((s) => ({
    selectedNodeId: id,
    configPanelOpen: id ? s.configPanelOpen : false,
  })),
  configPanelOpen: false,
  setConfigPanelOpen: (open) => set({ configPanelOpen: open }),

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

  updateNodeControls: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...patch } } : n
      ),
    })),

  toggleNodeDisabled: (id) =>
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, disabled: !n.data.disabled } } : n
      ),
    })),

  nodeClipboard: null,

  copyNodes: (ids) => {
    const { nodes, edges, selectedNodeId } = get();
    const nodeIds = resolveNodeIds(nodes, selectedNodeId, ids);
    if (nodeIds.length === 0) return 0;
    const selectedSet = new Set(nodeIds);
    const copiedNodes = nodes
      .filter((node) => selectedSet.has(node.id))
      .map((node) => cloneCanvasNode(node));
    const copiedEdges = edges
      .filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target))
      .map((edge) => cloneCanvasEdge(edge));

    set({ nodeClipboard: { nodes: copiedNodes, edges: copiedEdges, pasteCount: 1 } });
    return copiedNodes.length;
  },

  pasteNodes: () => {
    const { nodeClipboard } = get();
    if (!nodeClipboard || nodeClipboard.nodes.length === 0) return 0;

    const offset = 40 * Math.max(1, nodeClipboard.pasteCount);
    const graph = cloneGraphSelection(nodeClipboard.nodes, nodeClipboard.edges, offset);
    const firstNodeId = graph.nodes[0]?.id ?? null;

    set((s) => ({
      nodes: [
        ...s.nodes.map((node) => ({ ...node, selected: false })),
        ...graph.nodes,
      ],
      edges: [
        ...s.edges.map((edge) => ({ ...edge, selected: false })),
        ...graph.edges,
      ],
      selectedNodeId: firstNodeId,
      nodeClipboard: s.nodeClipboard
        ? { ...s.nodeClipboard, pasteCount: s.nodeClipboard.pasteCount + 1 }
        : s.nodeClipboard,
      validationIssues: [],
    }));

    return graph.nodes.length;
  },

  duplicateNodes: (ids) => {
    const { nodes, edges, selectedNodeId } = get();
    const nodeIds = resolveNodeIds(nodes, selectedNodeId, ids);
    if (nodeIds.length === 0) return 0;
    const selectedSet = new Set(nodeIds);
    const sourceNodes = nodes.filter((node) => selectedSet.has(node.id));
    const sourceEdges = edges.filter((edge) => selectedSet.has(edge.source) && selectedSet.has(edge.target));
    const graph = cloneGraphSelection(sourceNodes, sourceEdges, 36);
    const firstNodeId = graph.nodes[0]?.id ?? null;

    set((s) => ({
      nodes: [
        ...s.nodes.map((node) => ({ ...node, selected: false })),
        ...graph.nodes,
      ],
      edges: [
        ...s.edges.map((edge) => ({ ...edge, selected: false })),
        ...graph.edges,
      ],
      selectedNodeId: firstNodeId,
      validationIssues: [],
    }));

    return graph.nodes.length;
  },

  deleteNodes: (ids) => {
    const { nodes, selectedNodeId } = get();
    const nodeIds = resolveNodeIds(nodes, selectedNodeId, ids);
    if (nodeIds.length === 0) return;
    const selectedSet = new Set(nodeIds);

    set((s) => ({
      nodes: s.nodes.filter((node) => !selectedSet.has(node.id)),
      edges: s.edges.filter((edge) => !selectedSet.has(edge.source) && !selectedSet.has(edge.target)),
      selectedNodeId: s.selectedNodeId && selectedSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
      configPanelOpen: s.selectedNodeId && selectedSet.has(s.selectedNodeId) ? false : s.configPanelOpen,
      contextMenu: null,
      pinnedData: Object.fromEntries(Object.entries(s.pinnedData).filter(([nodeId]) => !selectedSet.has(nodeId))),
      validationIssues: s.validationIssues.filter((issue) => !issue.nodeId || !selectedSet.has(issue.nodeId)),
    }));
  },

  toggleNodesDisabled: (ids, disabled) => {
    const { nodes, selectedNodeId } = get();
    const nodeIds = resolveNodeIds(nodes, selectedNodeId, ids);
    if (nodeIds.length === 0) return;
    const selectedSet = new Set(nodeIds);
    const nextDisabled = disabled ?? !nodes
      .filter((node) => selectedSet.has(node.id))
      .every((node) => Boolean(node.data.disabled));

    set((s) => ({
      nodes: s.nodes.map((node) =>
        selectedSet.has(node.id)
          ? { ...node, data: { ...node.data, disabled: nextDisabled } }
          : node
      ),
      validationIssues: nextDisabled
        ? s.validationIssues.filter((issue) => !issue.nodeId || !selectedSet.has(issue.nodeId))
        : s.validationIssues,
    }));
  },

  selectNodes: (ids) => {
    const selectedSet = new Set(ids);
    const first = ids[0] ?? null;
    set((s) => ({
      nodes: s.nodes.map((node) => ({ ...node, selected: selectedSet.has(node.id) })),
      selectedNodeId: first,
    }));
  },

  selectAllNodes: () => {
    const { nodes } = get();
    set({
      nodes: nodes.map((node) => ({ ...node, selected: true })),
      selectedNodeId: nodes[0]?.id ?? null,
    });
  },

  duplicateNode: (id) => {
    get().duplicateNodes([id]);
  },

  deleteNode: (id) => get().deleteNodes([id]),

  workflowName: 'Untitled Workflow',
  setWorkflowName: (name) => set({ workflowName: name }),
  workflowVersion: 'v1.0.0',
  workflowActive: false,
  workflowImportReport: null,
  setWorkflowImportReport: (report) => set({ workflowImportReport: report }),
  workflowSettings: { ...DEFAULT_WORKFLOW_SETTINGS },
  updateWorkflowSettings: (patch) => set((s) => ({ workflowSettings: { ...s.workflowSettings, ...patch } })),
  validationIssues: [],
  setValidationIssues: (issues) => set({ validationIssues: issues }),
  validateCurrentWorkflow: (mode = 'full', nodeId = null) => {
    const { nodes, edges } = get();
    const issues = validateCanvasWorkflow(nodes, edges, { mode, nodeId });
    set({ validationIssues: issues });
    return issues;
  },
  setWorkflowActive: async (active) => {
    const request = ++workflowActiveRequest;
    const contextVersion = workflowContextVersion;
    const prev = get().workflowActive;
    set({ workflowActive: active });
    try {
      if (active && !get().savedWorkflowId) {
        await get().saveWorkflow();
      }
      // A delayed activation must never target a workflow opened while the save was pending.
      if (contextVersion !== workflowContextVersion || request !== workflowActiveRequest) return;
      const { savedWorkflowId } = get();
      if (savedWorkflowId) {
        await api.updateWorkflow(savedWorkflowId, { active });
        if (contextVersion === workflowContextVersion && request !== workflowActiveRequest) {
          // Concurrent toggle requests can reach the server out of order; reassert the latest choice after a stale response.
          await api.updateWorkflow(savedWorkflowId, { active: get().workflowActive });
        }
      }
    } catch (err) {
      const validation = (err as { validation?: { issues?: WorkflowValidationIssue[] } })?.validation;
      if (validation?.issues) set({ validationIssues: validation.issues });
      // An older failed toggle must not roll back a newer user choice.
      if (contextVersion === workflowContextVersion && request === workflowActiveRequest) set({ workflowActive: prev });
      throw err;
    }
  },

  // Saved workflow persistence
  savedWorkflowId: null,
  workflowList: [],
  workflowListLoading: false,
  workflowListHasMore: false,
  isSaving: false,
  saveStatus: 'saved',
  saveError: null,
  markWorkflowDirty: () => {
    if (activeWorkflowSave) workflowSaveQueued = true;
    set({ saveStatus: 'pending', saveError: null });
  },

  saveWorkflow: async () => {
    if (activeWorkflowSave) {
      workflowSaveQueued = true;
      set({ saveStatus: 'pending', saveError: null });
      return activeWorkflowSave;
    }

    let attemptedContextVersion = workflowContextVersion;
    activeWorkflowSave = (async () => {
      do {
        workflowSaveQueued = false;
        const saveContextVersion = workflowContextVersion;
        attemptedContextVersion = saveContextVersion;
        set({ isSaving: true, saveStatus: 'saving', saveError: null });

        const { nodes, edges, workflowName, savedWorkflowId, pinnedData, workflowImportReport, workflowSettings } = get();
        const definition = buildDefinition(nodes, edges, pinnedData, workflowImportReport, workflowSettings);
        const validationIssues = get().validateCurrentWorkflow('full', null);

        if (savedWorkflowId) {
          const res = await api.updateWorkflow(savedWorkflowId, { name: workflowName, definition, autosave: true });
          // Navigation/new-workflow can happen while the request is in flight; the old save must not overwrite the new editor.
          if (saveContextVersion !== workflowContextVersion) continue;
          if (res.validation?.issues) set({ validationIssues: res.validation.issues });
          writeLastWorkflowId(savedWorkflowId);
        } else {
          const { id, validation } = await api.createWorkflow(workflowName, definition);
          // A late create response used to attach its old id to a newly opened blank workflow.
          if (saveContextVersion !== workflowContextVersion) continue;
          set({ savedWorkflowId: id });
          if (validation?.issues) set({ validationIssues: validation.issues });
          writeLastWorkflowId(id);
        }

        void get().fetchWorkflows();
        if (validationIssues.some((issue) => issue.severity === 'warning')) {
          console.warn('Workflow saved with validation warnings', validationIssues);
        }
        set({ saveStatus: 'saved', saveError: null });
      } while (workflowSaveQueued);
    })();

    try {
      await activeWorkflowSave;
    } catch (err) {
      // Failure from an abandoned workflow must not mark the newly opened workflow as failed.
      if (attemptedContextVersion === workflowContextVersion) {
        set({
          saveStatus: 'error',
          saveError: err instanceof Error ? err.message : 'Workflow could not be saved',
        });
      }
      throw err;
    } finally {
      activeWorkflowSave = null;
      set({ isSaving: false });
      // If the new workflow became dirty while an obsolete save was failing, its save must not be lost.
      if (workflowSaveQueued && get().saveStatus === 'pending') void get().saveWorkflow().catch(() => {});
    }
  },

  loadWorkflow: async (id) => {
    const loadRequest = ++workflowLoadRequest;
    if (get().saveStatus === 'pending') {
      await get().saveWorkflow();
    } else if (activeWorkflowSave) {
      await activeWorkflowSave;
    }
    const wf = await api.getWorkflow(id);
    // Concurrent workflow loads may resolve out of order; only the latest navigation may commit state.
    if (loadRequest !== workflowLoadRequest) return;
    const def = wf.definition ?? { nodes: [], edges: [], pinnedData: {} };

    const loadedNodes = (def.nodes as Array<{
      id: string;
      type: string;
      name?: string;
      config?: Record<string, unknown>;
      position?: { x: number; y: number };
      disabled?: boolean;
      notes?: string;
      displayNote?: boolean;
      continueOnError?: boolean;
      retryOnFail?: boolean;
      maxTries?: number;
      retryDelayMs?: number;
      alwaysOutputData?: boolean;
      data?: Partial<OttoNodeData>;
    }>).map((n) => {
      const nodeType = n.type === 'ottoNode' || n.type === 'agentNode'
        ? (n.data?.nodeType ?? n.type)
        : n.type;
      const nodeDef = getNodeDef(nodeType);
      return {
        id: n.id,
        type: nodeType === 'ai_agent' ? 'agentNode' : 'ottoNode',
        position: n.position ?? { x: 100, y: 100 },
        data: {
          label: n.name ?? n.data?.label ?? nodeDef.label,
          nodeType,
          config: n.config ?? n.data?.config ?? (nodeDef?.defaultConfig ?? {}),
          disabled: n.disabled ?? n.data?.disabled ?? false,
          notes: n.notes ?? n.data?.notes ?? '',
          displayNote: n.displayNote ?? n.data?.displayNote ?? false,
          continueOnError: n.continueOnError ?? n.data?.continueOnError ?? false,
          retryOnFail: n.retryOnFail ?? n.data?.retryOnFail ?? false,
          maxTries: n.maxTries ?? n.data?.maxTries ?? 2,
          retryDelayMs: n.retryDelayMs ?? n.data?.retryDelayMs ?? 1000,
          alwaysOutputData: n.alwaysOutputData ?? n.data?.alwaysOutputData ?? false,
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

    const savedSettings = (def as { settings?: WorkflowSettings }).settings;
    workflowContextVersion += 1;
    get().resetExecution();
    set({
      savedWorkflowId: id,
      workflowName: wf.name,
      workflowActive: wf.active,
      nodes: loadedNodes,
      edges: loadedEdges,
      pinnedData: (def as { pinnedData?: Record<string, unknown> }).pinnedData ?? {},
      workflowImportReport: def.importReport ?? null,
      workflowSettings: savedSettings ? { ...DEFAULT_WORKFLOW_SETTINGS, ...savedSettings } : { ...DEFAULT_WORKFLOW_SETTINGS },
      saveStatus: 'saved',
      saveError: null,
      validationIssues: [],
      selectedNodeId: null,
      configPanelOpen: false,
    });
    writeLastWorkflowId(id);
  },

  restoreLastWorkflow: async () => {
    const id = readLastWorkflowId();
    if (!id) return;
    try {
      await get().loadWorkflow(id);
    } catch {
      // A failed stale restore used to erase the id written by a newer successful navigation.
      if (readLastWorkflowId() === id) writeLastWorkflowId(null);
    }
  },

  fetchWorkflows: async (reset = true) => {
    const request = ++workflowListRequest;
    const PAGE = 50;
    const current = reset ? [] : get().workflowList;
    set({ workflowListLoading: true });
    try {
      const list = await api.listWorkflows(PAGE, current.length);
      // Reset/load-more responses can arrive out of order and previously replaced the newer list.
      if (request === workflowListRequest) {
        set({ workflowList: reset ? list : [...current, ...list], workflowListHasMore: list.length === PAGE });
      }
    } finally {
      if (request === workflowListRequest) set({ workflowListLoading: false });
    }
  },

  deleteWorkflow: async (id) => {
    // Deleting while an autosave PUT is in flight could let the late save race the delete.
    if (get().saveStatus === 'pending') await get().saveWorkflow();
    else if (activeWorkflowSave) await activeWorkflowSave;
    await api.deleteWorkflow(id);
    const { savedWorkflowId } = get();
    if (readLastWorkflowId() === id) writeLastWorkflowId(null);
    if (savedWorkflowId === id) {
      workflowContextVersion += 1;
      workflowLoadRequest += 1;
      get().resetExecution();
      set({
        savedWorkflowId: null,
        workflowName: 'Untitled Workflow',
        nodes: [],
        edges: [],
        workflowActive: false,
        pinnedData: {},
        workflowImportReport: null,
        workflowSettings: { ...DEFAULT_WORKFLOW_SETTINGS },
        saveStatus: 'saved',
        saveError: null,
        selectedNodeId: null,
        configPanelOpen: false,
      });
    }
    get().fetchWorkflows();
  },

  newWorkflow: () => {
    // Invalidate late save/load responses so they cannot repopulate this new editor.
    workflowContextVersion += 1;
    workflowLoadRequest += 1;
    get().resetExecution();
    set({
      savedWorkflowId: null,
      workflowName: 'Untitled Workflow',
      workflowActive: false,
      nodes: [],
      edges: [],
      pinnedData: {},
      workflowImportReport: null,
      workflowSettings: { ...DEFAULT_WORKFLOW_SETTINGS },
      saveStatus: 'saved',
      saveError: null,
      validationIssues: [],
      selectedNodeId: null,
      configPanelOpen: false,
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

  updateCredential: async (id, patch) => {
    const updated = await api.updateCredential(id, patch);
    set((s) => ({ credentials: s.credentials.map((c) => (c.id === id ? updated : c)) }));
  },

  testCredential: async (id, testUrl) => {
    return api.testCredential(id, testUrl);
  },

  deleteCredential: async (id) => {
    await api.deleteCredential(id);
    set((s) => ({ credentials: s.credentials.filter((c) => c.id !== id) }));
  },

  apiKeys: [],
  apiKeysLoading: false,

  fetchApiKeys: async () => {
    set({ apiKeysLoading: true });
    try {
      const list = await api.listApiKeys();
      set({ apiKeys: list });
    } finally {
      set({ apiKeysLoading: false });
    }
  },

  createApiKey: async (name) => {
    const { apiKey, key } = await api.createApiKey(name);
    set((s) => ({ apiKeys: [apiKey, ...s.apiKeys] }));
    return key;
  },

  deleteApiKey: async (id) => {
    await api.deleteApiKey(id);
    set((s) => ({ apiKeys: s.apiKeys.filter((key) => key.id !== id) }));
  },

  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  activeSidebarTab: 'library',
  setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),
  libraryFocusCategory: null,
  setLibraryFocusCategory: (cat) => set({ libraryFocusCategory: cat }),

  activeCanvasTab: 'editor',
  setActiveCanvasTab: (tab) => set({ activeCanvasTab: tab }),
  testInputText: '{}',
  setTestInputText: (text) => set({ testInputText: text }),

  pinnedData: {},
  setPinnedDataForNode: (nodeId, data) =>
    set((s) => ({ pinnedData: { ...s.pinnedData, [nodeId]: data } })),
  pinNodeOutput: (nodeId) => {
    const current = get();
    const execution = current.nodeExecutions[nodeId]
      ?? current.selectedExecutionDetail?.nodes.find((ne) => ne.node_id === nodeId);
    if (!execution || execution.output == null) return false;
    current.setPinnedDataForNode(nodeId, execution.output);
    return true;
  },
  clearPinnedDataForNode: (nodeId) =>
    set((s) => ({
      pinnedData: Object.fromEntries(Object.entries(s.pinnedData).filter(([id]) => id !== nodeId)),
    })),
  clearAllPinnedData: () => set({ pinnedData: {} }),

  bottomPanelsOpen: false,
  // backward compat: opening "bottom panels" = opening the Logs pane
  setBottomPanelsOpen: (open) => set({ bottomPanelsOpen: open, logsOpen: open }),

  ottobotOpen: false,
  logsOpen: false,
  dockHeight: (() => { try { return Math.max(160, Number(localStorage.getItem('otto-dock-h') || '300')); } catch { return 300; } })(),
  dockSplit:  (() => { try { const v = Number(localStorage.getItem('otto-dock-split') || '0.5'); return v > 0 && v < 1 ? v : 0.5; } catch { return 0.5; } })(),
  toggleOttobot: () => set((s) => ({ ottobotOpen: !s.ottobotOpen })),
  toggleLogs:    () => set((s) => ({ logsOpen: !s.logsOpen })),
  setDockHeight: (h) => { try { localStorage.setItem('otto-dock-h', String(h)); } catch { /**/ } set({ dockHeight: h }); },
  setDockSplit:  (s) => { try { localStorage.setItem('otto-dock-split', String(s)); } catch { /**/ } set({ dockSplit: s }); },

  fitViewCallback: null,
  setFitViewCallback: (fn) => set({ fitViewCallback: fn }),

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
    (clearExecutionTimers(), executionDetailRequest += 1,
      set({ executionId, executionPhase: 'running', nodeExecutions: {}, selectedExecutionDetail: null })),

  setNodeExecutions: (executions) =>
    set({
      nodeExecutions: Object.fromEntries(executions.map((e) => [e.node_id, e])),
    }),

  runExecution: async (mode = 'full', nodeId = null) => {
    const {
      nodes,
      edges,
      workflowName,
      savedWorkflowId,
      workflowActive,
      selectedNodeId,
      pinnedData,
      workflowImportReport,
      workflowSettings,
      testInputText,
      executionPhase,
    } = get();

    if (executionPhase === 'running') return;
    if (workflowActive) {
      alert('Deactivate the workflow before running it manually.');
      return;
    }
    if (nodes.length === 0) {
      alert('Add some nodes first.');
      return;
    }

    const focusNodeId = mode === 'full' ? null : (nodeId ?? selectedNodeId);
    if (mode !== 'full' && !focusNodeId) {
      alert('Select a node first.');
      return;
    }
    if (focusNodeId && !nodes.some((n) => n.id === focusNodeId)) {
      alert('The selected node no longer exists.');
      return;
    }

    const validationIssues = get().validateCurrentWorkflow(mode, focusNodeId);
    const blockingIssues = validationIssues.filter((issue) => issue.severity === 'error');
    if (hasBlockingValidationIssues(validationIssues)) {
      alert(`Fix ${blockingIssues.length} validation error${blockingIssues.length === 1 ? '' : 's'} before running.`);
      return;
    }

    const riskyImportCount = workflowImportReport
      ? (workflowImportReport.summary.placeholder ?? 0) + (workflowImportReport.summary.unsupported ?? 0)
      : 0;
    if (riskyImportCount > 0) {
      const ok = confirm(
        `This imported n8n workflow still has ${riskyImportCount} placeholder/unsupported item${riskyImportCount === 1 ? '' : 's'}. ` +
        'Those nodes can fail at runtime until replaced. Continue running?'
      );
      if (!ok) return;
    }

    let input: Record<string, unknown>;
    try {
      input = parseJsonObject(testInputText);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
      return;
    }

    get().resetExecution();
    set({ bottomPanelsOpen: true, logsOpen: true });

    try {
      const definition = buildDefinition(nodes, edges, pinnedData, workflowImportReport, workflowSettings);
      const res = await api.execute(definition, input, workflowName, {
        savedWorkflowId,
        mode,
        nodeId: focusNodeId,
        pinnedData,
      });

      if (!savedWorkflowId && res.workflowId) {
        set({ savedWorkflowId: res.workflowId });
        writeLastWorkflowId(res.workflowId);
      }

      get().setExecutionStarted(res.executionId);
      get().startSSE(res.executionId);

      executionFallbackTimer = setTimeout(async () => {
        try {
          const detail = normalizeExecutionDetail(await api.getExecution(res.executionId));
          // A fallback fetch from an older run must not replace the currently selected execution.
          if (get().executionId !== res.executionId) return;
          set({
            selectedExecutionDetail: detail,
            nodeExecutions: Object.fromEntries(detail.nodes.map((ne) => [ne.node_id, ne])),
          });
        } catch {
          // SSE remains the primary live update path.
        }
      }, 3000);
    } catch (err: unknown) {
      const validation = (err as { validation?: { issues?: WorkflowValidationIssue[] } })?.validation;
      if (validation?.issues) set({ validationIssues: validation.issues });
      set({ executionPhase: 'error' });
      alert(`Run failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  cancelExecution: async () => {
    const executionId = get().executionId;
    if (!executionId) return;
    try {
      await api.cancelExecution(executionId);
      get().stopSSE();
      await get().loadExecutionDetail(executionId).catch(() => null);
    } catch (err: unknown) {
      alert(`Cancel failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  retryExecution: async (executionId = get().executionId) => {
    if (!executionId) return;
    get().resetExecution();
    set({ bottomPanelsOpen: true, logsOpen: true });
    try {
      const res = await api.retryExecution(executionId);
      get().setExecutionStarted(res.executionId);
      get().startSSE(res.executionId);

      executionFallbackTimer = setTimeout(async () => {
        try {
          const detail = normalizeExecutionDetail(await api.getExecution(res.executionId));
          // A retry fallback can resolve after another run has started.
          if (get().executionId !== res.executionId) return;
          set({
            selectedExecutionDetail: detail,
            nodeExecutions: Object.fromEntries(detail.nodes.map((ne) => [ne.node_id, ne])),
          });
        } catch {
          // SSE remains the primary live update path.
        }
      }, 3000);
    } catch (err: unknown) {
      set({ executionPhase: 'error' });
      alert(`Retry failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  loadExecutionDetail: async (executionId) => {
    const request = ++executionDetailRequest;
    set({ executionDetailLoading: true });
    try {
      const detail = normalizeExecutionDetail(await api.getExecution(executionId));
      // History selections can resolve out of order; keep the most recently requested detail.
      if (request !== executionDetailRequest) return;
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
      if (request === executionDetailRequest) set({ executionDetailLoading: false });
    }
  },

  setExecutionPhase: (phase) => set({ executionPhase: phase }),

  resetExecution: () => {
    get().stopSSE();
    clearExecutionTimers();
    executionDetailRequest += 1;
    set({ executionId: null, executionPhase: 'idle', nodeExecutions: {} });
  },

  startSSE: (executionId) => {
    get().stopSSE();
    const source = api.streamExecution(executionId);

    // Closing EventSource does not discard already-queued callbacks; stale events must be ignored explicitly.
    const isCurrentSource = () => get()._sseSource === source && get().executionId === executionId;

    const mergeEvent = (raw: unknown, status: NodeExecution['status']) => {
      if (!isCurrentSource()) return;
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
        if (!isCurrentSource()) return;
        const data = normalizeExecutionDetail(JSON.parse(e.data) as ExecutionDetail);
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
        if (!isCurrentSource()) return;
        const data = JSON.parse(e.data) as { status: string };
        const phase = data.status === 'success' ? 'success' : data.status === 'cancelled' ? 'idle' : 'error';
        set({ executionPhase: phase });
        api.getExecution(executionId).then((rawDetail) => {
          if (get().executionId !== executionId) return;
          const detail = normalizeExecutionDetail(rawDetail);
          set({
            selectedExecutionDetail: detail,
            nodeExecutions: Object.fromEntries(detail.nodes.map((ne) => [ne.node_id, ne])),
          });
        }).catch((err) => console.warn('Could not refresh completed execution detail', err));
        executionPhaseTimer = setTimeout(() => {
          // The old completion timer previously reset a newer run to idle.
          if (get().executionId === executionId) set({ executionPhase: 'idle' });
        }, 3000);
      } catch {}
      get().stopSSE();
    });

    source.onerror = () => {
      if (!isCurrentSource()) return;
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

  // Notifications — bootstrapped from localStorage
  notifications: loadStoredNotifications(),
  unreadCount: loadStoredNotifications().filter((n) => n.urgent).length,
  addNotifications: (items) => set((s) => {
    const existingIds = new Set(s.notifications.map((n) => n.id));
    const fresh = items.filter((n) => !existingIds.has(n.id));
    if (!fresh.length) return s;
    const all = [...fresh, ...s.notifications].slice(0, 100);
    persistNotifications(all);
    return { notifications: all, unreadCount: all.filter((n) => n.urgent).length };
  }),
  dismissNotification: (id) => set((s) => {
    const next = s.notifications.map((n) => n.id === id ? { ...n, urgent: false } : n);
    persistNotifications(next);
    return { notifications: next, unreadCount: next.filter((n) => n.urgent).length };
  }),
  removeNotification: (id) => set((s) => {
    const next = s.notifications.filter((n) => n.id !== id);
    persistNotifications(next);
    return { notifications: next, unreadCount: next.filter((n) => n.urgent).length };
  }),
  markAllRead: () => set((s) => {
    const next = s.notifications.map((n) => ({ ...n, urgent: false }));
    persistNotifications(next);
    return { notifications: next, unreadCount: 0 };
  }),
  clearNotifications: () => {
    persistNotifications([]);
    set({ notifications: [], unreadCount: 0 });
  },
}));

export function buildDefinition(
  nodes: Node[],
  edges: Edge[],
  pinnedData: Record<string, unknown> = {},
  importReport: ImportCompatibilityReport | null = null,
  settings?: WorkflowSettings
) {
  const definition: {
    nodes: Array<{
      id: string;
      type: string;
      name: string;
      config: Record<string, unknown>;
      position: Node['position'];
      disabled?: boolean;
      notes?: string;
      displayNote?: boolean;
      continueOnError?: boolean;
      retryOnFail?: boolean;
      maxTries?: number;
      retryDelayMs?: number;
      alwaysOutputData?: boolean;
    }>;
    edges: Array<{ id: string; source: string; target: string; sourceHandle: string | null; targetHandle: string | null }>;
    pinnedData: Record<string, unknown>;
    importReport?: ImportCompatibilityReport;
    settings?: WorkflowSettings;
  } = {
    nodes: nodes.map((n) => {
      const data = n.data as OttoNodeData;
      return {
        id: n.id,
        type: data.nodeType,
        name: data.label,
        config: data.config ?? {},
        position: n.position,
        disabled: Boolean(data.disabled),
        notes: String(data.notes ?? ''),
        displayNote: Boolean(data.displayNote),
        continueOnError: Boolean(data.continueOnError),
        retryOnFail: Boolean(data.retryOnFail),
        maxTries: Math.max(1, Number(data.maxTries ?? 2) || 2),
        retryDelayMs: Math.max(0, Number(data.retryDelayMs ?? 1000) || 0),
        alwaysOutputData: Boolean(data.alwaysOutputData),
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
    })),
    pinnedData,
  };
  if (importReport) definition.importReport = importReport;
  if (settings) definition.settings = settings;
  return definition;
}
