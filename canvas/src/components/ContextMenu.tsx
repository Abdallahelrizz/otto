import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function ContextMenu() {
  const contextMenu = useStore((s) => s.contextMenu);
  const setContextMenu = useStore((s) => s.setContextMenu);
  const deleteNode = useStore((s) => s.deleteNode);
  const duplicateNode = useStore((s) => s.duplicateNode);
  const selectNode = useStore((s) => s.selectNode);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

    // Delay so the right-click that opened the menu doesn't immediately close it
    const t = setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('contextmenu', close);
    }, 50);
    document.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  if (!contextMenu) return null;

  // Clamp to viewport
  const x = Math.min(contextMenu.x, window.innerWidth - 180);
  const y = Math.min(contextMenu.y, window.innerHeight - 130);
  const { nodeId } = contextMenu;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        background: '#1A1A1A',
        border: '1px solid #2A2A2A',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
        minWidth: '170px',
        overflow: 'hidden',
        fontFamily: "'Inter'",
        fontSize: '13px',
      }}
    >
      <MenuItem
        label="Duplicate"
        shortcut="⌘D"
        onClick={() => { duplicateNode(nodeId); setContextMenu(null); }}
      />
      <MenuItem
        label="Rename"
        onClick={() => { selectNode(nodeId); setContextMenu(null); }}
      />
      <div style={{ height: '1px', background: '#2A2A2A', margin: '3px 0' }} />
      <MenuItem
        label="Delete"
        shortcut="⌫"
        danger
        onClick={() => deleteNode(nodeId)}
      />
    </div>
  );
}

function MenuItem({
  label,
  shortcut,
  onClick,
  danger,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: danger ? '#EF4444' : '#FFFFFF',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        textAlign: 'left',
        transition: 'background 0.08s ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#252525'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span>{label}</span>
      {shortcut && (
        <span style={{ fontSize: '11px', color: '#555', marginLeft: '16px' }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}
