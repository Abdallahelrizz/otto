import { memo, useCallback, Fragment } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useStore } from '../../store';
import { getNodeDef, nodeColor, nodeRadius, OTTO_AMBER } from './nodeConfig';
import { NodeIcon } from '../NodeIcon';
import type { OttoNodeData } from '../../types';

function hexA(hex: string, a: number): string {
  if (hex.startsWith('rgba(')) return hex.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const NODE_W = 340;
const UI_FONT = 'Geist, system-ui, sans-serif';

// Named geometry constants used in handle positioning below
const HEADER_PAD_TOP    = 14;   // padding-top of header div
const HEADER_ICON_H     = 36;   // icon container height (updated from 34)
const HEADER_PAD_BOTTOM = 12;   // padding-bottom of header div
const DIVIDER_H         = 1;    // 1px divider
const TOOLS_PAD_TOP     = 11;   // padding-top of tools section
const TOOLS_LABEL_H     = 9.5;  // approximate rendered height of TOOLS label row
const TOOLS_LABEL_MB    = 3;    // marginBottom of TOOLS label
// Sum = position of first tool row's top edge
const HEADER_H = HEADER_PAD_TOP + HEADER_ICON_H + HEADER_PAD_BOTTOM + DIVIDER_H + TOOLS_PAD_TOP + TOOLS_LABEL_H + TOOLS_LABEL_MB;

const TOOL_ROW_H  = 36; // tool row height: icon 22 + padding 7+7
const TOOL_ROW_GAP = 5; // gap between tool rows

interface AgentTool {
  id: string;
  name: string;
  type: string;
}

function toolRadius(type: string): string {
  if (type === 'memory_read' || type === 'memory_write') return '50%';
  if (type === 'postgres_query' || type === 'redis_get' || type === 'redis_set') return '2px';
  return '4px';
}

function toolColor(type: string, isDark: boolean): string {
  if (type === 'postgres_query') return '#336791';
  if (type === 'redis_get' || type === 'redis_set') return '#DC382D';
  if (type === 'memory_read' || type === 'memory_write') return OTTO_AMBER;
  return isDark ? 'rgba(170,165,160,0.72)' : '#525050';
}

export const AgentNode = memo(({ id, data, selected }: NodeProps<OttoNodeData>) => {
  const execution  = useStore((s) => s.nodeExecutions[id]);
  const isPinned   = useStore((s) => Object.prototype.hasOwnProperty.call(s.pinnedData, id));
  const validationIssue = useStore((s) => s.validationIssues.find((issue) => issue.nodeId === id));
  const setContextMenu  = useStore((s) => s.setContextMenu);
  const theme = useStore((s) => s.theme);
  const def   = getNodeDef(data.nodeType);
  const isDark = theme === 'dark';

  const status = execution?.status ?? 'idle';
  const isRunning = status === 'running';
  const isSuccess = status === 'success';
  const isError   = status === 'error';
  const isValidationError   = validationIssue?.severity === 'error';
  const isValidationWarning = validationIssue?.severity === 'warning';
  const isDisabled = Boolean(data.disabled);
  const noteText  = String(data.notes ?? '').trim();
  const showNote  = Boolean(data.displayNote && noteText);

  const tools: AgentTool[] = Array.isArray(data.config?.tools)
    ? (data.config.tools as AgentTool[])
    : [];

  // Status strip — same approach as OttoNode
  const hasStatus = isRunning || isSuccess || isError || isValidationError || isValidationWarning;
  const stripColor =
    isRunning ? 'var(--node-running)' :
    isSuccess ? 'var(--node-success)' :
    isError || isValidationError ? 'var(--node-error)' :
    isValidationWarning ? 'var(--node-running)' :
    'transparent';

  // Border: only shows on selected / status — CSS handles hover via .otto-node-card:hover
  const borderColor =
    isRunning ? 'var(--node-running)' :
    isSuccess ? 'var(--node-success)' :
    isError || isValidationError ? hexA('#ef4444', 0.35) :
    isValidationWarning ? hexA('#f59e0b', 0.35) :
    isDisabled ? 'var(--border)' :
    selected  ? hexA(OTTO_AMBER, 0.55) :
    'var(--border-node)';

  const boxShadow = selected
    ? `0 0 0 2px ${hexA(OTTO_AMBER, 0.20)}, var(--shadow-main)`
    : 'var(--shadow-main)';

  const executionClass = isRunning ? ' otto-node-running' : isSuccess ? ' otto-node-success' : isError ? ' otto-node-error' : '';

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
    },
    [id, setContextMenu]
  );

  const dotStyle: React.CSSProperties = {
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: 'var(--text-muted)',
    boxShadow: '0 0 0 2px var(--bg-canvas)',
    border: 'none',
    zIndex: 2,
    cursor: 'crosshair',
    transition: 'transform 0.15s ease',
  };

  const subtitleText = def.subtitle ? def.subtitle(data.config ?? {}) : '';

  return (
    <div
      style={{ position: 'relative', width: NODE_W, overflow: 'visible', cursor: 'default', userSelect: 'none' }}
      onContextMenu={onContextMenu}
    >
      <div
        className={`otto-node-card${executionClass}`}
        style={{
          background: 'var(--bg-node-card)',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '12px',
          boxShadow,
          opacity: isDisabled ? 0.55 : 1,
          filter: isDisabled ? 'grayscale(0.3)' : 'none',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Status strip — left edge (pulses when running) */}
        {hasStatus && (
          <div
            className={isRunning ? 'otto-status-strip-running' : undefined}
            style={{
              position: 'absolute',
              left: 0,
              top: 8,
              bottom: 8,
              width: 3,
              borderRadius: '0 2px 2px 0',
              background: stripColor,
              zIndex: 1,
            }}
          />
        )}

        {/* Disabled badge */}
        {isDisabled && (
          <span title="Node disabled" style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 2,
            fontFamily: UI_FONT,
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            background: 'rgba(120,115,110,0.10)',
            border: '1px solid rgba(120,115,110,0.20)',
            borderRadius: '4px',
            padding: '1px 5px',
          }}>
            Off
          </span>
        )}

        {/* Pinned badge */}
        {isPinned && (
          <span title="Pinned data" style={{
            position: 'absolute',
            right: 8,
            bottom: 8,
            zIndex: 2,
            fontFamily: UI_FONT,
            fontSize: '10px',
            fontWeight: 600,
            color: OTTO_AMBER,
            background: hexA(OTTO_AMBER, 0.10),
            border: `1px solid ${hexA(OTTO_AMBER, 0.20)}`,
            borderRadius: '4px',
            padding: '1px 5px',
          }}>
            Pinned
          </span>
        )}

        {/* Validation badge */}
        {validationIssue && (
          <span title={validationIssue.message} style={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            zIndex: 2,
            fontFamily: UI_FONT,
            fontSize: '10px',
            fontWeight: 600,
            color: isValidationError ? 'var(--node-error)' : 'var(--node-running)',
            background: isValidationError ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
            border: `1px solid ${isValidationError ? 'rgba(239,68,68,0.20)' : 'rgba(245,158,11,0.20)'}`,
            borderRadius: '4px',
            padding: '1px 5px',
          }}>
            {isValidationError ? 'Error' : 'Warning'}
          </span>
        )}

        {/* Header */}
        <div style={{
          padding: `${HEADER_PAD_TOP}px 14px ${HEADER_PAD_BOTTOM}px`,
          display: 'flex',
          alignItems: 'flex-start',
          gap: '11px',
        }}>
          <span style={{
            width: HEADER_ICON_H,
            height: HEADER_ICON_H,
            borderRadius: nodeRadius(def),
            background: hexA(OTTO_AMBER, isDark ? 0.14 : 0.10),
            border: `1px solid ${hexA(OTTO_AMBER, isDark ? 0.30 : 0.22)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <NodeIcon type={data.nodeType} size={18} color={OTTO_AMBER} />
          </span>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontFamily: UI_FONT,
                fontSize: '14px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '-0.018em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
                minWidth: 0,
              }}>
                {data.label}
              </span>
              {/* MAIN tag — amber, sentence-case */}
              <span style={{
                fontFamily: UI_FONT,
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.01em',
                color: OTTO_AMBER,
                background: hexA(OTTO_AMBER, isDark ? 0.12 : 0.10),
                border: `1px solid ${hexA(OTTO_AMBER, isDark ? 0.22 : 0.18)}`,
                padding: '1px 6px',
                borderRadius: '4px',
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                Main
              </span>
            </div>
            {subtitleText && (
              <span style={{
                fontFamily: UI_FONT,
                fontSize: '11px',
                fontWeight: 400,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {subtitleText}
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: `${DIVIDER_H}px`, background: 'var(--border)' }} />

        {/* Tools section */}
        <div style={{ padding: `${TOOLS_PAD_TOP}px 12px 12px`, display: 'flex', flexDirection: 'column', gap: `${TOOL_ROW_GAP}px` }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 2px',
            marginBottom: `${TOOLS_LABEL_MB}px`,
          }}>
            <span style={{
              fontFamily: UI_FONT,
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}>
              Tools
            </span>
            <span style={{
              fontFamily: 'Geist Mono, monospace',
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {String(tools.length).padStart(2, '0')}
            </span>
          </div>

          {tools.map((tool) => {
            const tc = toolColor(tool.type, isDark);
            const tr = toolRadius(tool.type);
            return (
              <div key={tool.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 9px',
                background: 'var(--bg-node-lift)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                height: `${TOOL_ROW_H}px`,
                boxSizing: 'border-box',
              }}>
                <span style={{
                  width: 22,
                  height: 22,
                  borderRadius: tr,
                  background: hexA(tc, isDark ? 0.14 : 0.10),
                  border: `1px solid ${hexA(tc, isDark ? 0.26 : 0.18)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <NodeIcon type={tool.type} size={12} color={tc} />
                </span>
                <span style={{
                  flex: 1,
                  fontFamily: UI_FONT,
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.008em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {tool.name}
                </span>
                <span style={{
                  fontFamily: 'Geist Mono, monospace',
                  fontSize: '10px',
                  fontWeight: 400,
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                }}>
                  {tool.type}
                </span>
              </div>
            );
          })}

          {tools.length === 0 && (
            <div style={{
              padding: '12px 10px',
              textAlign: 'center',
              fontFamily: UI_FONT,
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}>
              No tools configured
            </div>
          )}
        </div>
      </div>

      {/* Note annotation */}
      {showNote && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 7px)',
          left: 0,
          width: NODE_W,
          minHeight: 36,
          maxHeight: 48,
          boxSizing: 'border-box',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          background: 'var(--bg-node-lift)',
          color: 'var(--text-secondary)',
          fontFamily: UI_FONT,
          fontSize: '11px',
          lineHeight: 1.4,
          padding: '5px 8px',
          boxShadow: 'var(--shadow-main)',
          wordBreak: 'break-word',
        }}>
          {noteText}
        </div>
      )}

      {/* Input handle — left center */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ ...dotStyle, position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* Output handles — right side aligned with each tool row */}
      {tools.map((_, i) => {
        // y = top of tools section + tool rows above + center of current row
        const y = HEADER_H + i * (TOOL_ROW_H + TOOL_ROW_GAP) + TOOL_ROW_H / 2;
        return (
          <Fragment key={`out-${i}`}>
            <Handle
              type="source"
              position={Position.Right}
              id={`output-${i}`}
              style={{ ...dotStyle, position: 'absolute', right: -4, top: y, transform: 'translateY(-50%)' }}
            />
          </Fragment>
        );
      })}

      {/* Fallback single output if no tools */}
      {tools.length === 0 && (
        <Handle
          type="source"
          position={Position.Right}
          id="output"
          style={{ ...dotStyle, position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)' }}
        />
      )}
    </div>
  );
});
