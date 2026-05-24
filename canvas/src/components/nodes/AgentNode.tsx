import { memo, useState, useCallback, Fragment } from 'react';
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
  const execution = useStore((s) => s.nodeExecutions[id]);
  const setContextMenu = useStore((s) => s.setContextMenu);
  const theme = useStore((s) => s.theme);
  const def = getNodeDef(data.nodeType);
  const [hovered, setHovered] = useState(false);
  const isDark = theme === 'dark';

  const status = execution?.status ?? 'idle';
  const isRunning = status === 'running';
  const isSuccess = status === 'success';
  const isError   = status === 'error';

  const tools: AgentTool[] = Array.isArray(data.config?.tools)
    ? (data.config.tools as AgentTool[])
    : [];

  const borderColor =
    isRunning ? 'var(--node-running)' :
    isSuccess ? 'var(--node-success)' :
    isError   ? 'var(--node-error)' :
    selected  ? OTTO_AMBER :
    hovered   ? 'var(--border-input)' :
                'var(--border-input)';

  const boxShadow = selected
    ? `0 0 0 3px ${hexA(OTTO_AMBER, 0.18)}, var(--shadow-main)`
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
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--text-muted)',
    boxShadow: '0 0 0 2px var(--bg-canvas)',
    border: 'none',
    zIndex: 2,
    cursor: 'crosshair',
  };

  const subtitleText = def.subtitle ? def.subtitle(data.config ?? {}) : '';

  return (
    <div
      style={{ position: 'relative', width: 336, overflow: 'visible', cursor: 'pointer', userSelect: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
    >
      <div
        className={`otto-node-card${executionClass}`}
        style={{
          background: 'var(--bg-node-card)',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '8px',
          boxShadow,
          overflow: 'hidden',
          transition: 'border-color 130ms ease-out, box-shadow 130ms ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 14px 12px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '11px',
        }}>
          <span style={{
            width: 34,
            height: 34,
            borderRadius: nodeRadius(def),
            background: hexA(OTTO_AMBER, isDark ? 0.14 : 0.10),
            border: `1px solid ${hexA(OTTO_AMBER, isDark ? 0.30 : 0.22)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <NodeIcon type={data.nodeType} size={17} color={OTTO_AMBER} />
          </span>

          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                fontSize: '14.5px',
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.018em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {data.label}
              </span>
              {/* MAIN tag — always amber */}
              <span style={{
                fontFamily: "'JetBrains Mono'",
                fontSize: '9.5px',
                fontWeight: 700,
                letterSpacing: '0.10em',
                color: OTTO_AMBER,
                background: hexA(OTTO_AMBER, isDark ? 0.12 : 0.10),
                border: `1px solid ${hexA(OTTO_AMBER, isDark ? 0.22 : 0.18)}`,
                padding: '2px 6px',
                borderRadius: '3px',
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}>
                MAIN
              </span>
            </div>
            {subtitleText && (
              <span style={{
                fontFamily: "'JetBrains Mono'",
                fontSize: '10.5px',
                fontWeight: 400,
                color: 'var(--text-secondary)',
                letterSpacing: '0.01em',
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
        <div style={{ height: '1px', background: 'var(--border)' }} />

        {/* Tools section */}
        <div style={{ padding: '11px 12px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 2px',
            marginBottom: '3px',
          }}>
            <span style={{
              fontFamily: "'JetBrains Mono'",
              fontSize: '9.5px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}>TOOLS</span>
            <span style={{
              fontFamily: "'JetBrains Mono'",
              fontSize: '9.5px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}>{String(tools.length).padStart(2, '0')}</span>
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
                borderRadius: '5px',
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
                  fontFamily: "'JetBrains Mono'",
                  fontSize: '10px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em',
                  flexShrink: 0,
                }}>
                  {tool.type}
                </span>
              </div>
            );
          })}

          {tools.length === 0 && (
            <div style={{
              padding: '10px',
              textAlign: 'center',
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontFamily: "'Inter'",
            }}>
              No tools configured
            </div>
          )}
        </div>
      </div>

      {/* Input handle — left center */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ ...dotStyle, position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* Output handles — right side at tool row offsets */}
      {tools.map((_, i) => {
        const headerH = 14 + 34 + 12 + 1 + 11 + 9.5 + 3;
        const toolRowH = 36;
        const y = headerH + i * (toolRowH + 5) + toolRowH / 2;
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
