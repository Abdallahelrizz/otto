import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { PushPin, Note } from '@phosphor-icons/react';
import { useStore } from '../../store';
import { getNodeDef, nodeColor, OTTO_AMBER } from './nodeConfig';
import { NodeIcon } from '../NodeIcon';
import { tileIdentityColor, tileSurface } from './OttoNode';
import type { OttoNodeData } from '../../types';

const AGENT_TILE = 100;
const AGENT_MIN_HITBOX = 170;
const TOOL_TILE_W = 54;
const TOOL_TILE_GAP = 14;
const UI_FONT = 'Geist, system-ui, sans-serif';
const MONO_FONT = 'Geist Mono, monospace';

// Tools are structured config on the agent ({ id, name, type }), not edge-connected nodes.
interface AgentTool {
  id: string;
  name: string;
  type: string;
}

export const AgentNode = memo(({ id, data, selected }: NodeProps<OttoNodeData>) => {
  const execution  = useStore((s) => s.nodeExecutions[id]);
  const isPinned   = useStore((s) => Object.prototype.hasOwnProperty.call(s.pinnedData, id));
  const validationIssue = useStore((s) => s.validationIssues.find((issue) => issue.nodeId === id));
  const setContextMenu  = useStore((s) => s.setContextMenu);
  const theme = useStore((s) => s.theme);
  const def   = getNodeDef(data.nodeType);
  const dark  = theme === 'dark';

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
  const toolRowWidth = tools.length > 0
    ? tools.length * TOOL_TILE_W + Math.max(0, tools.length - 1) * TOOL_TILE_GAP
    : 0;
  const hitboxWidth = Math.max(AGENT_MIN_HITBOX, AGENT_TILE, toolRowWidth);
  const tileOffsetX = (hitboxWidth - AGENT_TILE) / 2;

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, nodeId: id });
    },
    [id, setContextMenu]
  );

  const surface = tileSurface(theme, OTTO_AMBER, Boolean(selected));
  const handleActive = isRunning || isSuccess;

  const hasStatus = isRunning || isSuccess || isError || isValidationError || isValidationWarning;
  const pipColor =
    isRunning ? 'var(--node-running)' :
    isSuccess ? 'var(--node-success)' :
    isError || isValidationError ? 'var(--node-error)' :
    isValidationWarning ? 'var(--node-running)' :
    'transparent';

  const subtitleText = def.subtitle ? def.subtitle(data.config ?? {}) : (def.description ?? '');

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
        width: hitboxWidth,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 9,
        cursor: 'grab',
        userSelect: 'none',
        opacity: isDisabled ? 0.45 : 1,
      }}
    >
      {/* Hero tile */}
      <div
        className={isRunning ? 'otto-node-running' : undefined}
        style={{
          position: 'relative',
          width: AGENT_TILE,
          height: AGENT_TILE,
          borderRadius: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: isDisabled ? 'grayscale(0.3)' : 'none',
          ...surface,
        }}
      >
        {(isPinned || showNote) && (
          <div style={{ position: 'absolute', top: 8, left: 9, display: 'flex', gap: 3, zIndex: 3 }}>
            {isPinned && <PushPin size={12} weight="fill" color={OTTO_AMBER} />}
            {showNote && <Note size={12} weight="regular" color="var(--text-muted)" />}
          </div>
        )}

        {hasStatus && (
          <span
            className={isRunning ? 'otto-status-strip-running' : undefined}
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: pipColor,
              boxShadow: '0 0 0 2px var(--bg-canvas)',
              zIndex: 3,
            }}
          />
        )}

        <NodeIcon type={data.nodeType} size={40} color={OTTO_AMBER} />

        {/* Amber accent bar */}
        <span style={{
          position: 'absolute',
          bottom: 11,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 34,
          height: 4,
          borderRadius: 2,
          background: OTTO_AMBER,
          opacity: dark ? 0.95 : 0.85,
        }} />
      </div>

      {/* Caption */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, maxWidth: 138 }}>
        <span style={{
          fontFamily: UI_FONT,
          fontSize: '13px',
          fontWeight: 700,
          letterSpacing: '-0.014em',
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

      {/* Tools block */}
      {tools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Connector tick */}
          <span style={{ width: 1.5, height: 14, background: 'var(--border-strong)' }} />
          {/* Label */}
          <span style={{
            fontFamily: MONO_FONT,
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.16em',
            color: 'var(--text-muted)',
            margin: '7px 0 9px',
          }}>
            TOOLS · {String(tools.length).padStart(2, '0')}
          </span>
          {/* Row of mini tool tiles */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            {tools.map((tool) => {
              const tc = nodeColor(getNodeDef(tool.type), theme);
              const identity = tileIdentityColor(theme, tc);
              const mini = tileSurface(theme, identity, false, { glow: false });
              return (
                <div key={tool.id} style={{ width: TOOL_TILE_W, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{
                    position: 'relative',
                    width: 40,
                    height: 40,
                    borderRadius: 13,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    ...mini,
                  }}>
                    <NodeIcon type={tool.type} size={17} color={identity} />
                    <span style={{
                      position: 'absolute',
                      bottom: 5,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 13,
                      height: 2.5,
                      borderRadius: 1.5,
                      background: identity,
                      opacity: dark ? 0.95 : 0.85,
                    }} />
                  </div>
                  <span style={{
                    fontFamily: UI_FONT,
                    fontSize: '9.5px',
                    fontWeight: 500,
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    lineHeight: 1.2,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {tool.name}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Note annotation */}
      {showNote && (
        <div style={{
          maxWidth: 170,
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

      {/* Handles: single in / single out, forced to the hero tile's center */}
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        style={{ ...handleStyle, left: tileOffsetX - 5, top: AGENT_TILE / 2, transform: 'translateY(-50%)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        style={{ ...handleStyle, right: tileOffsetX - 5, top: AGENT_TILE / 2, transform: 'translateY(-50%)' }}
      />
    </div>
  );
});
