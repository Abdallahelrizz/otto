import type { Workflow, Execution, Credential, ObservabilitySummary, User } from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  workflows: {
    list: () => req<{ workflows: Workflow[] }>('/workflows'),
    get: (id: string) => req<{ workflow: Workflow }>(`/workflows/${id}`),
    create: (data: { name: string; definition?: unknown }) =>
      req<{ id: string }>('/workflows', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: unknown) =>
      req<{ ok: boolean }>(`/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/workflows/${id}`, { method: 'DELETE' }),
    execute: (id: string) =>
      req<{ executionId: string }>(`/workflows/${id}/execute`, { method: 'POST' }),
  },

  executions: {
    list: (workflowId?: string, page = 1, limit = 50) => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (workflowId) params.set('workflowId', workflowId);
      return req<{ executions: Execution[]; total: number }>(`/executions?${params}`);
    },
    get: (id: string) => req<{ execution: Execution; nodes: unknown[] }>(`/executions/${id}`),
    cancel: (id: string) =>
      req<{ ok: boolean; status: string }>(`/executions/${id}/cancel`, { method: 'POST' }),
    retry: (id: string) =>
      req<{ executionId: string }>(`/executions/${id}/retry`, { method: 'POST' }),
  },

  credentials: {
    list: () => req<{ credentials: Credential[] }>('/credentials'),
    create: (data: { name: string; type: string; data: Record<string, string> }) =>
      req<{ id: string }>('/credentials', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: string) => req<void>(`/credentials/${id}`, { method: 'DELETE' }),
    test: (id: string) =>
      req<{ ok: boolean; error?: string }>(`/credentials/${id}/test`, { method: 'POST' }),
  },

  observability: {
    summary: (days = 7, workflowId?: string) => {
      const params = new URLSearchParams({ days: String(days) });
      if (workflowId) params.set('workflowId', workflowId);
      return req<ObservabilitySummary>(`/observability/summary?${params}`);
    },
  },

  auth: {
    status: () => req<{ authenticated: boolean }>('/auth/status'),
    me: () => req<{ user: User }>('/auth/me'),
  },
};
