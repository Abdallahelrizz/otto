import { useEffect, useRef } from 'react';
import { useStore } from '../store';

export function ContextMenu() {
  const contextMenu = useStore((s) => s.contextMenu);
  const setContextMenu = useStore((s) => s.setContextMenu);
  const nodes = useStore((s) => s.nodes);
  const copyNodes = useStore((s) => s.copyNodes);
  const pasteNodes = useStore((s) => s.pasteNodes);
  const duplicateNodes = useStore((s) => s.duplicateNodes);
  const deleteNodes = useStore((s) => s.deleteNodes);
  const toggleNodesDisabled = useStore((s) => s.toggleNodesDisabled);
  const nodeClipboard = useStore((s) => s.nodeClipboard);
  const selectNode = useStore((s) => s.selectNode);
  const runExecution = useStore((s) => s.runExecution);
  const pinNodeOutput = useStore((s) => s.pinNodeOutput);
  const clearPinnedDataForNode = useStore((s) => s.clearPinnedDataForNode);
  const pinnedData = useStore((s) => s.pinnedData);
  const setBottomPanelsOpen = useStore((s) => s.setBottomPanelsOpen);
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
  const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 180));
  const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 410));
  const { nodeId } = contextMenu;
  const selectedNodeIds = nodes.filter((item) => item.selected).map((item) => item.id);
  const actionNodeIds = selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId];
  const actionCount = actionNodeIds.length;
  const actionNodes = nodes.filter((item) => actionNodeIds.includes(item.id));
  const isDisabled = actionNodes.length > 0 && actionNodes.every((item) => Boolean(item.data.disabled));
  const hasCopiedNodes = Boolean(nodeClipboard?.nodes.length);
  const hasPinnedData = Object.prototype.hasOwnProperty.call(pinnedData, nodeId);

  const close = () => setContextMenu(null);
  const runNode = (mode: 'single_node' | 'to_node' | 'from_node') => {
    selectNode(nodeId);
    setBottomPanelsOpen(true);
    close();
    void runExecution(mode, nodeId);
  };

  const pinOutput = () => {
    const ok = pinNodeOutput(nodeId);
    if (!ok) alert('Run this node before pinning its output.');
    close();
  };

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
        label={actionCount > 1 ? `Duplicate ${actionCount} nodes` : 'Duplicate'}
        shortcut="Ctrl+D"
        onClick={() => { duplicateNodes(actionNodeIds); setContextMenu(null); }}
      />
      <MenuItem
        label={actionCount > 1 ? `Copy ${actionCount} nodes` : 'Copy'}
        shortcut="Ctrl+C"
        onClick={() => { copyNodes(actionNodeIds); setContextMenu(null); }}
      />
      <MenuItem
        label="Paste"
        shortcut="Ctrl+V"
        disabled={!hasCopiedNodes}
        onClick={() => { pasteNodes(); setContextMenu(null); }}
      />
      <MenuItem
        label="Rename"
        onClick={() => { selectNode(nodeId); setContextMenu(null); }}
      />
      <MenuItem
        label={actionCount > 1
          ? `${isDisabled ? 'Enable' : 'Disable'} ${actionCount} nodes`
          : isDisabled ? 'Enable node' : 'Disable node'}
        onClick={() => { toggleNodesDisabled(actionNodeIds); close(); }}
      />
      <div style={{ height: '1px', background: '#2A2A2A', margin: '3px 0' }} />
      <MenuItem
        label="Run node"
        onClick={() => runNode('single_node')}
      />
      <MenuItem
        label="Run to here"
        onClick={() => runNode('to_node')}
      />
      <MenuItem
        label="Run from here"
        onClick={() => runNode('from_node')}
      />
      <MenuItem
        label="View data"
        onClick={() => { selectNode(nodeId); setBottomPanelsOpen(true); close(); }}
      />
      <div style={{ height: '1px', background: '#2A2A2A', margin: '3px 0' }} />
      <MenuItem
        label={hasPinnedData ? 'Update pinned output' : 'Pin last output'}
        onClick={pinOutput}
      />
      {hasPinnedData && (
        <MenuItem
          label="Clear pinned output"
          onClick={() => { clearPinnedDataForNode(nodeId); close(); }}
        />
      )}
      <div style={{ height: '1px', background: '#2A2A2A', margin: '3px 0' }} />
      <MenuItem
        label={actionCount > 1 ? `Delete ${actionCount} nodes` : 'Delete'}
        shortcut="Del"
        danger
        onClick={() => deleteNodes(actionNodeIds)}
      />
    </div>
  );
}

function MenuItem({
  label,
  shortcut,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => {
        if (!disabled) onClick();
      }}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        background: 'transparent',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? '#666666' : danger ? '#EF4444' : '#FFFFFF',
        fontFamily: 'inherit',
        fontSize: 'inherit',
        textAlign: 'left',
        transition: 'background 0.08s ease',
      }}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLElement).style.background = '#252525'; }}
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
