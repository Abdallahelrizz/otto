import type { AuthStatus, ExecutionDetail, WorkflowListItem, Credential, Integration } from './types';

const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_ORIGIN = metaEnv?.VITE_API_URL?.replace(/\/$/, '') ?? '';
const BASE = API_ORIGIN.endsWith('/api/v1') ? API_ORIGIN : `${API_ORIGIN}/api/v1`;

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = { ...(options?.headers ?? {}) } as Record<string, string>;
  if (options?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers,
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = err.details?.length ? `${err.error}: ${err.details.join(', ')}` : err.error;
    throw new Error(msg ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  async authStatus() {
    return req<AuthStatus>('/auth/status');
  },

  async setupOwner(payload: { email: string; name?: string; password: string; workspaceName?: string }) {
    return req<AuthStatus>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(payload: { email: string; password: string }) {
    return req<AuthStatus>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async logout() {
    return req<{ ok: true }>('/auth/logout', { method: 'POST' });
  },

  async me() {
    return req<AuthStatus>('/auth/me');
  },

  // Executions
  async execute(definition: unknown, input: Record<string, unknown> = {}, name?: string) {
    return req<{ executionId: string; workflowId: string; status: string }>('/execute', {
      method: 'POST',
      body: JSON.stringify({ definition, input, name }),
    });
  },

  async executeSaved(savedWorkflowId: string, input: Record<string, unknown> = {}) {
    return req<{ executionId: string; workflowId: string; status: string }>('/execute', {
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
    return new EventSource(`${BASE}/executions/${executionId}/stream`, { withCredentials: true });
  },

  // Workflows
  async listWorkflows(limit = 50, offset = 0) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await req<{ workflows: WorkflowListItem[] }>(`/workflows?${params}`);
    return res.workflows;
  },

  async getWorkflow(id: string) {
    const res = await req<{ workflow: { id: string; name: string; active: boolean; definition: { nodes: unknown[]; edges: unknown[] } } }>(
      `/workflows/${id}`
    );
    return res.workflow;
  },

  async createWorkflow(name: string, definition: unknown) {
    return req<{ id: string }>('/workflows', {
      method: 'POST',
      body: JSON.stringify({ name, definition }),
    });
  },

  async updateWorkflow(id: string, patch: { name?: string; definition?: unknown; active?: boolean }) {
    return req<{ id: string }>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async deleteWorkflow(id: string) {
    return req<void>(`/workflows/${id}`, { method: 'DELETE' });
  },

  async duplicateWorkflow(id: string) {
    return req<{ id: string }>(`/workflows/${id}/duplicate`, { method: 'POST' });
  },

  // Credentials
  async listCredentials() {
    const res = await req<{ credentials: Credential[] }>('/credentials');
    return res.credentials;
  },

  async createCredential(name: string, type: string, data: Record<string, string>) {
    return req<{ id: string; name: string; type: string }>('/credentials', {
      method: 'POST',
      body: JSON.stringify({ name, type, data }),
    });
  },

  async deleteCredential(id: string) {
    return req<void>(`/credentials/${id}`, { method: 'DELETE' });
  },

  // Import
  async importN8n(json: unknown) {
    return req<{ id: string; warnings: string[] }>('/import/n8n', {
      method: 'POST',
      body: JSON.stringify({ n8nJson: json }),
    });
  },

  // Integrations
  async listIntegrations() {
    const res = await req<{ integrations: Integration[] }>('/integrations');
    return res.integrations;
  },

  async listInstalledIntegrations() {
    const res = await req<{ integrations: Integration[] }>('/integrations/installed');
    return res.integrations;
  },

  async installIntegration(id: string) {
    return req<void>(`/integrations/${id}/install`, { method: 'POST' });
  },

  async uninstallIntegration(id: string) {
    return req<void>(`/integrations/${id}/install`, { method: 'DELETE' });
  },
};
