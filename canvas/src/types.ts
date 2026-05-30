export type NodeStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';
export type ExecutionPhase = 'idle' | 'running' | 'success' | 'error';
export type ExecutionMode = 'full' | 'single_node' | 'to_node' | 'from_node';

export interface OttoNodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
  disabled?: boolean;
  notes?: string;
  displayNote?: boolean;
  continueOnError?: boolean;
  retryOnFail?: boolean;
  maxTries?: number;
  retryDelayMs?: number;
  alwaysOutputData?: boolean;
}

export interface NodeExecution {
  id: string;
  node_id: string;
  node_name: string;
  node_type: string;
  status: NodeStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  input: unknown;
  output: unknown;
  error: string | null;
  retry_count: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  model?: string | null;
}

export interface Execution {
  id: string;
  workflow_id: string;
  workflow_name?: string | null;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  trigger_type: string;
  executionType?: string;
  mode?: ExecutionMode;
  focus_node_id?: string | null;
  pinned_data?: Record<string, unknown>;
  input: unknown;
  error: string | null;
}

export interface ExecutionDetail {
  execution: Execution;
  nodes: NodeExecution[];
}

export interface WorkflowNodePreview {
  id: string;
  type: string;
  position: { x: number; y: number };
}

export interface WorkflowEdgePreview {
  id: string;
  source: string;
  target: string;
}

export interface WorkflowListItem {
  id: string;
  name: string;
  active: boolean;
  tags?: string[];
  created_at: string;
  updated_at: string;
  definition?: {
    nodes: WorkflowNodePreview[];
    edges: WorkflowEdgePreview[];
  };
}

export type ImportCompatibilityStatus = 'exact' | 'partial' | 'placeholder' | 'unsupported';

export interface ImportCompatibilityNode {
  id: string;
  name: string;
  n8nType: string;
  ottoType: string;
  status: ImportCompatibilityStatus;
  notes: string[];
}

export interface ImportCompatibilityReport {
  source: 'n8n';
  workflowName: string | null;
  summary: Record<ImportCompatibilityStatus, number>;
  nodes: ImportCompatibilityNode[];
  warnings: string[];
  unsupportedConnections: Array<{ sourceName: string; connectionType: string }>;
}

export interface WorkflowSettings {
  timezone: string;
  timeoutSeconds: number | null;
  errorWorkflowId: string | null;
  saveOnSuccess: boolean;
  saveOnError: boolean;
  saveManual: boolean;
  callerPolicy?: 'any' | 'none' | 'same_workspace';  // default: 'any'
}

export const DEFAULT_WORKFLOW_SETTINGS: WorkflowSettings = {
  timezone: 'UTC',
  timeoutSeconds: null,
  errorWorkflowId: null,
  saveOnSuccess: true,
  saveOnError: true,
  saveManual: true,
  callerPolicy: 'any',
};

export interface WorkflowDefinition {
  nodes: unknown[];
  edges: unknown[];
  pinnedData?: Record<string, unknown>;
  importReport?: ImportCompatibilityReport | null;
  settings?: WorkflowSettings;
}

export type WorkflowValidationSeverity = 'error' | 'warning';

export interface WorkflowValidationIssue {
  severity: WorkflowValidationSeverity;
  code: string;
  message: string;
  nodeId: string | null;
  nodeName: string | null;
  nodeType: string | null;
  field: string | null;
}

export interface WorkflowValidationResult {
  ok: boolean;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: WorkflowValidationIssue[];
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}

export interface TriggerSample {
  node_id: string;
  trigger_type: 'webhook' | 'form' | 'chat';
  payload: unknown;
  received_at: string;
}

export interface ObservabilitySummary {
  rangeDays: number;
  workflowId: string | null;
  totals: {
    executions: number;
    completed: number;
    successRate: number;
    errorRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
    tokens: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };
  byStatus: Record<'pending' | 'running' | 'success' | 'error' | 'cancelled', number>;
  daily: Array<{ day: string; total: number; success: number; error: number }>;
  slowNodes: Array<{
    node_id: string;
    node_name: string | null;
    node_type: string | null;
    runs: number;
    avg_duration_ms: number;
    p95_duration_ms: number;
    max_duration_ms: number;
  }>;
  errorNodes: Array<{
    node_id: string;
    node_name: string | null;
    node_type: string | null;
    errors: number;
    last_error_at: string | null;
    last_error: string | null;
  }>;
  recentErrors: Array<{
    id: string;
    workflow_id: string;
    workflow_name: string | null;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
  }>;
}

export interface UsageByModel {
  model: string;
  totalTokens: number;
}

export interface UsageByWorkflow {
  workflowId: string | null;
  name: string | null;
  runs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  byModel: UsageByModel[];
}

export interface UsageSummary {
  period: { from: string; to: string; label: string; isCurrentMonth: boolean };
  retention: { cutoff: string; beyondRetention: boolean };
  totals: { promptTokens: number; completionTokens: number; totalTokens: number; runs: number };
  byWorkflow: UsageByWorkflow[];
  daily: Array<{ day: string; totalTokens: number }>;
  models: string[];
}

export interface Credential {
  id: string;
  name: string;
  type: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string | null;
  scopes: string[];
  expires_at: string | null;
  last_used_at: string | null;
  last_used_ip: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface MemoryPattern {
  id: string;
  content: string;
  category: string | null;
  confidence: number | null;
  hit_count: number;
  last_invoked_at: string | null;
}

export interface MemoryInteraction {
  id: string;
  session_id: string;
  input: string | null;
  output: string | null;
  confidence: number | null;
  created_at: string;
}

export interface MemorySummary {
  session_id: string;
  summary: string | null;
  turn_count: number;
  updated_at: string;
}

export interface Integration {
  id: string;
  slug?: string;
  name: string;
  type?: string;
  description: string | null;
  icon_url: string | null;
  category: string | null;
  installed_at?: string;
  credential_schema?: unknown;
  node_types?: unknown;
  version?: string;
  official?: boolean;
}

export interface Variable {
  id: string;
  name: string;
  value: string;
  type: string;
  description: string | null;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthWorkspace {
  id: string;
  name: string;
  plan: string;
}

export interface AuthStatus {
  setupRequired?: boolean;
  authenticated?: boolean;
  user?: AuthUser | null;
  workspace?: AuthWorkspace | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}
