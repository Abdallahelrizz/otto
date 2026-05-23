import { memo, useState, useCallback, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { useStore } from '../../store';
import {
  getNodeDef,
  CATEGORY_COLORS,
  CATEGORY_RADIUS,
  CATEGORY_CARD_BG,
  CATEGORY_CARD_BG_HOVER,
  CATEGORY_CARD_BG_SELECTED,
  CATEGORY_CARD_BORDER,
  CATEGORY_CARD_BORDER_SELECTED,
} from './nodeConfig';
import { NodeIcon } from '../NodeIcon';
import type { OttoNodeData } from '../../types';

export const OttoNode = memo(({ id, data, selected }: NodeProps<OttoNodeData>) => {
  const execution = useStore((s) => s.nodeExecutions[id]);
  const setContextMenu = useStore((s) => s.setContextMenu);
  const def = getNodeDef(data.nodeType);
  const [hovered, setHovered] = useState(false);

  const status = execution?.status ?? 'idle';
  const cat = def.category;
  const catColor = CATEGORY_COLORS[cat] ?? def.color;

  // Category-specific card appearance
  const cardBg = execution
    ? CATEGORY_CARD_BG[cat]
    : selected
    ? CATEGORY_CARD_BG_SELECTED[cat]
    : hovered
    ? CATEGORY_CARD_BG_HOVER[cat]
    : CATEGORY_CARD_BG[cat];

  const cardBorder = execution
    ? 'transparent'
    : selected
    ? CATEGORY_CARD_BORDER_SELECTED[cat]
    : CATEGORY_CARD_BORDER[cat];

  const executionClass = execution ? ` otto-node-${status}` : '';

  // Small solid-dot handles
  const handleStyle: CSSProperties = {
    width: 7,
    height: 7,
    background: catColor,
    border: 'none',
    borderRadius: '50%',
    zIndex: 10,
  };

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
    },
    [id, setContextMenu]
  );

  const onThreeDot = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setContextMenu({ x: r.left, y: r.bottom + 4, nodeId: id });
    },
    [id, setContextMenu]
  );

  return (
    <div
      className={`otto-node-card${executionClass}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onContextMenu}
      style={{
        width: '200px',
        background: cardBg ?? 'var(--bg-node)',
        border: `1px solid ${cardBorder}`,
        borderRadius: '6px',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'background 120ms ease-out, border-color 120ms ease-out, box-shadow 150ms ease-out',
        fontFamily: 'Geist, sans-serif',
      }}
    >
      {/* Left accent bar — 2px, always visible */}
      <div
        style={{
          position: 'absolute',
          left: 0, top: 0, bottom: 0,
          width: '2px',
          background: catColor,
          borderRadius: '6px 0 0 6px',
        }}
      />

      {/* Input handle */}
      {def.hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          id="input"
          style={{ ...handleStyle, left: -4 }}
        />
      )}

      {/* Main row — exactly 40px */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '40px',
          paddingLeft: '12px',
          paddingRight: '34px',
          gap: '8px',
        }}
      >
        {/* Icon — 26×26, category shape, category color bg at 15% */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '26px',
            height: '26px',
            borderRadius: CATEGORY_RADIUS[cat] ?? '6px',
            background: `${catColor}26`,
            flexShrink: 0,
          }}
        >
          <NodeIcon type={data.nodeType} size={14} color={catColor} />
        </span>

        {/* Label */}
        <span
          style={{
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontWeight: 500,
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
        >
          {data.label}
        </span>

        {/* 3-dot — hover only */}
        <button
          onClick={onThreeDot}
          style={{
            position: 'absolute',
            top: '10px',
            right: '6px',
            width: '20px', height: '20px',
            borderRadius: '4px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            lineHeight: 1,
            color: 'var(--text-secondary)',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.12s ease, background 0.1s ease',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          ···
        </button>
      </div>

      {/* Execution timing row — appended below when active */}
      {execution && (
        <div
          style={{
            borderTop: `1px solid ${CATEGORY_CARD_BORDER[cat] ?? 'var(--border)'}`,
            padding: '3px 12px 4px',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              fontWeight: 500,
              color: status === 'running' ? 'var(--node-running)'
                   : status === 'success' ? 'var(--node-success)'
                   : status === 'error'   ? 'var(--node-error)'
                   : 'var(--text-secondary)',
              fontFamily: 'Geist Mono, monospace',
            }}
          >
            {status === 'running' && '· running'}
            {status === 'success' && `· ${execution.duration_ms ?? 0}ms`}
            {status === 'error'   && '· error'}
            {status === 'skipped' && '· skipped'}
          </span>
        </div>
      )}

      {/* Output handles */}
      {def.outputHandles.length > 1 ? (
        def.outputHandles.map((h, i) => {
          const topPct = ((i + 1) / (def.outputHandles.length + 1)) * 100;
          return (
            <Handle
              key={h.id}
              type="source"
              position={Position.Right}
              id={h.id}
              style={{
                ...handleStyle,
                top: `${topPct}%`,
                right: -4,
                background: h.color ?? catColor,
              }}
            >
              {h.label && (
                <span
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '-3px',
                    fontSize: '8px',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    color: h.color ?? 'var(--text-secondary)',
                    fontFamily: 'Geist, sans-serif',
                  }}
                >
                  {h.label}
                </span>
              )}
            </Handle>
          );
        })
      ) : def.outputHandles.length === 1 ? (
        <Handle
          type="source"
          position={Position.Right}
          id={def.outputHandles[0].id}
          style={{ ...handleStyle, right: -4 }}
        />
      ) : null}
    </div>
  );
});
