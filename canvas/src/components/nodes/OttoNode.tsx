import { memo, useState, useCallback, Fragment, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useStore } from '../../store';
import { getNodeDef, CATEGORY_COLORS } from './nodeConfig';
import { NodeIcon } from '../NodeIcon';
import type { OttoNodeData } from '../../types';

// ─── helpers ────────────────────────────────────────────────────────────────

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function cardHeightFor(inCount: number, outCount: number): number {
  const vert = Math.max(inCount, outCount);
  if (vert <= 1) return 72;
  const computed = 14 + (vert - 1) * 22 + 14 + 24;
  return Math.max(88, computed);
}

// ─── node label style (JetBrains Mono, 2-line clamp) ────────────────────────

const nodeLabelStyle: CSSProperties = {
  fontFamily: "'JetBrains Mono'",
  fontSize: '11px',
  fontWeight: 500,
  color: 'rgba(232,232,238,0.92)',
  textAlign: 'center',
  lineHeight: 1.18,
  letterSpacing: '-0.005em',
  overflow: 'hidden',
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  wordBreak: 'break-word',
  maxWidth: '100%',
};

// ─── handle label style ──────────────────────────────────────────────────────

const handleLabelBase: CSSProperties = {
  position: 'absolute',
  fontFamily: "'JetBrains Mono'",
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.02em',
  lineHeight: 1,
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  zIndex: 3,
};

// ─── small running spinner ────────────────────────────────────────────────────

function RunningSpinner({ color }: { color: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        width: 8,
        height: 8,
        borderRadius: '50%',
        border: `1.5px solid ${hexA(color, 0.25)}`,
        borderTopColor: color,
        animation: 'otto-spin 0.7s linear infinite',
        zIndex: 4,
        flexShrink: 0,
      }}
    />
  );
}

// ─── OttoNode component ──────────────────────────────────────────────────────

export const OttoNode = memo(({ id, data, selected }: NodeProps<OttoNodeData>) => {
  const execution = useStore((s) => s.nodeExecutions[id]);
  const setContextMenu = useStore((s) => s.setContextMenu);
  const def = getNodeDef(data.nodeType);
  const [hovered, setHovered] = useState(false);

  const status = execution?.status ?? 'idle';
  const cat = def.category;
  const catColor = CATEGORY_COLORS[cat] ?? '#64748b';

  const isRunning  = status === 'running';
  const isSuccess  = status === 'success';
  const isError    = status === 'error';

  // Card dimensions
  const inCount  = def.handles.in.length;
  const outCount = def.handles.out.length;
  const cardWidth  = def.complex ? 100 : 72;
  const cardHeight = def.complex ? cardHeightFor(inCount, outCount) : 72;

  // Border color per state
  const borderColor =
    isRunning ? '#3b82f6' :
    isSuccess ? '#22c55e' :
    isError   ? '#ef4444' :
    selected  ? hexA(catColor, 0.95) :
    hovered   ? hexA(catColor, 0.75) :
                hexA(catColor, 0.55);

  // Box-shadow per state
  const boxShadow =
    isSuccess ? '0 0 0 2px rgba(34,197,94,0.14)' :
    isError   ? '0 0 0 2px rgba(239,68,68,0.14)' :
    selected  ? `0 0 0 3px ${hexA(catColor, 0.15)}` :
    'none';

  const executionClass = isRunning ? ' otto-node-running' : isSuccess ? ' otto-node-success' : isError ? ' otto-node-error' : '';

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
    },
    [id, setContextMenu]
  );

  // Shared handle dot style
  const dotStyle = (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    boxShadow: `0 0 0 2px #0a0a0c`,
    border: 'none',
    zIndex: 2,
    cursor: 'crosshair',
  });

  const extras = def.handles.extras ?? [];

  return (
    <div
      style={{
        position: 'relative',
        width: cardWidth,
        height: cardHeight,
        overflow: 'visible',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
    >
      {/* ── Card body ── */}
      <div
        className={`otto-node-card${executionClass}`}
        style={{
          position: 'absolute',
          inset: 0,
          background: '#101015',
          border: `1.5px solid ${borderColor}`,
          borderRadius: '6px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: '10px',
          paddingBottom: '8px',
          paddingLeft: '4px',
          paddingRight: '4px',
          transition: 'border-color 130ms ease-out, box-shadow 130ms ease-out',
          boxSizing: 'border-box',
          boxShadow,
        }}
      >
        {/* Running spinner — top-right corner */}
        {isRunning && <RunningSpinner color="#3b82f6" />}

        {/* Icon row — 32px tall */}
        <div style={{ height: 32, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <NodeIcon type={data.nodeType} size={28} color={catColor} />
        </div>

        {/* Label */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4px 4px 0',
          width: '100%',
        }}>
          <span style={nodeLabelStyle}>{data.label}</span>
        </div>
      </div>

      {/* ── Input handles + labels ── */}
      {def.handles.in.map((h, i) => {
        const y = ((i + 1) / (inCount + 1)) * cardHeight;
        const color = h.color ?? catColor;
        return (
          <Fragment key={`in-${h.id}`}>
            <Handle
              type="target"
              position={Position.Left}
              id={h.id}
              style={{ ...dotStyle(color), position: 'absolute', left: -4, top: y, transform: 'translateY(-50%)' }}
            />
            {h.label && (
              <span style={{
                ...handleLabelBase,
                right: `calc(100% + 12px)`,
                top: y,
                transform: 'translateY(-50%)',
                textAlign: 'right',
                color: hexA(color, 0.95),
              }}>
                {h.label}
              </span>
            )}
          </Fragment>
        );
      })}

      {/* ── Output handles + labels ── */}
      {def.handles.out.map((h, i) => {
        const y = ((i + 1) / (outCount + 1)) * cardHeight;
        const color = h.color ?? catColor;
        return (
          <Fragment key={`out-${h.id}`}>
            <Handle
              type="source"
              position={Position.Right}
              id={h.id}
              style={{ ...dotStyle(color), position: 'absolute', right: -4, top: y, transform: 'translateY(-50%)' }}
            />
            {h.label && (
              <span style={{
                ...handleLabelBase,
                left: `calc(100% + 12px)`,
                top: y,
                transform: 'translateY(-50%)',
                color: hexA(color, 0.95),
              }}>
                {h.label}
              </span>
            )}
          </Fragment>
        );
      })}

      {/* ── Bottom (extras) handles + labels ── */}
      {extras.map((h, i) => {
        const x = ((i + 1) / (extras.length + 1)) * cardWidth;
        const color = h.color ?? catColor;
        return (
          <Fragment key={`ex-${h.id}`}>
            <Handle
              type="target"
              position={Position.Bottom}
              id={h.id}
              style={{ ...dotStyle(color), position: 'absolute', left: x, bottom: -4, transform: 'translateX(-50%)' }}
            />
            {h.label && (
              <span style={{
                ...handleLabelBase,
                top: `calc(100% + 12px)`,
                left: x,
                transform: 'translateX(-50%)',
                color: hexA(color, 0.90),
                textAlign: 'center',
              }}>
                {h.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </div>
  );
});
