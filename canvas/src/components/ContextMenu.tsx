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
  const setNdvNodeId = useStore((s) => s.setNdvNodeId);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;

    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

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

  const x = Math.max(8, Math.min(contextMenu.x, window.innerWidth - 200));
  const y = Math.max(8, Math.min(contextMenu.y, window.innerHeight - 420));
  const { nodeId } = contextMenu;
  const selectedNodeIds = nodes.filter((n) => n.selected).map((n) => n.id);
  const actionNodeIds = selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId];
  const actionCount = actionNodeIds.length;
  const actionNodes = nodes.filter((n) => actionNodeIds.includes(n.id));
  const isDisabled = actionNodes.length > 0 && actionNodes.every((n) => Boolean(n.data.disabled));
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
    if (!ok) {
      // Non-blocking notification instead of alert
      console.warn('[otto] Run this node before pinning its output.');
    }
    close();
  };

  const openNDV = () => {
    selectNode(nodeId);
    if (setNdvNodeId) setNdvNodeId(nodeId);
    close();
  };

  return (
    <div
      ref={ref}
      className="otto-context-menu"
      style={{ position: 'fixed', left: x, top: y, zIndex: 9999, minWidth: '180px' }}
    >
      <div style={{ padding: '4px' }}>
        <MenuItem label="Open in editor" onClick={openNDV} />
        <div className="otto-menu-divider" />
        <MenuItem
          label={actionCount > 1 ? `Duplicate ${actionCount} nodes` : 'Duplicate'}
          shortcut="⌃D"
          onClick={() => { duplicateNodes(actionNodeIds); close(); }}
        />
        <MenuItem
          label={actionCount > 1 ? `Copy ${actionCount} nodes` : 'Copy'}
          shortcut="⌃C"
          onClick={() => { copyNodes(actionNodeIds); close(); }}
        />
        <MenuItem
          label="Paste"
          shortcut="⌃V"
          disabled={!hasCopiedNodes}
          onClick={() => { pasteNodes(); close(); }}
        />
        <MenuItem
          label="Rename"
          onClick={() => { selectNode(nodeId); close(); }}
        />
        <MenuItem
          label={actionCount > 1
            ? `${isDisabled ? 'Enable' : 'Disable'} ${actionCount} nodes`
            : isDisabled ? 'Enable node' : 'Disable node'}
          onClick={() => { toggleNodesDisabled(actionNodeIds); close(); }}
        />
        <div className="otto-menu-divider" />
        <MenuItem label="Run node" onClick={() => runNode('single_node')} />
        <MenuItem label="Run to here" onClick={() => runNode('to_node')} />
        <MenuItem label="Run from here" onClick={() => runNode('from_node')} />
        <div className="otto-menu-divider" />
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
        <div className="otto-menu-divider" />
        <MenuItem
          label={actionCount > 1 ? `Delete ${actionCount} nodes` : 'Delete'}
          shortcut="Del"
          danger
          onClick={() => deleteNodes(actionNodeIds)}
        />
      </div>
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
      type="button"
      disabled={disabled}
      onClick={() => { if (!disabled) onClick(); }}
      className={`otto-menu-item${danger ? ' danger' : ''}`}
    >
      <span>{label}</span>
      {shortcut && <span className="otto-menu-shortcut">{shortcut}</span>}
    </button>
  );
}
