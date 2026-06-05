import { memo, useCallback, Fragment } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { PushPin, Note } from '@phosphor-icons/react';
import { useStore } from '../../store';
import { getNodeDef, nodeColor, OTTO_AMBER, NODE_SERVICE_LOGO } from './nodeConfig';
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

const TILE = 76;
const NODE_HITBOX = 150;
const TILE_OFFSET_X = (NODE_HITBOX - TILE) / 2;
const ICON_SIZE = 28;
const UI_FONT = 'Geist, system-ui, sans-serif';
const MONO_FONT = 'Geist Mono, monospace';

function alphaColor(color: string, a: number): string {
  if (color.startsWith('#') || color.startsWith('rgb')) return hexA(color, a);
  return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
}

function relativeLuminance(hex: string): number | null {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function tileIdentityColor(theme: 'dark' | 'light', color: string): string {
  const lum = relativeLuminance(color);
  if (theme === 'dark' && lum !== null && lum < 0.12) return 'var(--text-primary)';
  return color;
}

/**
 * Shared tile surface, built from theme tokens so it matches the dashboard in
 * both themes (NEVER hardcode the mockup hexes). Used by regular tiles, the agent
 * hero tile, and the mini tool tiles. `glow=false` drops the color-tinted shadow.
 */
export function tileSurface(
  theme: 'dark' | 'light',
  color: string,
  selected: boolean,
  { glow = true }: { glow?: boolean } = {},
): React.CSSProperties {
  const dark = theme === 'dark';
  const depth = dark
    ? '0 10px 22px -6px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.07)'
    : '0 8px 18px -6px rgba(15,15,10,0.16), inset 0 1px 0 rgba(255,255,255,0.95)';

  if (selected) {
    return {
      background: 'var(--bg-node-tile)',
      border: `1px solid ${OTTO_AMBER}`,
      boxShadow: `0 0 0 3px ${hexA(OTTO_AMBER, dark ? 0.28 : 0.22)}, ${depth}`,
    };
  }

  const identityGlow = glow ? `, 0 14px 30px -14px ${alphaColor(color, dark ? 0.55 : 0.32)}` : '';
  return {
    background: 'var(--bg-node-tile)',
    border: '1px solid var(--border-strong)',
    boxShadow: `${depth}${identityGlow}`,
  };
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
  const identityColor = tileIdentityColor(theme, cardColor);
  const dark = theme === 'dark';
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

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
    },
    [id, setContextMenu]
  );

  const surface = tileSurface(theme, identityColor, Boolean(selected));
  const handleActive = isRunning || isSuccess;

  // Status pip color (top-right of the tile)
  const hasStatus = isRunning || isSuccess || isError || isValidationError || isValidationWarning;
  const pipColor =
    isRunning ? 'var(--node-running)' :
    isSuccess ? 'var(--node-success)' :
    isError || isValidationError ? 'var(--node-error)' :
    isValidationWarning ? 'var(--node-running)' :
    'transparent';

  const subtitleText = def.subtitle ? def.subtitle(data.config ?? {}) : (def.description ?? '');
  const serviceLogo = NODE_SERVICE_LOGO[data.nodeType];

  const handleStyle: React.CSSProperties = {
    width: 10,
    height: 10,
    borderRadius: 3,
    background: handleActive ? OTTO_AMBER : 'var(--text-muted)',
    boxShadow: '0 0 0 2.5px var(--bg-canvas)',
    border: 'none',
    zIndex: 2,
    cursor: 'crosshair',
    transition: 'background 0.15s ease',
  };

  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        position: 'relative',
        width: NODE_HITBOX,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 9,
        cursor: 'grab',
        userSelect: 'none',
        opacity: isDisabled ? 0.45 : 1,
      }}
    >
      {/* Tile */}
      <div
        className={isRunning ? 'otto-node-running' : undefined}
        style={{
          position: 'relative',
          width: TILE,
          height: TILE,
          borderRadius: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: isDisabled ? 'grayscale(0.3)' : 'none',
          ...surface,
        }}
      >
        {/* Badges: top-left */}
        {(isPinned || showNote) && (
          <div style={{ position: 'absolute', top: 7, left: 8, display: 'flex', gap: 3, zIndex: 3 }}>
            {isPinned && <PushPin size={11} weight="fill" color={OTTO_AMBER} />}
            {showNote && <Note size={11} weight="regular" color="var(--text-muted)" />}
          </div>
        )}

        {/* Status pip: top-right corner */}
        {hasStatus && (
          <span
            className={isRunning ? 'otto-status-strip-running' : undefined}
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: pipColor,
              boxShadow: '0 0 0 2px var(--bg-canvas)',
              zIndex: 3,
            }}
          />
        )}

        {/* Icon: the only thing in the tile */}
        {serviceLogo ? (
          <ServiceLogo catalogId={serviceLogo} name={def.label} fallbackColor={identityColor} size={ICON_SIZE} darkTile={dark} />
        ) : (
          <NodeIcon type={data.nodeType} size={ICON_SIZE} color={identityColor} />
        )}

        {/* Identity accent bar: bottom-center */}
        <span
          style={{
            position: 'absolute',
            bottom: 9,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 24,
            height: 3.5,
            borderRadius: 2,
            background: identityColor,
            opacity: dark ? 0.95 : 0.85,
          }}
        />
      </div>

      {/* Caption */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, maxWidth: 138 }}>
        <span style={{
          fontFamily: UI_FONT,
          fontSize: '12.5px',
          fontWeight: 600,
          letterSpacing: '-0.012em',
          lineHeight: 1.25,
          textAlign: 'center',
          textWrap: 'balance',
          color: 'var(--text-primary)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {data.label}
        </span>
        {subtitleText && (
          <span style={{
            fontFamily: MONO_FONT,
            fontSize: '10px',
            fontWeight: 400,
            color: 'var(--text-muted)',
            textAlign: 'center',
            maxWidth: 138,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {subtitleText}
          </span>
        )}
      </div>

      {/* Note annotation */}
      {showNote && (
        <div style={{
          maxWidth: 150,
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

      {/* Input handles: forced to the tile's vertical center */}
      {def.handles.in.map((h_, i) => {
        const y = (TILE * (i + 1)) / (inCount + 1);
        return (
          <Fragment key={`in-${h_.id}`}>
            <Handle
              type="target"
              position={Position.Left}
              id={h_.id}
              style={{ ...handleStyle, left: TILE_OFFSET_X - 5, top: y, transform: 'translateY(-50%)' }}
            />
            {h_.label && (
              <span style={{
                position: 'absolute',
                right: NODE_HITBOX - TILE_OFFSET_X + 9,
                top: y,
                transform: 'translateY(-50%)',
                fontFamily: MONO_FONT,
                fontSize: '11px',
                fontWeight: 500,
                color: alphaColor(h_.color ?? identityColor, 0.85),
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
        const y = (TILE * (i + 1)) / (outCount + 1);
        return (
          <Fragment key={`out-${h_.id}`}>
            <Handle
              type="source"
              position={Position.Right}
              id={h_.id}
              style={{ ...handleStyle, right: TILE_OFFSET_X - 5, top: y, transform: 'translateY(-50%)' }}
            />
            {h_.label && (
              <span style={{
                position: 'absolute',
                left: TILE_OFFSET_X + TILE + 9,
                top: y,
                transform: 'translateY(-50%)',
                fontFamily: MONO_FONT,
                fontSize: '11px',
                fontWeight: 500,
                color: alphaColor(h_.color ?? identityColor, 0.85),
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
