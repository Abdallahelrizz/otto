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
