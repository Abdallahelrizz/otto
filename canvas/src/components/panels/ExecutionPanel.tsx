import { useStore } from '../../store';

function hexA(hex: string, a: number): string {
  if (hex.startsWith('rgba(')) return hex.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function SyntaxJson({ text, isDark }: { text: string; isDark: boolean }) {
  const keyC  = isDark ? '#FFB870' : '#B85A12';
  const strC  = isDark ? '#86EFAC' : '#15803D';
  const numC  = isDark ? '#7DD3FC' : '#0369A1';
  const boolC = isDark ? '#FBBF24' : '#A16207';

  const parts = text.split(/("[^"]*"\s*:|"[^"]*"|true|false|null|-?\d+\.?\d*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!p) return null;
        if (/^"[^"]*"\s*:$/.test(p)) return <span key={i} style={{ color: keyC }}>{p}</span>;
        if (/^"[^"]*"$/.test(p)) return <span key={i} style={{ color: strC }}>{p}</span>;
        if (p === 'true' || p === 'false') return <span key={i} style={{ color: boolC }}>{p}</span>;
        if (p === 'null') return <span key={i} style={{ color: 'var(--text-muted)' }}>{p}</span>;
        if (/^-?\d+\.?\d*$/.test(p)) return <span key={i} style={{ color: numC }}>{p}</span>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

export function ExecutionPanel() {
  const nodeExecutions = useStore((s) => s.nodeExecutions);
  const selectedExecutionDetail = useStore((s) => s.selectedExecutionDetail);
  const executionDetailLoading = useStore((s) => s.executionDetailLoading);
  const executionId = useStore((s) => s.executionId);
  const executionPhase = useStore((s) => s.executionPhase);
  const theme = useStore((s) => s.theme);
  const isDark = theme === 'dark';

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
  const inspectedNode = [...rows].reverse().find((ne) => ne.output != null || ne.error) ?? rows[0] ?? null;
  const outputText = inspectedNode
    ? JSON.stringify({
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
      }, null, 2)
    : JSON.stringify({
        executionId,
        status: executionDetailLoading ? 'loading' : execLabel.toLowerCase(),
      }, null, 2);

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
            const active = step.status === 'running';
            return (
              <div key={`${step.node_id}-${i}`} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '9px',
                padding: '6px 8px',
                background: active ? liveSoft : 'transparent',
                border: active ? `1px solid ${hexA(live, 0.22)}` : '1px solid transparent',
                borderRadius: '4px',
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
              </div>
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
            fontFamily: "'JetBrains Mono'",
            fontSize: '9.5px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: '0.10em',
            marginBottom: '8px',
            textTransform: 'uppercase',
          }}>
            {inspectedNode ? `${inspectedNode.node_name || inspectedNode.node_id} output` : 'Output'}
          </div>
          <pre style={{
            margin: 0,
            fontFamily: "'JetBrains Mono'",
            fontSize: '11.5px',
            fontWeight: 400,
            color: 'var(--text-primary)',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            <SyntaxJson text={outputText} isDark={isDark} />
          </pre>
        </div>
      </div>
    </div>
  );
}
