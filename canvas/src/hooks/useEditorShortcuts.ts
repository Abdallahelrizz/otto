import { useEffect, useCallback, useState } from 'react';
import { useStore } from '../store';

function isEditingField(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if ((target as HTMLElement).isContentEditable) return true;
  if (target.closest('[contenteditable]')) return true;
  // Monaco editor renders its cursor layer as divs — none of the above match.
  // Block all shortcuts when the event originates from within any Monaco instance.
  if (target.closest('.monaco-editor')) return true;
  return false;
}

export function useEditorShortcuts(shortcutRefOpen: boolean, setShortcutRefOpen: (v: boolean) => void) {
  const toggleSidebar   = useStore((s) => s.toggleSidebar);
  const toggleOttobot   = useStore((s) => s.toggleOttobot);
  const toggleLogs      = useStore((s) => s.toggleLogs);
  const selectedNodeId  = useStore((s) => s.selectedNodeId);
  const nodes           = useStore((s) => s.nodes);
  const deleteNodes     = useStore((s) => s.deleteNodes);
  const duplicateNodes  = useStore((s) => s.duplicateNodes);
  const saveWorkflow    = useStore((s) => s.saveWorkflow);
  const saveStatus      = useStore((s) => s.saveStatus);
  const setBottomPanelsOpen = useStore((s) => s.setBottomPanelsOpen);
  const selectNode      = useStore((s) => s.selectNode);
  const fitViewCallback = useStore((s) => s.fitViewCallback);

  const handler = useCallback((e: KeyboardEvent) => {
    if (isEditingField(e.target)) return;

    const ctrl = e.ctrlKey || e.metaKey;

    // ── Ctrl/Cmd combos ──────────────────────────────────────────
    if (ctrl) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          toggleSidebar();
          return;

        case 's':
          e.preventDefault();
          if (saveStatus === 'pending' || saveStatus === 'error') void saveWorkflow().catch(() => {});
          return;

        case 'd':
          e.preventDefault();
          duplicateNodes();
          return;

        case 'f':
          if (e.shiftKey) {
            e.preventDefault();
            fitViewCallback?.();
          }
          return;
      }
      return;
    }

    // ── Escape ───────────────────────────────────────────────────
    if (e.key === 'Escape') {
      if (shortcutRefOpen) { setShortcutRefOpen(false); return; }
      if (selectedNodeId) { selectNode(null); return; }
      return;
    }

    // ── Single-key shortcuts ─────────────────────────────────────
    switch (e.key) {
      case 'o':
      case 'O':
        e.preventDefault();
        toggleOttobot();
        break;

      case 'l':
      case 'L':
        e.preventDefault();
        toggleLogs();
        break;

      case 'Enter':
      case ' ':
        if (selectedNodeId) {
          e.preventDefault();
          setBottomPanelsOpen(true);
        }
        break;

      case 'Delete':
      case 'Backspace':
        if (selectedNodeId) {
          e.preventDefault();
          deleteNodes();
        }
        break;

      case '?':
        e.preventDefault();
        setShortcutRefOpen(!shortcutRefOpen);
        break;
    }
  }, [
    toggleSidebar, toggleOttobot, toggleLogs,
    selectedNodeId, nodes, deleteNodes, duplicateNodes,
    saveWorkflow, saveStatus,
    setBottomPanelsOpen, selectNode, fitViewCallback,
    shortcutRefOpen, setShortcutRefOpen,
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}

// ── Shortcut reference data ───────────────────────────────────────
export const SHORTCUT_GROUPS: Array<{
  label: string;
  items: Array<{ key: string; description: string }>;
}> = [
  {
    label: 'Canvas',
    items: [
      { key: '⌃S', description: 'Save' },
      { key: '⌃B', description: 'Toggle sidebar' },
      { key: '⌃⇧F', description: 'Fit view' },
      { key: 'O', description: 'Toggle OttoBot' },
      { key: 'L', description: 'Toggle Logs — when both open, drag the divider to resize' },
      { key: '?', description: 'Keyboard shortcuts' },
    ],
  },
  {
    label: 'Nodes',
    items: [
      { key: 'Enter', description: 'Focus node — open the data panel' },
      { key: 'Esc', description: 'Deselect node' },
      { key: '⌃D', description: 'Duplicate selected' },
      { key: 'Del', description: 'Delete selected' },
      { key: '⌃C', description: 'Copy' },
      { key: '⌃V', description: 'Paste' },
    ],
  },
];
