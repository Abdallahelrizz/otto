import { useState } from 'react';
import { NODE_TYPE_DEFS, NODE_CATEGORIES, nodeColor, nodeRadius, OTTO_AMBER, type NodeTypeDef } from './nodes/nodeConfig';
import { NodeIcon } from './NodeIcon';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../store';
import type { Node } from 'reactflow';

const AMBER = OTTO_AMBER;

const NAV_ITEMS = [
  { id: 'workflows', label: 'Workflows',    badge: null   },
  { id: 'library',   label: 'Node library', badge: null   },
  { id: 'history',   label: 'History',      badge: null   },
  { id: 'models',    label: 'Models',       badge: 4      },
  { id: 'memory',    label: 'Memory',       badge: null   },
  { id: 'settings',  label: 'Settings',     badge: null   },
];

function NavIcon({ id }: { id: string }) {
  const paths: Record<string, React.ReactNode> = {
    workflows: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="18" r="3"/><circle cx="18" cy="6" r="3"/><line x1="6" y1="15" x2="6" y2="3"/><line x1="18" y1="21" x2="18" y2="9"/><line x1="6" y1="3" x2="18" y2="3"/>
      </svg>
    ),
    library: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
      </svg>
    ),
    history: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
        <polyline points="12 7 12 12 16 14"/>
      </svg>
    ),
    models: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
      </svg>
    ),
    memory: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
      </svg>
    ),
    settings: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  };
  return <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{paths[id] ?? null}</span>;
}

const STORAGE_KEY = 'otto_sidebar_open_cat';
function readStorage(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); }
  catch { return null; }
}
function writeStorage(val: string | null) {
  try { if (val) localStorage.setItem(STORAGE_KEY, val); else localStorage.removeItem(STORAGE_KEY); }
  catch { /* noop */ }
}

export function Sidebar() {
  const setNodes = useStore((s) => s.setNodes);
  const nodes = useStore((s) => s.nodes);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const activeSidebarTab = useStore((s) => s.activeSidebarTab);
  const setActiveSidebarTab = useStore((s) => s.setActiveSidebarTab);
  const theme = useStore((s) => s.theme);
  const isDark = theme === 'dark';

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
      type: nodeType === 'ai_agent' ? 'agentNode' : 'ottoNode',
      position: { x: 200 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: { label: def.label, nodeType: def.type, config: { ...def.defaultConfig } },
    };
    setNodes([...nodes, newNode]);
  }

  return (
    <aside
      style={{
        width: '216px',
        height: '100%',
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Brand mark */}
      <div style={{
        height: '54px',
        display: 'flex',
        alignItems: 'center',
        gap: '9px',
        padding: '0 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{
          width: 22,
          height: 22,
          borderRadius: '5px',
          background: AMBER,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </span>
        <span style={{
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.022em',
          fontFamily: "'Inter'",
        }}>
          otto
        </span>
      </div>

      {/* Nav items */}
      <div style={{ padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = activeSidebarTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveSidebarTab(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '7px 10px',
                borderRadius: '5px',
                background: isActive
                  ? (isDark ? 'var(--bg-node-lift)' : '#EAE7E2')
                  : 'transparent',
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                transition: 'background 100ms ease',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <NavIcon id={item.id} />
              <span style={{
                flex: 1,
                fontSize: '12.5px',
                fontWeight: isActive ? 600 : 500,
                color: 'inherit',
                letterSpacing: '-0.008em',
                textAlign: 'left',
                fontFamily: "'Inter'",
              }}>
                {item.label}
              </span>
              {item.badge != null && (
                <span style={{
                  fontFamily: "'JetBrains Mono'",
                  fontSize: '9.5px',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.02em',
                  padding: '1px 6px',
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,15,10,0.04)',
                  borderRadius: '8px',
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content area — Node library */}
      {activeSidebarTab === 'library' && (
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '8px' }}>
          {NODE_CATEGORIES.map((cat) => {
            const items = NODE_TYPE_DEFS.filter((d) => d.category === cat.id);
            const isOpen = openCat === cat.id;

            return (
              <div key={cat.id}>
                <button
                  onClick={() => toggle(cat.id)}
                  style={{
                    width: '100%',
                    height: '34px',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: "'Inter'",
                    transition: 'background 120ms ease-out',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <span style={{
                    fontFamily: "'JetBrains Mono'",
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.14em',
                    flex: 1,
                    textAlign: 'left',
                    textTransform: 'uppercase',
                  }}>
                    {cat.label}
                  </span>
                  {!isOpen && (
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.02em' }}>
                      {items.length}
                    </span>
                  )}
                  <span style={{
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                  }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M2 1.5L5.5 4L2 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>

                <div style={{
                  display: 'grid',
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  transition: 'grid-template-rows 150ms cubic-bezier(0.23, 1, 0.32, 1)',
                }}>
                  <div style={{ overflow: 'hidden' }}>
                    {items.map((def) => (
                      <NodeRow key={def.type} def={def} theme={theme} onDragStart={onDragStart} onClick={addToCanvas} />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Placeholder for other tabs */}
      {activeSidebarTab !== 'library' && (
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '8px',
          padding: '24px 16px',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '-0.005em' }}>
            {activeSidebarTab === 'workflows' && 'Workflows list coming soon'}
            {activeSidebarTab === 'history' && 'Execution history coming soon'}
            {activeSidebarTab === 'models' && 'Model registry coming soon'}
            {activeSidebarTab === 'memory' && 'Memory explorer coming soon'}
            {activeSidebarTab === 'settings' && 'Settings coming soon'}
          </span>
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '10px 8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', padding: '4px 6px' }}>
          <span style={{
            width: 26,
            height: 26,
            borderRadius: '13px',
            background: `linear-gradient(135deg, ${AMBER}, #FF8A47)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Inter',
            fontSize: '10.5px',
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-0.01em',
            flexShrink: 0,
          }}>
            AE
          </span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.008em',
              fontFamily: "'Inter'",
            }}>
              Abdallah Elrizz
            </span>
            <span style={{
              fontFamily: "'JetBrains Mono'",
              fontSize: '10px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              letterSpacing: '0.02em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              Pro · 38%
            </span>
          </div>
        </div>

        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            width: '100%',
            padding: '8px 12px',
            background: AMBER,
            border: 'none',
            color: '#fff',
            fontFamily: 'Inter',
            fontSize: '12.5px',
            fontWeight: 600,
            letterSpacing: '-0.005em',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#FF8A47'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = AMBER; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New workflow
        </button>
      </div>
    </aside>
  );
}

function NodeRow({
  def,
  theme,
  onDragStart,
  onClick,
}: {
  def: NodeTypeDef;
  theme: 'dark' | 'light';
  onDragStart: (e: React.DragEvent, type: string) => void;
  onClick: (type: string) => void;
}) {
  const color = nodeColor(def, theme);
  const radius = nodeRadius(def);

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
        padding: '0 10px',
        height: '34px',
        cursor: 'grab',
        userSelect: 'none',
        transition: 'background 120ms ease-out',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '22px',
        height: '22px',
        borderRadius: radius,
        background: `${color}1a`,
        border: `1px solid ${color}33`,
      }}>
        <NodeIcon type={def.type} size={12} color={color} />
      </span>
      <span style={{
        fontFamily: "'Inter'",
        fontSize: '12.5px',
        fontWeight: 500,
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {def.label}
      </span>
    </div>
  );
}
