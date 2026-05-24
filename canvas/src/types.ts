export type NodeStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped';
export type ExecutionPhase = 'idle' | 'running' | 'success' | 'error';

export interface OttoNodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
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
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  started_at: string | null;
  completed_at: string | null;
  trigger_type: string;
  input: unknown;
  error: string | null;
}

export interface ExecutionDetail {
  execution: Execution;
  nodes: NodeExecution[];
}

export interface WorkflowListItem {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Credential {
  id: string;
  name: string;
  type: string;
  created_at: string;
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
