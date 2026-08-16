import type {
  AuthStatus,
  ExecutionDetail,
  WorkflowListItem,
  Credential,
  Integration,
  ExecutionMode,
  ApiKey,
  Variable,
  MemoryInteraction,
  MemoryPattern,
  MemorySummary,
  ImportCompatibilityReport,
  WorkflowDefinition,
  WorkflowValidationResult,
  ObservabilitySummary,
  TriggerSample,
  UsageSummary,
  AuditEvent,
} from './types';

const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const API_ORIGIN = metaEnv?.VITE_API_URL?.replace(/\/$/, '') ?? '';
const BASE = API_ORIGIN.endsWith('/api/v1') ? API_ORIGIN : `${API_ORIGIN}/api/v1`;

function getCsrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find(r => r.startsWith('otto-csrf='))
    ?.split('=')[1];
}

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = { ...(options?.headers ?? {}) } as Record<string, string>;
  if (options?.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  // Attach CSRF token on state-changing requests (double-submit cookie pattern)
  const method = (options?.method ?? 'GET').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers,
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const details = Array.isArray(err.details)
      ? err.details
      : Array.isArray(err.validation?.issues)
        ? err.validation.issues
        : [];
    const detailText = details
      .map((detail: unknown) => (
        typeof detail === 'string'
          ? detail
          : (detail as { nodeName?: string | null; field?: string | null; message?: string })?.nodeName
            ? `${(detail as { nodeName?: string | null }).nodeName}: ${(detail as { field?: string | null; message?: string }).field ? `${(detail as { field?: string | null }).field}: ` : ''}${(detail as { message?: string }).message ?? 'Validation issue'}`
            : (detail as { message?: string })?.message ?? String(detail)
      ))
      .join(', ');
    const msg = detailText ? `${err.error}: ${detailText}` : err.error;
    const apiError = new Error(msg ?? `Request failed: ${res.status}`) as Error & { details?: unknown[]; validation?: unknown };
    apiError.details = details;
    apiError.validation = err.validation;
    throw apiError;
  }
  // A successful 204 has no JSON body; parsing it made completed deletes reject in the UI.
  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface ExecuteOptions {
  mode?: ExecutionMode;
  nodeId?: string | null;
  pinnedData?: Record<string, unknown>;
  savedWorkflowId?: string | null;
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

  async updateOttobotSettings(settings: Partial<import('./types').OttobotSettings>) {
    return req<{ ok: true; ottobot_settings: import('./types').OttobotSettings }>('/workspace/ottobot-settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },

  // Executions
  async execute(definition: unknown, input: Record<string, unknown> = {}, name?: string, options: ExecuteOptions = {}) {
    return req<{ executionId: string; workflowId: string; status: string; validation?: WorkflowValidationResult }>('/execute', {
      method: 'POST',
      body: JSON.stringify({
        definition,
        input,
        name,
        savedWorkflowId: options.savedWorkflowId ?? undefined,
        mode: options.mode ?? 'full',
        nodeId: options.nodeId ?? undefined,
        pinnedData: options.pinnedData ?? {},
      }),
    });
  },

  async executeSaved(savedWorkflowId: string, input: Record<string, unknown> = {}, options: ExecuteOptions = {}) {
    return req<{ executionId: string; workflowId: string; status: string; validation?: WorkflowValidationResult }>('/execute', {
      method: 'POST',
      body: JSON.stringify({
        savedWorkflowId,
        input,
        mode: options.mode ?? 'full',
        nodeId: options.nodeId ?? undefined,
        pinnedData: options.pinnedData ?? {},
      }),
    });
  },

  async getExecution(executionId: string): Promise<ExecutionDetail> {
    return req(`/executions/${executionId}`);
  },

  /**
   * Cancel a running execution.
   *
   * `aborted: true` means a run in the API process was signalled — in-flight HTTP/LLM
   * requests are aborted and no further nodes start. `aborted: false` means this
   * process wasn't running it (already finished, or another worker owns it); the row
   * is marked cancelled but a run in a different worker is NOT stopped.
   *
   * Cancel stops future work. It does NOT undo side effects already sent (a POST that
   * landed, an email delivered), and an LLM provider may still bill for tokens already
   * generated. Don't present this as "undo" in the UI.
   */
  async cancelExecution(executionId: string) {
    return req<{
      ok: boolean;
      status: 'cancelled' | 'cancelling';
      aborted?: boolean;
      removedJob?: boolean;
      note?: string;
    }>(`/executions/${executionId}/cancel`, { method: 'POST' });
  },

  async retryExecution(executionId: string) {
    return req<{ executionId: string; workflowId: string; status: string }>(`/executions/${executionId}/retry`, { method: 'POST' });
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

  // OttoBot
  async ottobotCredentials(): Promise<{ credentials: Array<{ id: string; name: string; type: string }> }> {
    return req('/ottobot/credentials');
  },

  ottobotChat(
    messages: Array<{ role: string; content: string }>,
    credentialId?: string | null,
  ): Promise<Response> {
    const csrfToken = document.cookie
      .split('; ')
      .find(r => r.startsWith('otto-csrf='))
      ?.split('=')[1];

    return fetch(`${BASE}/ottobot/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      body: JSON.stringify({ messages, credentialId: credentialId ?? null }),
    });
  },

  async expressionPreview(
    expression: string,
    opts: { executionId?: string | null; nodeId?: string | null } = {}
  ): Promise<{ ok: boolean; result?: string; resolvedType?: string; error?: string }> {
    return req<{ ok: boolean; result?: string; resolvedType?: string; error?: string }>(
      '/expressions/preview',
      {
        method: 'POST',
        body: JSON.stringify({ expression, executionId: opts.executionId ?? null, nodeId: opts.nodeId ?? null }),
      }
    );
  },

  // Workflows
  async listWorkflows(limit = 50, offset = 0) {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await req<{ workflows: WorkflowListItem[] }>(`/workflows?${params}`);
    return res.workflows;
  },

  async getWorkflow(id: string) {
    const res = await req<{ workflow: { id: string; name: string; active: boolean; definition: WorkflowDefinition } }>(
      `/workflows/${id}`
    );
    return res.workflow;
  },

  async createWorkflow(name: string, definition: unknown) {
    return req<{ id: string; validation?: WorkflowValidationResult }>('/workflows', {
      method: 'POST',
      body: JSON.stringify({ name, definition }),
    });
  },

  async updateWorkflow(id: string, patch: { name?: string; definition?: unknown; active?: boolean; autosave?: boolean }) {
    return req<{ id: string; validation?: WorkflowValidationResult }>(`/workflows/${id}`, {
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

  async listWorkflowVersions(id: string) {
    const res = await req<{ versions: Array<{ version_number: number; created_at: string; created_by_email: string | null }> }>(`/workflows/${id}/versions`);
    return res.versions;
  },

  async restoreWorkflowVersion(id: string, vnum: number) {
    return req<{ ok: boolean; restoredFrom: number; newVersion: number }>(`/workflows/${id}/versions/${vnum}/restore`, { method: 'POST' });
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

  async updateCredential(id: string, patch: { name?: string; type?: string; data?: Record<string, string> }) {
    return req<Credential>(`/credentials/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async testCredential(id: string, testUrl?: string) {
    return req<{ ok: boolean; checked: string; status?: number; error?: string }>(`/credentials/${id}/test`, {
      method: 'POST',
      body: JSON.stringify(testUrl ? { testUrl } : {}),
    });
  },

  async deleteCredential(id: string) {
    return req<void>(`/credentials/${id}`, { method: 'DELETE' });
  },

  binaryDownloadUrl(id: string) {
    return `${BASE}/binary/${encodeURIComponent(id)}/download`;
  },

  // API keys
  async listApiKeys() {
    const res = await req<{ apiKeys: ApiKey[] }>('/api-keys');
    return res.apiKeys;
  },

  async createApiKey(name: string, opts: { scopes?: string[]; expiresInDays?: number | null } = {}) {
    return req<{ apiKey: ApiKey; key: string }>('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name, scopes: opts.scopes, expiresInDays: opts.expiresInDays }),
    });
  },

  async deleteApiKey(id: string) {
    return req<void>(`/api-keys/${id}`, { method: 'DELETE' });
  },

  // Observability
  async getObservabilitySummary(options: { workflowId?: string | null; days?: number } = {}) {
    const params = new URLSearchParams({ days: String(options.days ?? 7) });
    if (options.workflowId) params.set('workflowId', options.workflowId);
    return req<ObservabilitySummary>(`/observability/summary?${params}`);
  },

  // Usage (token usage by workflow — Otto does not price model usage)
  async getUsageSummary(params: { from?: string; to?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const suffix = qs.toString() ? `?${qs}` : '';
    return req<UsageSummary>(`/usage/summary${suffix}`);
  },

  // Audit log (owner/admin only)
  async getAuditLog(params: { limit?: number; action?: string } = {}) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.action) qs.set('action', params.action);
    const suffix = qs.toString() ? `?${qs}` : '';
    return req<{ events: AuditEvent[] }>(`/audit${suffix}`);
  },

  async getAuditSummary() {
    return req<{ summary: Array<{ action: string; count: number }> }>(`/audit/summary`);
  },

  async pruneExecutions(payload: {
    workflowId?: string | null;
    olderThanDays: number;
    statuses?: Array<'success' | 'error' | 'cancelled'>;
    dryRun?: boolean;
  }) {
    return req<{ dryRun: boolean; deleted: number; matched: number; olderThanDays: number; statuses: string[] }>(
      '/observability/prune',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async getObservabilityRetention() {
    return req<{ retentionDays: number }>('/observability/retention');
  },

  async getTriggerSample(workflowId: string, nodeId: string) {
    return req<{ sample: TriggerSample | null }>(`/triggers/samples/${workflowId}/${nodeId}`);
  },

  // Import
  async importN8n(json: unknown, save = true) {
    return req<{
      id?: string;
      definition: WorkflowDefinition;
      warnings: string[];
      report: ImportCompatibilityReport;
    }>('/import/n8n', {
      method: 'POST',
      body: JSON.stringify({ n8nJson: json, save }),
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

  // Memory
  async listMemoryPatterns(category?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (category) params.set('category', category);
    const res = await req<{ patterns: MemoryPattern[] }>(`/memory/patterns?${params}`);
    return res.patterns;
  },

  async listMemoryInteractions(sessionId?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (sessionId) params.set('sessionId', sessionId);
    const res = await req<{ interactions: MemoryInteraction[] }>(`/memory/interactions?${params}`);
    return res.interactions;
  },

  async listMemorySummaries() {
    const res = await req<{ summaries: MemorySummary[] }>('/memory/summaries');
    return res.summaries;
  },

  async deleteMemoryPattern(id: string) {
    return req<void>(`/memory/patterns/${id}`, { method: 'DELETE' });
  },

  async deleteMemoryInteraction(id: string) {
    return req<void>(`/memory/interactions/${id}`, { method: 'DELETE' });
  },

  getMemoryStats: () => req<any>('/memory/stats'),
  getMemoryInteractions: (limit?: number) => req<any[]>(`/memory/interactions?limit=${limit ?? 10}`),
  searchMemory: (query: string, limit?: number) => req<any[]>('/memory/search', { method: 'POST', body: JSON.stringify({ query, limit: limit ?? 5 }) }),
  clearMemory: () => req<void>('/memory', { method: 'DELETE' }),

  // Variables
  async listVariables() {
    const res = await req<{ variables: Variable[] }>('/variables');
    return res.variables;
  },

  async createVariable(name: string, value: string, type: string, description?: string) {
    return req<Variable>('/variables', {
      method: 'POST',
      body: JSON.stringify({ name, value, type, description }),
    });
  },

  async updateVariable(id: string, patch: Record<string, string>) {
    return req<Variable>(`/variables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
  },

  async deleteVariable(id: string) {
    return req<{ ok: true }>(`/variables/${id}`, { method: 'DELETE' });
  },

  // Evaluations
  listEvalDatasets: () => req<any[]>('/eval/datasets'),
  createEvalDataset: (data: { name: string; description?: string }) => req<any>('/eval/datasets', { method: 'POST', body: JSON.stringify(data) }),
  deleteEvalDataset: (datasetId: number) => req<void>(`/eval/datasets/${datasetId}`, { method: 'DELETE' }),
  listEvalCases: (datasetId: number) => req<any[]>(`/eval/datasets/${datasetId}/cases`),
  addEvalCase: (datasetId: number, data: any) => req<any>(`/eval/datasets/${datasetId}/cases`, { method: 'POST', body: JSON.stringify(data) }),
  startEvalRun: (workflowId: number, datasetId: number) => req<any>('/eval/runs', { method: 'POST', body: JSON.stringify({ workflowId, datasetId }) }),
  getEvalRun: (runId: number) => req<any>(`/eval/runs/${runId}`),

  // External Secrets
  listSecretProviders: () => req<{ providers: any[] }>('/external-secrets/providers'),
  createSecretProvider: (data: { name: string; provider_type: string; config?: Record<string, unknown> }) =>
    req<{ provider: any }>('/external-secrets/providers', { method: 'POST', body: JSON.stringify(data) }),
  updateSecretProvider: (id: number, data: { name?: string; config?: Record<string, unknown>; is_active?: boolean }) =>
    req<{ provider: any }>(`/external-secrets/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSecretProvider: (id: number) =>
    req<void>(`/external-secrets/providers/${id}`, { method: 'DELETE' }),
  testSecretProvider: (id: number, secretName: string) =>
    req<{ ok: boolean; error?: string }>(`/external-secrets/providers/${id}/test`, { method: 'POST', body: JSON.stringify({ secretName }) }),
};
