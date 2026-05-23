import { useState } from 'react';
import { NODE_TYPE_DEFS, NODE_CATEGORIES, CATEGORY_COLORS, type NodeTypeDef } from './nodes/nodeConfig';
import { NodeIcon } from './NodeIcon';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../store';
import type { Node } from 'reactflow';

const STORAGE_KEY = 'otto_sidebar_open_cat';

function readStorage(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); }
  catch { return null; }
}

function writeStorage(val: string | null) {
  try {
    if (val) localStorage.setItem(STORAGE_KEY, val);
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* noop */ }
}

export function Sidebar() {
  const setNodes = useStore((s) => s.setNodes);
  const nodes = useStore((s) => s.nodes);
  const sidebarOpen = useStore((s) => s.sidebarOpen);

  // Accordion: one open at a time, default all collapsed
  const [openCat, setOpenCat] = useState<string | null>(readStorage);

  const toggle = (id: string) => {
    setOpenCat((prev) => {
      const next = prev === id ? null : id;
      writeStorage(next);
      return next;
    });
  };

  function onDragStart(e: React.DragEvent, nodeType: string) {
    e.dataTransfer.setData('application/otto-node-type', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  }

  function addToCanvas(nodeType: string) {
    const def = NODE_TYPE_DEFS.find((d) => d.type === nodeType)!;
    const newNode: Node = {
      id: uuidv4(),
      type: 'ottoNode',
      position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: def.label, nodeType: def.type, config: { ...def.defaultConfig } },
    };
    setNodes([...nodes, newNode]);
  }

  return (
    <aside
      style={{
        width: '220px',
        height: '100%',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        clipPath: sidebarOpen ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
        transition: 'clip-path 200ms var(--ease-out)',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: '6px', paddingBottom: '8px' }}>
        {NODE_CATEGORIES.map((cat) => {
          const items = NODE_TYPE_DEFS.filter((d) => d.category === cat.id);
          const isOpen = openCat === cat.id;
          const color = CATEGORY_COLORS[cat.id] ?? '#71717a';

          return (
            <div key={cat.id}>
              {/* Category header */}
              <button
                onClick={() => toggle(cat.id)}
                style={{
                  width: '100%',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  gap: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: "'Inter'",
                  transition: 'background 120ms ease-out',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'none';
                }}
              >
                {/* Color dot */}
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                  }}
                />

                {/* Category name — JetBrains Mono */}
                <span
                  style={{
                    fontFamily: "'JetBrains Mono'",
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'rgba(180,180,190,0.85)',
                    letterSpacing: '0.14em',
                    flex: 1,
                    textAlign: 'left',
                  }}
                >
                  {cat.label}
                </span>

                {/* Count — only when collapsed */}
                {!isOpen && (
                  <span
                    style={{
                      fontSize: '10px',
                      color: color,
                      opacity: 0.65,
                      fontWeight: 500,
                      letterSpacing: '0.02em',
                    }}
                  >
                    · {items.length}
                  </span>
                )}

                {/* Chevron — rotates on open */}
                <span
                  style={{
                    color: color,
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                  }}
                >
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path
                      d="M2 1.5L5.5 4L2 6.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>

              {/* Accordion content — CSS grid row trick for GPU-friendly height animation */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                }}
              >
                <div style={{ overflow: 'hidden' }}>
                  {items.map((def) => (
                    <NodeRow
                      key={def.type}
                      def={def}
                      onDragStart={onDragStart}
                      onClick={addToCanvas}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function NodeRow({
  def,
  onDragStart,
  onClick,
}: {
  def: NodeTypeDef;
  onDragStart: (e: React.DragEvent, type: string) => void;
  onClick: (type: string) => void;
}) {
  const catColor = CATEGORY_COLORS[def.category] ?? '#64748b';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, def.type)}
      onClick={() => onClick(def.type)}
      title={def.description}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '0 12px',
        height: '36px',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'background 120ms ease-out',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      {/* Icon container — 26×26, 6px radius, 10% opacity bg */}
      <span
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '26px',
          borderRadius: '6px',
          background: `${catColor}1a`,
        }}
      >
        <NodeIcon type={def.type} size={14} color={catColor} />
      </span>

      {/* Label — Inter 13px */}
      <span
        style={{
          fontFamily: "'Inter'",
          fontSize: '13px',
          fontWeight: 500,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {def.label}
      </span>
    </div>
  );
}
