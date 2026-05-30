import { memo, useState, useCallback, Fragment } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useStore } from '../../store';
import { getNodeDef, nodeColor, nodeRadius, OTTO_AMBER } from './nodeConfig';
import { NodeIcon } from '../NodeIcon';
import type { OttoNodeData } from '../../types';

function hexA(hex: string, a: number): string {
  if (hex.startsWith('rgba(')) return hex.replace(/rgba\(([^)]+),\s*[\d.]+\)/, `rgba($1, ${a})`);
  if (hex.startsWith('rgb('))  return hex.replace(/rgb\(([^)]+)\)/, `rgba($1, ${a})`);
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

const NODE_W = 196;
const NODE_H_MIN = 58;

function cardHeight(inCount: number, outCount: number): number {
  const max = Math.max(inCount, outCount);
  if (max <= 1) return NODE_H_MIN;
  return NODE_H_MIN + (max - 1) * 24;
}

function RunningSpinner({ color }: { color: string }) {
  return (
    <span style={{
      position: 'absolute',
      top: 6,
      right: 6,
      width: 7,
      height: 7,
      borderRadius: '50%',
      border: `1.5px solid ${hexA(color, 0.25)}`,
      borderTopColor: color,
      animation: 'otto-spin 0.7s linear infinite',
      flexShrink: 0,
      display: 'block',
    }} />
  );
}

export const OttoNode = memo(({ id, data, selected }: NodeProps<OttoNodeData>) => {
  const execution = useStore((s) => s.nodeExecutions[id]);
  const isPinned = useStore((s) => Object.prototype.hasOwnProperty.call(s.pinnedData, id));
  const validationIssue = useStore((s) => s.validationIssues.find((issue) => issue.nodeId === id));
  const setContextMenu = useStore((s) => s.setContextMenu);
  const theme = useStore((s) => s.theme);
  const def = getNodeDef(data.nodeType);
  const [hovered, setHovered] = useState(false);

  const status = execution?.status ?? 'idle';
  const cardColor = nodeColor(def, theme);
  const isRunning = status === 'running';
  const isSuccess = status === 'success';
  const isError   = status === 'error';
  const isValidationError = validationIssue?.severity === 'error';
  const isValidationWarning = validationIssue?.severity === 'warning';
  const isDisabled = Boolean(data.disabled);
  const noteText = String(data.notes ?? '').trim();
  const showNote = Boolean(data.displayNote && noteText);

  const inCount  = def.handles.in.length;
  const outCount = def.handles.out.length;
  const h = cardHeight(inCount, outCount);
  const noteHeight = showNote ? 46 : 0;

  const borderColor =
    isRunning ? 'var(--node-running)' :
    isSuccess ? 'var(--node-success)' :
    isError   ? 'var(--node-error)' :
    isValidationError ? 'var(--node-error)' :
    isValidationWarning ? 'var(--node-running)' :
    isDisabled ? 'var(--border)' :
    selected  ? cardColor :
    hovered   ? 'var(--border-input)' :
                'var(--border-node)';

  const boxShadow =
    selected  ? `0 0 0 3px ${hexA(cardColor, 0.18)}, var(--shadow)` :
    isSuccess ? '0 0 0 2px color-mix(in srgb, var(--node-success) 18%, transparent)' :
    isError   ? '0 0 0 2px color-mix(in srgb, var(--node-error) 18%, transparent)' :
    'var(--shadow)';

  const executionClass = isRunning ? ' otto-node-running' : isSuccess ? ' otto-node-success' : isError ? ' otto-node-error' : '';

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
    },
    [id, setContextMenu]
  );

  const dotStyle = (color: string): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    boxShadow: '0 0 0 2px var(--bg-canvas)',
    border: 'none',
    zIndex: 2,
    cursor: 'crosshair',
  });

  const tagText = def.tag || def.slug || '';
  const tagColor = tagText === 'TRIGGER' ? OTTO_AMBER : 'var(--text-muted)';
  const tagBg = tagText === 'TRIGGER' ? hexA(OTTO_AMBER, 0.12) : 'rgba(120,115,110,0.08)';
  const tagBorder = tagText === 'TRIGGER' ? hexA(OTTO_AMBER, 0.22) : 'rgba(120,115,110,0.16)';

  const subtitleText = def.subtitle ? def.subtitle(data.config ?? {}) : '';

  return (
    <div
      style={{ position: 'relative', width: NODE_W, height: h + noteHeight, overflow: 'visible', cursor: 'pointer', userSelect: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
    >
      {/* Card body */}
      <div
        className={`otto-node-card${executionClass}`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: h,
          background: 'var(--bg-node-card)',
          border: `1px solid ${borderColor}`,
          borderRadius: '6px',
          boxShadow,
          opacity: isDisabled ? 0.58 : 1,
          filter: isDisabled ? 'grayscale(0.25)' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '9px 12px',
          boxSizing: 'border-box',
          transition: 'border-color 130ms ease-out, box-shadow 130ms ease-out',
          overflow: 'hidden',
        }}
      >
        {isRunning && <RunningSpinner color="var(--node-running)" />}
        {isDisabled && (
          <span title="Node disabled" style={{
            position: 'absolute',
            top: tagText ? 27 : 7,
            right: 10,
            fontFamily: "'JetBrains Mono'",
            fontSize: '8.5px',
            fontWeight: 800,
            color: 'var(--text-muted)',
            background: 'rgba(120,115,110,0.10)',
            border: '1px solid rgba(120,115,110,0.22)',
            borderRadius: '3px',
            padding: '1px 4px',
            lineHeight: 1.1,
          }}>
            OFF
          </span>
        )}
        {isPinned && (
          <span title="Pinned data" style={{
            position: 'absolute',
            right: 8,
            bottom: 6,
            fontFamily: "'JetBrains Mono'",
            fontSize: '8.5px',
            fontWeight: 800,
            color: OTTO_AMBER,
            background: hexA(OTTO_AMBER, 0.12),
            border: `1px solid ${hexA(OTTO_AMBER, 0.22)}`,
            borderRadius: '3px',
            padding: '1px 4px',
            lineHeight: 1.1,
          }}>
            PIN
          </span>
        )}

        {validationIssue && (
          <span title={validationIssue.message} style={{
            position: 'absolute',
            left: 8,
            bottom: 6,
            fontFamily: "'JetBrains Mono'",
            fontSize: '8.5px',
            fontWeight: 800,
            color: isValidationError ? 'var(--node-error)' : 'var(--node-running)',
            background: isValidationError ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
            border: `1px solid ${isValidationError ? 'rgba(239,68,68,0.22)' : 'rgba(245,158,11,0.22)'}`,
            borderRadius: '3px',
            padding: '1px 4px',
            lineHeight: 1.1,
          }}>
            {isValidationError ? 'ERR' : 'WARN'}
          </span>
        )}

        {/* Tag — top right */}
        {tagText && (
          <span style={{
            position: 'absolute',
            top: 7,
            right: 10,
            fontFamily: "'JetBrains Mono'",
            fontSize: '9.5px',
            fontWeight: 700,
            letterSpacing: '0.10em',
            color: tagColor,
            background: tagBg,
            border: `1px solid ${tagBorder}`,
            padding: '2px 5px',
            borderRadius: '3px',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            textTransform: 'uppercase',
          }}>
            {tagText}
          </span>
        )}

        {/* Icon container */}
        <span style={{
          width: 26,
          height: 26,
          borderRadius: nodeRadius(def),
          background: hexA(cardColor, theme === 'dark' ? 0.14 : 0.11),
          border: `1px solid ${hexA(cardColor, theme === 'dark' ? 0.22 : 0.18)}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <NodeIcon type={data.nodeType} size={14} color={cardColor} />
        </span>

        {/* Label + subtitle */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.012em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: tagText ? 'calc(100% - 52px)' : '100%',
          }}>
            {data.label}
          </span>
          {subtitleText && (
            <span style={{
              fontFamily: "'JetBrains Mono'",
              fontSize: '10.5px',
              fontWeight: 400,
              color: 'var(--text-muted)',
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

      {showNote && (
        <div style={{
          position: 'absolute',
          top: h + 6,
          left: 0,
          width: NODE_W,
          minHeight: 34,
          maxHeight: 40,
          boxSizing: 'border-box',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: '5px',
          background: 'var(--bg-node-lift)',
          color: 'var(--text-secondary)',
          fontFamily: "'Inter'",
          fontSize: '10.5px',
          lineHeight: 1.35,
          padding: '5px 7px',
          boxShadow: 'var(--shadow)',
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}>
          {noteText}
        </div>
      )}

      {/* Input handles */}
      {def.handles.in.map((h_, i) => {
        const y = ((i + 1) / (inCount + 1)) * h;
        const color = h_.color ?? cardColor;
        return (
          <Fragment key={`in-${h_.id}`}>
            <Handle
              type="target"
              position={Position.Left}
              id={h_.id}
              style={{ ...dotStyle(color), position: 'absolute', left: -4, top: y, transform: 'translateY(-50%)' }}
            />
            {h_.label && (
              <span style={{
                position: 'absolute',
                right: `calc(100% + 10px)`,
                top: y,
                transform: 'translateY(-50%)',
                fontFamily: "'JetBrains Mono'",
                fontSize: '10px',
                fontWeight: 500,
                color: hexA(color, 0.85),
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}>
                {h_.label}
              </span>
            )}
          </Fragment>
        );
      })}

      {/* Output handles */}
      {def.handles.out.map((h_, i) => {
        const y = ((i + 1) / (outCount + 1)) * h;
        const color = h_.color ?? cardColor;
        return (
          <Fragment key={`out-${h_.id}`}>
            <Handle
              type="source"
              position={Position.Right}
              id={h_.id}
              style={{ ...dotStyle(color), position: 'absolute', right: -4, top: y, transform: 'translateY(-50%)' }}
            />
            {h_.label && (
              <span style={{
                position: 'absolute',
                left: `calc(100% + 10px)`,
                top: y,
                transform: 'translateY(-50%)',
                fontFamily: "'JetBrains Mono'",
                fontSize: '10px',
                fontWeight: 500,
                color: hexA(color, 0.85),
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}>
                {h_.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
});
