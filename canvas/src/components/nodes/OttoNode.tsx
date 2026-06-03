import { memo, useCallback, Fragment } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useStore } from '../../store';
import { getNodeDef, nodeColor, nodeRadius, OTTO_AMBER, NODE_SERVICE_LOGO } from './nodeConfig';
import { NodeIcon } from '../NodeIcon';
import { ServiceLogo } from '../ServiceLogo';
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

const NODE_W = 220;
const NODE_H_MIN = 64;
const ICON_SIZE = 32;
const UI_FONT = 'Geist, system-ui, sans-serif';

function cardHeight(inCount: number, outCount: number): number {
  const max = Math.max(inCount, outCount);
  if (max <= 1) return NODE_H_MIN;
  return NODE_H_MIN + (max - 1) * 26;
}

function RunningSpinner({ color }: { color: string }) {
  return (
    <span style={{
      position: 'absolute',
      top: 7,
      right: 9,
      width: 8,
      height: 8,
      borderRadius: '50%',
      border: `1.5px solid ${hexA(color, 0.22)}`,
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
  const noteHeight = showNote ? 48 : 0;

  // Status strip color (left 3px bar)
  const hasStatus = isRunning || isSuccess || isError || isValidationError || isValidationWarning;
  const stripColor =
    isRunning ? 'var(--node-running)' :
    isSuccess ? 'var(--node-success)' :
    isError || isValidationError ? 'var(--node-error)' :
    isValidationWarning ? 'var(--node-running)' :
    'transparent';

  // Border: subtle at rest, accent on selected/hover (handled by CSS class), status on error
  const borderColor =
    isError || isValidationError ? hexA('#ef4444', 0.35) :
    isValidationWarning ? hexA('#f59e0b', 0.35) :
    selected ? hexA(cardColor, 0.55) :
    'var(--border-node)';

  const boxShadow =
    selected ? `0 0 0 2px ${hexA(cardColor, 0.20)}, var(--shadow)` :
    isRunning ? 'var(--shadow)' :
    'var(--shadow)';

  const executionClass = isRunning ? ' otto-node-running' : '';

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
    },
    [id, setContextMenu]
  );

  const dotStyle = (color: string): React.CSSProperties => ({
    width: 9,
    height: 9,
    borderRadius: '50%',
    background: color,
    boxShadow: '0 0 0 2px var(--bg-canvas)',
    border: 'none',
    zIndex: 2,
    cursor: 'crosshair',
    transition: 'transform 0.15s ease',
  });

  const tagText = def.tag || def.slug || '';
  const tagColor = tagText === 'TRIGGER' ? OTTO_AMBER : 'var(--text-muted)';
  const tagBg = tagText === 'TRIGGER' ? hexA(OTTO_AMBER, 0.10) : 'rgba(120,115,110,0.07)';
  const tagBorder = tagText === 'TRIGGER' ? hexA(OTTO_AMBER, 0.20) : 'rgba(120,115,110,0.14)';

  const subtitleText = def.subtitle ? def.subtitle(data.config ?? {}) : '';
  // Icon container radius: scale up proportionally from nodeRadius
  const iconRadius = nodeRadius(def).replace(/\d+px/, (v) => `${Math.round(parseInt(v) * 1.4)}px`);
  // Brand logo (Slack, GitHub, …) when this node maps to a service catalog entry
  const serviceLogo = NODE_SERVICE_LOGO[data.nodeType];

  return (
    <div
      style={{ position: 'relative', width: NODE_W, height: h + noteHeight, overflow: 'visible', cursor: 'default', userSelect: 'none' }}
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
          borderRadius: '12px',
          boxShadow,
          opacity: isDisabled ? 0.55 : 1,
          filter: isDisabled ? 'grayscale(0.3)' : 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '11px',
          padding: '10px 14px 10px 18px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* Status strip — left edge */}
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
              transition: 'background 200ms ease, opacity 200ms ease',
            }}
          />
        )}

        {isRunning && <RunningSpinner color="var(--node-running)" />}

        {/* Disabled badge */}
        {isDisabled && (
          <span style={{
            position: 'absolute',
            bottom: 7,
            right: 10,
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
          <span style={{
            position: 'absolute',
            right: 9,
            bottom: 7,
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
            left: 10,
            bottom: 7,
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

        {/* Icon container — brand logo for service nodes, else the type icon */}
        {serviceLogo ? (
          <span style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            minWidth: ICON_SIZE,
            borderRadius: iconRadius,
            background: 'var(--bg-hover)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}>
            <ServiceLogo catalogId={serviceLogo} name={def.label} fallbackColor={cardColor} size={20} />
          </span>
        ) : (
          <span style={{
            width: ICON_SIZE,
            height: ICON_SIZE,
            minWidth: ICON_SIZE,
            borderRadius: iconRadius,
            background: hexA(cardColor, theme === 'dark' ? 0.14 : 0.11),
            border: `1px solid ${hexA(cardColor, theme === 'dark' ? 0.22 : 0.18)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <NodeIcon type={data.nodeType} size={16} color={cardColor} />
          </span>
        )}

        {/* Label + tag + subtitle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label row with inline tag */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: subtitleText ? '2px' : 0 }}>
            <span style={{
              fontFamily: UI_FONT,
              fontSize: '13px',
              fontWeight: 550,
              color: 'var(--text-primary)',
              letterSpacing: '-0.012em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}>
              {data.label}
            </span>
            {tagText && (
              <span style={{
                fontFamily: UI_FONT,
                fontSize: '10px',
                fontWeight: 600,
                color: tagColor,
                background: tagBg,
                border: `1px solid ${tagBorder}`,
                padding: '1px 5px',
                borderRadius: '4px',
                lineHeight: 1.3,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                letterSpacing: '0.01em',
              }}>
                {tagText.charAt(0) + tagText.slice(1).toLowerCase()}
              </span>
            )}
          </div>
          {/* Subtitle — Geist, not mono */}
          {subtitleText && (
            <span style={{
              fontFamily: UI_FONT,
              fontSize: '11px',
              fontWeight: 400,
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              display: 'block',
            }}>
              {subtitleText}
            </span>
          )}
        </div>
      </div>

      {/* Note annotation */}
      {showNote && (
        <div style={{
          position: 'absolute',
          top: h + 7,
          left: 0,
          width: NODE_W,
          minHeight: 36,
          maxHeight: 42,
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
                right: `calc(100% + 11px)`,
                top: y,
                transform: 'translateY(-50%)',
                fontFamily: UI_FONT,
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
                left: `calc(100% + 11px)`,
                top: y,
                transform: 'translateY(-50%)',
                fontFamily: UI_FONT,
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
