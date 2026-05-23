import type { ExecutionDetail } from './types';

const BASE = '/api/v1';

export const api = {
  async execute(definition: unknown, input: Record<string, unknown> = {}) {
    const res = await fetch(`${BASE}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ definition, input }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? 'Execute failed');
    }
    return res.json() as Promise<{ executionId: string; workflowId: string }>;
  },

  async getExecution(executionId: string): Promise<ExecutionDetail> {
    const res = await fetch(`${BASE}/executions/${executionId}`);
    if (!res.ok) throw new Error(`Failed to fetch execution ${executionId}`);
    return res.json();
  },
};
