import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import type { NodeExecution } from '../types';

interface NodeDataResult {
  inputData: unknown;
  outputData: unknown;
  execMeta: {
    status: string;
    duration_ms: number | null;
    total_tokens: number | null;
    model: string | null;
    error: string | null;
  } | null;
  upstreamNodes: Array<{
    nodeId: string;
    nodeName: string;
    nodeType: string;
    hasData: boolean;
  }>;
  loading: boolean;
  hasEverRun: boolean;
}

/** Fetches and returns the most recent execution data for a given node. */
export function useNodeData(nodeId: string | null): NodeDataResult {
  const nodeExecutions = useStore((s) => s.nodeExecutions);
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);

  const [historical, setHistorical] = useState<Record<string, NodeExecution>>({});
  const [loading, setLoading] = useState(false);
  const fetchedFor = useRef<string | null>(null);

  // Live data from the current session
  const liveExec = nodeId ? nodeExecutions[nodeId] ?? null : null;

  // Fetch historical if no live data
  useEffect(() => {
    if (!nodeId || liveExec || !savedWorkflowId) return;
    if (fetchedFor.current === savedWorkflowId) return;

    fetchedFor.current = savedWorkflowId;
    setLoading(true);

    api.listExecutions(savedWorkflowId, 1, 1)
      .then(({ executions }) => {
        if (!executions.length) return null;
        return api.getExecution(executions[0].id);
      })
      .then((detail) => {
        if (!detail) return;
        const byNodeId: Record<string, NodeExecution> = {};
        for (const ne of detail.nodes) {
          byNodeId[ne.node_id] = ne;
        }
        setHistorical(byNodeId);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nodeId, savedWorkflowId, liveExec]);

  const exec = liveExec ?? (nodeId ? historical[nodeId] ?? null : null);

  // Upstream nodes (sources feeding into this node)
  const upstreamNodeIds = nodeId
    ? edges.filter((e) => e.target === nodeId).map((e) => e.source)
    : [];

  const upstreamNodes = upstreamNodeIds.map((id) => {
    const node = nodes.find((n) => n.id === id);
    const upExec = nodeExecutions[id] ?? historical[id] ?? null;
    return {
      nodeId: id,
      nodeName: (node?.data?.label as string) ?? id,
      nodeType: (node?.data?.nodeType as string) ?? '',
      hasData: upExec?.output != null,
    };
  });

  return {
    inputData: exec?.input ?? null,
    outputData: exec?.output ?? null,
    execMeta: exec
      ? {
        status: exec.status,
        duration_ms: exec.duration_ms,
        total_tokens: exec.total_tokens ?? null,
        model: exec.model ?? null,
        error: exec.error,
      }
      : null,
    upstreamNodes,
    loading,
    hasEverRun: exec !== null,
  };
}
