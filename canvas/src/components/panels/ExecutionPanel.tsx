import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { DataInspector } from '../DataInspector';

const EXEC_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual',
  api: 'API',
  scheduled: 'Scheduled',
  sub_workflow: 'Sub-workflow',
  error_workflow: 'Error handler',
  resume: 'Resumed',
  production: 'Production',
};

function hexA(hex: string, a: number): string {
  if (hex.startsWith('rgba(')) return hex.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

type InspectTab = 'output' | 'input' | 'error' | 'full';

const INSPECT_TABS: Array<{ id: InspectTab; label: string }> = [
  { id: 'output', label: 'Output' },
  { id: 'input', label: 'Input' },
  { id: 'error', label: 'Error' },
  { id: 'full', label: 'Full' },
];

export function ExecutionPanel() {
  const nodeExecutions = useStore((s) => s.nodeExecutions);
  const selectedExecutionDetail = useStore((s) => s.selectedExecutionDetail);
  const executionDetailLoading = useStore((s) => s.executionDetailLoading);
  const executionId = useStore((s) => s.executionId);
  const executionPhase = useStore((s) => s.executionPhase);
  const theme = useStore((s) => s.theme);
  const isDark = theme === 'dark';
  const [inspectedNodeId, setInspectedNodeId] = useState<string | null>(null);
  const [inspectTab, setInspectTab] = useState<InspectTab>('output');

  const live = isDark ? '#22C55E' : '#16A34A';
  const liveSoft = isDark ? 'rgba(34,197,94,0.15)' : 'rgba(22,163,74,0.10)';
  const isRunning = executionPhase === 'running';
  const isSuccess = executionPhase === 'success';
  const isError = executionPhase === 'error';
  const execLabel = isRunning ? 'RUNNING' : isSuccess ? 'DONE' : isError ? 'FAILED' : 'IDLE';
  const execColor = (isRunning || isSuccess) ? live : isError ? 'var(--node-error)' : 'var(--text-muted)';
  const execSoft = (isRunning || isSuccess) ? liveSoft : isError ? 'rgba(239,68,68,0.12)' : 'var(--bg-hover)';

  const rows = selectedExecutionDetail?.nodes?.length
    ? selectedExecutionDetail.nodes
    : Object.values(nodeExecutions);
  useEffect(() => {
    if (inspectedNodeId && !rows.some((ne) => ne.node_id === inspectedNodeId)) {
      setInspectedNodeId(null);
    }
  }, [inspectedNodeId, rows]);

  const inspectedNode = (inspectedNodeId ? rows.find((ne) => ne.node_id === inspectedNodeId) : null)
    ?? [...rows].reverse().find((ne) => ne.output != null || ne.error)
    ?? rows[0]
    ?? null;
  useEffect(() => {
    setInspectTab('output');
  }, [inspectedNode?.node_id]);

  const fullData = inspectedNode
    ? {
      execution: selectedExecutionDetail?.execution ?? { id: executionId, phase: executionPhase },
      node: {
        id: inspectedNode.node_id,
        name: inspectedNode.node_name,
        type: inspectedNode.node_type,
        status: inspectedNode.status,
        duration_ms: inspectedNode.duration_ms,
        model: inspectedNode.model,
        total_tokens: inspectedNode.total_tokens,
      },
      input: inspectedNode.input,
      output: inspectedNode.output,
      error: inspectedNode.error,
    }
    : {
      executionId,
      status: executionDetailLoading ? 'loading' : execLabel.toLowerCase(),
    };

  const inspectedData = inspectedNode
    ? inspectTab === 'input'
      ? inspectedNode.input
      : inspectTab === 'error'
        ? { error: inspectedNode.error }
        : inspectTab === 'full'
          ? fullData
          : inspectedNode.output
    : fullData;

  const statusColor = (status: string) => {
    if (status === 'success') return 'var(--node-success)';
    if (status === 'running') return live;
    if (status === 'error') return 'var(--node-error)';
    return 'var(--text-muted)';
  };

  return (
    <div style={{
      flex: 1,
      background: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
    }}>
      <div style={{
        height: 36,
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={live} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
        <span style={{
          fontSize: '12.5px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.008em',
          fontFamily: "'Inter'",
        }}>
          {selectedExecutionDetail ? 'Execution detail' : 'Live execution'}
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono'",
          fontSize: '9.5px',
          color: execColor,
          letterSpacing: '0.06em',
          fontWeight: 700,
          padding: '2px 7px',
          background: execSoft,
          border: `1px solid ${hexA(execColor === 'var(--node-error)' ? '#EF4444' : live, isDark ? 0.30 : 0.22)}`,
          borderRadius: '3px',
          textTransform: 'uppercase',
        }}>
          {execLabel}
        </span>
        {(() => {
          const execType = selectedExecutionDetail?.execution?.executionType;
          if (!execType) return null;
          const label = EXEC_TYPE_LABELS[execType] ?? execType;
          return (
            <span style={{
              fontFamily: "'JetBrains Mono'",
              fontSize: '9.5px',
              color: 'var(--node-running)',
              letterSpacing: '0.04em',
              fontWeight: 600,
              padding: '2px 7px',
              background: 'rgba(245,158,11,0.10)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: '3px',
            }}>
              {label}
            </span>
          );
        })()}
        <div style={{ flex: 1 }} />
        {executionId && (
          <span style={{
            fontFamily: "'JetBrains Mono'",
            fontSize: '9.5px',
            color: 'var(--text-muted)',
            letterSpacing: '0.04em',
            fontWeight: 500,
          }}>
            {executionId.slice(0, 8)}
          </span>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{
          width: 188,
          borderRight: '1px solid var(--border)',
          padding: '11px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          overflow: 'auto',
          flexShrink: 0,
        }}>
          {(rows.length ? rows : [{ node_id: 'waiting', node_name: executionDetailLoading ? 'Loading run...' : 'Waiting for run...', status: 'pending', duration_ms: null }]).map((step, i) => {
            const c = statusColor(step.status);
            const selected = inspectedNode?.node_id === step.node_id;
            const active = step.status === 'running';
            return (
              <button type="button" key={`${step.node_id}-${i}`} onClick={() => setInspectedNodeId(step.node_id)} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                padding: '6px 8px',
                background: selected || active ? liveSoft : 'transparent',
                border: selected || active ? `1px solid ${hexA(live, 0.22)}` : '1px solid transparent',
                borderRadius: '4px',
                cursor: step.node_id === 'waiting' ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: "'Inter'",
              }}>
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: c,
                  animation: active ? 'otto-pulse 1.4s ease-in-out infinite' : 'none',
                  flexShrink: 0,
                }} />
                <span style={{
                  flex: 1,
                  fontSize: '11.5px',
                  fontWeight: 500,
                  color: step.status === 'pending' ? 'var(--text-muted)' : 'var(--text-primary)',
                  letterSpacing: '-0.005em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: "'Inter'",
                }}>
                  {step.node_name || step.node_id}
                </span>
                {step.duration_ms != null && (
                  <span style={{
                    fontFamily: "'JetBrains Mono'",
                    fontSize: '9.5px',
                    fontWeight: 500,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.02em',
                    flexShrink: 0,
                  }}>
                    {step.duration_ms > 999 ? `${(step.duration_ms / 1000).toFixed(1)}s` : `${step.duration_ms}ms`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div style={{
          flex: 1,
          padding: '12px 14px',
          background: isDark ? 'var(--bg-canvas)' : 'var(--bg-sidebar)',
          overflow: 'auto',
          minWidth: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '10px',
          }}>
            <div style={{
              flex: 1,
              fontFamily: "'JetBrains Mono'",
              fontSize: '9.5px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              letterSpacing: '0.10em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}>
              {inspectedNode ? inspectedNode.node_name || inspectedNode.node_id : 'Output'}
            </div>
            <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
              {INSPECT_TABS.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setInspectTab(tab.id)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    background: inspectTab === tab.id ? 'var(--bg-hover)' : 'transparent',
                    color: inspectTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontFamily: 'Geist Mono',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    padding: '4px 7px',
                    textTransform: 'uppercase',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <DataInspector
            label={inspectTab}
            data={inspectedData}
            defaultOpen
            defaultTab="json"
            maxHeight={360}
          />
        </div>
      </div>
    </div>
  );
}
