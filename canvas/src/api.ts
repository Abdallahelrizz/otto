import type { ExecutionDetail, WorkflowListItem, Credential, Integration } from './types';

const BASE = '/api/v1';
const WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ── Executions ────────────────────────────────────────────────────────────
  async execute(definition: unknown, input: Record<string, unknown> = {}) {
    return req<{ executionId: string; workflowId: string }>('/execute', {
      method: 'POST',
      body: JSON.stringify({ definition, input }),
    });
  },

  async executeSaved(savedWorkflowId: string, input: Record<string, unknown> = {}) {
    return req<{ executionId: string; workflowId: string }>('/execute', {
      method: 'POST',
      body: JSON.stringify({ savedWorkflowId, input }),
    });
  },

  async getExecution(executionId: string): Promise<ExecutionDetail> {
    return req(`/executions/${executionId}`);
  },

  async listExecutions(workflowId?: string, page = 1, limit = 20) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (workflowId) params.set('workflowId', workflowId);
    return req<{ executions: ExecutionDetail['execution'][]; total: number; page: number; limit: number }>(
      `/executions?${params}`
    );
  },

  streamExecution(executionId: string): EventSource {
    return new EventSource(`${BASE}/executions/${executionId}/stream`);
  },

  // ── Workflows ──────────────────────────────────────────────────────────────
  async listWorkflows() {
    return req<WorkflowListItem[]>(`/workflows?workspaceId=${WORKSPACE_ID}`);
  },

  async getWorkflow(id: string) {
    return req<{ id: string; name: string; active: boolean; definition: { nodes: unknown[]; edges: unknown[] } }>(
      `/workflows/${id}`
    );
  },

  async createWorkflow(name: string, definition: unknown) {
    return req<{ id: string }>('/workflows', {
      method: 'POST',
      body: JSON.stringify({ name, definition, workspaceId: WORKSPACE_ID }),
    });
  },

  async updateWorkflow(id: string, patch: { name?: string; definition?: unknown; active?: boolean }) {
    return req<{ id: string }>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...patch, workspaceId: WORKSPACE_ID }),
    });
  },

  async deleteWorkflow(id: string) {
    return req<void>(`/workflows/${id}`, { method: 'DELETE' });
  },

  async duplicateWorkflow(id: string) {
    return req<{ id: string }>(`/workflows/${id}/duplicate`, { method: 'POST' });
  },

  // ── Credentials ────────────────────────────────────────────────────────────
  async listCredentials() {
    return req<Credential[]>(`/credentials?workspaceId=${WORKSPACE_ID}`);
  },

  async createCredential(name: string, type: string, data: Record<string, string>) {
    return req<{ id: string; name: string; type: string }>('/credentials', {
      method: 'POST',
      body: JSON.stringify({ name, type, data, workspaceId: WORKSPACE_ID }),
    });
  },

  async deleteCredential(id: string) {
    return req<void>(`/credentials/${id}`, { method: 'DELETE' });
  },

  // ── Import ─────────────────────────────────────────────────────────────────
  async importN8n(json: unknown) {
    return req<{ id: string; warnings: string[] }>('/import/n8n', {
      method: 'POST',
      body: JSON.stringify({ json, workspaceId: WORKSPACE_ID }),
    });
  },

  // ── Integrations ───────────────────────────────────────────────────────────
  async listIntegrations() {
    return req<Integration[]>('/integrations');
  },

  async listInstalledIntegrations() {
    return req<Integration[]>(`/integrations/installed?workspaceId=${WORKSPACE_ID}`);
  },

  async installIntegration(id: string) {
    return req<void>(`/integrations/${id}/install`, {
      method: 'POST',
      body: JSON.stringify({ workspaceId: WORKSPACE_ID }),
    });
  },

  async uninstallIntegration(id: string) {
    return req<void>(`/integrations/${id}/install`, {
      method: 'DELETE',
      body: JSON.stringify({ workspaceId: WORKSPACE_ID }),
    });
  },
};
