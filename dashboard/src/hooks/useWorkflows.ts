import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Workflow, Execution, Credential, ObservabilitySummary } from '../types';

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.workflows
      .list()
      .then((res) => setWorkflows(res.workflows))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { workflows, loading, error, refetch: () => setLoading(true) };
}

export function useExecutions(workflowId?: string, page = 1) {
  const [data, setData] = useState<{ executions: Execution[]; total: number }>({
    executions: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.executions
      .list(workflowId, page)
      .then((res) => setData(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [workflowId, page]);

  return { ...data, loading, error };
}

export function useCredentials() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.credentials
      .list()
      .then((res) => setCredentials(res.credentials))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { credentials, loading, error, refetch: () => setLoading(true) };
}

export function useObservability(days = 7) {
  const [summary, setSummary] = useState<ObservabilitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.observability
      .summary(days)
      .then((res) => setSummary(res))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [days]);

  return { summary, loading, error };
}
