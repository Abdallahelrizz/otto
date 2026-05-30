import { useEffect, useRef, useCallback, memo } from 'react';
import type { Node } from 'reactflow';
import { useStore } from '../../store';
import { NodeIcon } from '../NodeIcon';
import { DataInspector } from '../DataInspector';
import { NodePanel, FieldGroup, PanelProps } from '../ConfigPanel';
import { useNodeData } from '../../hooks/useNodeData';
import { getNodeDef, nodeColor, OTTO_AMBER } from '../nodes/nodeConfig';
import type { OttoNodeData } from '../../types';

const UI_FONT = 'Geist, system-ui, sans-serif';
const MONO_FONT = 'Geist Mono, monospace';

function hexA(hex: string, a: number): string {
  if (hex.startsWith('rgba(')) return hex.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);
  if (hex.startsWith('rgb('))  return hex.replace(/rgb\(([^)]+)\)/, `rgba($1, ${a})`);
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(n: number | null): string {
  if (n == null || n === 0) return '';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k tokens`;
  return `${n} tokens`;
}

// ── Skeleton lines ──────────────────────────────────────────────────────────
function Skeleton({ lines = 5 }: { lines?: number }) {
  return (
    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="otto-skeleton" style={{
          height: '13px',
          width: `${70 + (i % 3) * 15}%`,
          maxWidth: '100%',
        }} />
      ))}
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '32px 20px',
      gap: '8px',
      textAlign: 'center',
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: '10px',
        background: 'var(--bg-hover)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '4px',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div style={{ fontFamily: UI_FONT, fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '-0.01em' }}>
        {label}
      </div>
      <div style={{ fontFamily: UI_FONT, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '200px' }}>
        {hint}
      </div>
    </div>
  );
}

// ── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const color =
    status === 'success' ? 'var(--node-success)' :
    status === 'error'   ? 'var(--node-error)' :
    status === 'running' ? 'var(--node-running)' :
    status === 'skipped' ? 'var(--text-muted)' :
    'var(--text-muted)';

  const bg =
    status === 'success' ? 'color-mix(in srgb, var(--node-success) 12%, transparent)' :
    status === 'error'   ? 'color-mix(in srgb, var(--node-error) 12%, transparent)' :
    status === 'running' ? 'color-mix(in srgb, var(--node-running) 12%, transparent)' :
    'var(--bg-hover)';

  return (
    <span style={{
      fontFamily: UI_FONT,
      fontSize: '11px',
      fontWeight: 600,
      color,
      background: bg,
      border: `1px solid ${hexA(color === 'var(--text-muted)' ? '#888' : color, 0.28)}`,
      borderRadius: '5px',
      padding: '2px 8px',
      letterSpacing: '0.01em',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
    }}>
      {status === 'running' && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          animation: 'otto-pulse 1.4s ease-in-out infinite',
          flexShrink: 0,
        }} />
      )}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Pane header ──────────────────────────────────────────────────────────────
function PaneHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div style={{
      height: '38px',
      padding: '0 14px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      borderBottom: '1px solid var(--border)',
      flexShrink: 0,
    }}>
      <span style={{
        fontFamily: UI_FONT,
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>
        {title}
      </span>
      {badge && (
        <span style={{
          fontFamily: MONO_FONT,
          fontSize: '10px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '1px 5px',
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

// ── Data pane (Input or Output) ──────────────────────────────────────────────
function DataPane({
  title,
  data,
  loading,
  hasEverRun,
  emptyLabel,
  emptyHint,
  makeExpr,
  footer,
}: {
  title: string;
  data: unknown;
  loading: boolean;
  hasEverRun: boolean;
  emptyLabel: string;
  emptyHint: string;
  makeExpr?: (path: string) => string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="otto-ndv-pane" style={{
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
      background: 'var(--ndv-pane)',
    }}>
      <PaneHeader title={title} />

      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {loading ? (
          <Skeleton />
        ) : !hasEverRun ? (
          <EmptyState label={emptyLabel} hint={emptyHint} />
        ) : data == null ? (
          <EmptyState label="No data" hint="This node produced no output for this run." />
        ) : (
          <div style={{ padding: '12px' }}>
            <DataInspector
              label={title.toLowerCase()}
              data={data}
              defaultOpen
              defaultTab="schema"
              maxHeight={9999}
              makeExpr={makeExpr}
            />
          </div>
        )}
      </div>

      {footer && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '7px 14px',
          flexShrink: 0,
          background: 'var(--ndv-header-bg)',
        }}>
          {footer}
        </div>
      )}
    </div>
  );
}

// ── Execution metadata footer ────────────────────────────────────────────────
function ExecMeta({ execMeta }: {
  execMeta: { status: string; duration_ms: number | null; total_tokens: number | null; model: string | null; error: string | null } | null;
}) {
  if (!execMeta) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      {execMeta.duration_ms != null && (
        <span style={{ fontFamily: MONO_FONT, fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          ⏱ {formatDuration(execMeta.duration_ms)}
        </span>
      )}
      {execMeta.total_tokens != null && execMeta.total_tokens > 0 && (
        <span style={{ fontFamily: MONO_FONT, fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
          ◈ {formatTokens(execMeta.total_tokens)}
        </span>
      )}
      {execMeta.model && (
        <span style={{ fontFamily: MONO_FONT, fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
          {execMeta.model}
        </span>
      )}
      {execMeta.error && (
        <span style={{ fontFamily: UI_FONT, fontSize: '11px', color: 'var(--node-error)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
          {execMeta.error}
        </span>
      )}
    </div>
  );
}

// ── Parameters pane ──────────────────────────────────────────────────────────
function ParametersPane({ node }: { node: Node<OttoNodeData> }) {
  const updateNodeConfig = useStore((s) => s.updateNodeConfig);
  const updateNodeLabel = useStore((s) => s.updateNodeLabel);
  const validationIssues = useStore((s) => s.validationIssues);
  const runExecution = useStore((s) => s.runExecution);
  const setBottomPanelsOpen = useStore((s) => s.setBottomPanelsOpen);
  const pinNodeOutput = useStore((s) => s.pinNodeOutput);
  const clearPinnedDataForNode = useStore((s) => s.clearPinnedDataForNode);
  const pinnedData = useStore((s) => s.pinnedData);

  const config = (node.data.config ?? {}) as Record<string, unknown>;
  const nodeIssues = validationIssues.filter((i) => i.nodeId === node.id);
  const isPinned = Object.prototype.hasOwnProperty.call(pinnedData, node.id);

  function setField(key: string, value: unknown) {
    updateNodeConfig(node.id, { ...config, [key]: value });
  }

  const runSelected = (mode: 'single_node' | 'to_node' | 'from_node') => {
    setBottomPanelsOpen(true);
    void runExecution(mode, node.id);
  };

  const btnStyle: React.CSSProperties = {
    fontFamily: UI_FONT,
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: '7px',
    padding: '6px 10px',
    cursor: 'pointer',
    transition: 'background 0.1s, border-color 0.1s',
    textAlign: 'left' as const,
    flex: 1,
  };

  return (
    <div className="otto-ndv-pane" style={{
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'var(--ndv-bg)',
    }}>
      <PaneHeader title="Parameters" />

      <div style={{ flex: 1, overflow: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Label */}
        <div>
          <label style={{ display: 'block', fontFamily: UI_FONT, fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '5px' }}>
            Label
          </label>
          <input
            style={{
              width: '100%',
              fontFamily: UI_FONT,
              fontSize: '13px',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-input)',
              borderRadius: '7px',
              padding: '7px 10px',
              color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }}
            value={(node.data.label as string) ?? ''}
            onChange={(e) => updateNodeLabel(node.id, e.target.value)}
          />
        </div>

        {/* Quick actions */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
          <button style={btnStyle} onClick={() => runSelected('single_node')}>▷ Run node</button>
          <button style={btnStyle} onClick={() => runSelected('to_node')}>↗ Run to here</button>
          <button style={btnStyle} onClick={() => runSelected('from_node')}>↘ Run from here</button>
          <button
            style={{ ...btnStyle, color: isPinned ? 'var(--node-running)' : 'var(--text-primary)', borderColor: isPinned ? hexA(OTTO_AMBER, 0.35) : 'var(--border)' }}
            onClick={isPinned ? () => clearPinnedDataForNode(node.id) : () => pinNodeOutput(node.id)}
          >
            {isPinned ? '◉ Clear pin' : '◎ Pin output'}
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border)', margin: '0 -14px' }} />

        {/* Node-specific fields */}
        <NodePanel
          nodeType={node.data.nodeType}
          config={config}
          onChange={setField}
          nodeId={node.id}
          issues={nodeIssues}
        />

        {/* Validation errors */}
        {nodeIssues.filter((i) => i.severity === 'error').length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {nodeIssues.filter((i) => i.severity === 'error').map((issue, i) => (
              <div key={i} style={{
                fontFamily: UI_FONT,
                fontSize: '12px',
                color: 'var(--node-error)',
                background: 'color-mix(in srgb, var(--node-error) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--node-error) 25%, transparent)',
                borderRadius: '6px',
                padding: '7px 10px',
              }}>
                {issue.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main NDV modal ────────────────────────────────────────────────────────────
function NodeDetailViewInner({ node }: { node: Node<OttoNodeData> }) {
  const theme = useStore((s) => s.theme);
  const setNdvNodeId = useStore((s) => s.setNdvNodeId);
  const runExecution = useStore((s) => s.runExecution);
  const setBottomPanelsOpen = useStore((s) => s.setBottomPanelsOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  const def = getNodeDef(node.data.nodeType);
  const cardColor = nodeColor(def, theme);
  const tagText = def.tag || def.slug || '';

  const { inputData, outputData, execMeta, upstreamNodes, loading, hasEverRun } = useNodeData(node.id);

  const close = useCallback(() => setNdvNodeId(null), [setNdvNodeId]);

  // Close on backdrop click
  const onBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) close();
  }, [close]);

  // Trap focus inside NDV
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Build the drag expression for the input pane schema rows
  const makeInputExpr = useCallback((path: string) => {
    const parts = path.split('.');
    if (parts.length === 1) return `{{ $json.${path} }}`;
    const head = parts[0];
    const rest = parts.slice(1).join('.');
    return `{{ $json.${head}.${rest} }}`;
  }, []);

  const statusLabel = execMeta?.status ?? '';

  return (
    <div
      className="otto-ndv-backdrop"
      onClick={onBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ndv-overlay)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        padding: '24px',
      }}
    >
      <div
        ref={panelRef}
        className="otto-ndv-modal"
        tabIndex={-1}
        style={{
          width: 'min(96vw, 1320px)',
          height: 'min(90vh, 900px)',
          background: 'var(--ndv-bg)',
          border: '1px solid var(--border-input)',
          borderRadius: '16px',
          boxShadow: '0 32px 96px rgba(0,0,0,0.42), 0 8px 32px rgba(0,0,0,0.24)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          outline: 'none',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          height: '56px',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--ndv-header-bg)',
          flexShrink: 0,
        }}>
          {/* Node identity */}
          <span style={{
            width: 32,
            height: 32,
            borderRadius: '9px',
            background: hexA(cardColor, 0.14),
            border: `1px solid ${hexA(cardColor, 0.22)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <NodeIcon type={node.data.nodeType} size={16} color={cardColor} />
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
            <span style={{ fontFamily: UI_FONT, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.015em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.data.label}
            </span>
            {tagText && (
              <span style={{ fontFamily: UI_FONT, fontSize: '10px', color: tagText === 'TRIGGER' ? OTTO_AMBER : 'var(--text-muted)' }}>
                {def.label}
              </span>
            )}
          </div>

          {/* Status */}
          {statusLabel && <StatusPill status={statusLabel} />}

          {/* Timing / tokens */}
          {execMeta && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {execMeta.duration_ms != null && (
                <span style={{ fontFamily: MONO_FONT, fontSize: '11.5px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatDuration(execMeta.duration_ms)}
                </span>
              )}
              {execMeta.total_tokens != null && execMeta.total_tokens > 0 && (
                <span style={{ fontFamily: MONO_FONT, fontSize: '11.5px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTokens(execMeta.total_tokens)}
                </span>
              )}
            </div>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Action buttons */}
          <button
            style={{
              fontFamily: UI_FONT,
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              borderRadius: '7px',
              padding: '6px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'background 0.1s, border-color 0.1s',
            }}
            onClick={() => {
              setBottomPanelsOpen(true);
              void runExecution('single_node', node.id);
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Run node
          </button>

          {/* Close */}
          <button
            onClick={close}
            title="Close (Esc)"
            style={{
              width: 28,
              height: 28,
              borderRadius: '7px',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              lineHeight: 1,
              flexShrink: 0,
              transition: 'background 0.1s, color 0.1s',
            }}
          >
            ×
          </button>
        </div>

        {/* ── 3-pane body ── */}
        <div style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '27fr 46fr 27fr',
          overflow: 'hidden',
          minHeight: 0,
        }}>
          {/* Input pane */}
          <DataPane
            title="Input"
            data={inputData}
            loading={loading}
            hasEverRun={hasEverRun}
            emptyLabel="No run data yet"
            emptyHint={upstreamNodes.length === 0 ? "This is the first node. Trigger inputs appear here after a run." : "Run the workflow to see what this node receives."}
            makeExpr={makeInputExpr}
            footer={
              upstreamNodes.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                  <span style={{ fontFamily: UI_FONT, fontSize: '11px', color: 'var(--text-muted)' }}>From:</span>
                  {upstreamNodes.map((n) => (
                    <span key={n.nodeId} style={{
                      fontFamily: UI_FONT,
                      fontSize: '11px',
                      fontWeight: 500,
                      color: n.hasData ? 'var(--text-secondary)' : 'var(--text-muted)',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '1px 6px',
                    }}>
                      {n.nodeName}
                    </span>
                  ))}
                </div>
              ) : null
            }
          />

          {/* Parameters pane */}
          <ParametersPane node={node} />

          {/* Output pane */}
          <DataPane
            title="Output"
            data={outputData}
            loading={loading}
            hasEverRun={hasEverRun}
            emptyLabel="No output yet"
            emptyHint="Run this node to see its output here."
            footer={execMeta ? <ExecMeta execMeta={execMeta} /> : null}
          />
        </div>

        {/* ── Drag hint bar ── */}
        <div style={{
          height: '28px',
          borderTop: '1px solid var(--border)',
          background: 'var(--ndv-header-bg)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          flexShrink: 0,
          gap: '6px',
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span style={{ fontFamily: UI_FONT, fontSize: '11px', color: 'var(--text-muted)' }}>
            Drag any field from the Input schema into a parameter field to map it as an expression.
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Public export: reads ndvNodeId from store ─────────────────────────────────
export const NodeDetailView = memo(function NodeDetailView() {
  const ndvNodeId = useStore((s) => s.ndvNodeId);
  const nodes = useStore((s) => s.nodes);

  if (!ndvNodeId) return null;
  const node = nodes.find((n) => n.id === ndvNodeId) as Node<OttoNodeData> | undefined;
  if (!node) return null;

  return <NodeDetailViewInner node={node} />;
});
