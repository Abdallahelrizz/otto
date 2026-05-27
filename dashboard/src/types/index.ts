export interface Workflow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'pending' | 'running' | 'success' | 'error' | 'cancelled';
  triggerType: 'webhook' | 'manual' | 'schedule' | 'subworkflow' | 'form' | 'chat';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface Credential {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

export interface ObservabilitySummary {
  totals: {
    executions: number;
    successRate: number;
    errorRate: number;
    avgDurationMs: number;
    p95DurationMs: number;
  };
  byStatus: Record<string, number>;
  daily: Array<{ day: string; total: number; success: number; error: number }>;
  slowNodes: Array<{
    node_id: string;
    node_name: string;
    avg_duration_ms: number;
  }>;
  errorNodes: Array<{
    node_id: string;
    node_name: string;
    errors: number;
  }>;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}
