import { useRef, useCallback, useEffect } from 'react';
import { OttoBotPanel } from './OttoBotPanel';
import { ExecutionPanel } from './ExecutionPanel';
import { useStore } from '../../store';

const MIN_HEIGHT = 160;
const MAX_HEIGHT_RATIO = 0.72;
const MIN_SPLIT = 0.2;
const MAX_SPLIT = 0.8;

function CloseBtn({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        position: 'absolute',
        top: 6,
        right: 6,
        width: 22,
        height: 22,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        borderRadius: '5px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        fontSize: '16px',
        lineHeight: 1,
        fontFamily: 'Geist, system-ui, sans-serif',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
        (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'transparent';
        (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
      }}
    >
      ×
    </button>
  );
}

export function BottomPanels() {
  const ottobotOpen = useStore((s) => s.ottobotOpen);
  const logsOpen    = useStore((s) => s.logsOpen);
  const toggleOttobot = useStore((s) => s.toggleOttobot);
  const toggleLogs    = useStore((s) => s.toggleLogs);
  const dockHeight    = useStore((s) => s.dockHeight);
  const setDockHeight = useStore((s) => s.setDockHeight);
  const dockSplit     = useStore((s) => s.dockSplit);
  const setDockSplit  = useStore((s) => s.setDockSplit);

  const bothOpen = ottobotOpen && logsOpen;

  // ── Height drag (top edge) ─────────────────────────────────────
  const heightDrag = useRef<{ startY: number; startH: number } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => {
    // Closing the dock during a drag previously left window listeners alive indefinitely.
    dragCleanupRef.current?.();
  }, []);

  const onHeightDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    heightDrag.current = { startY: e.clientY, startH: dockHeight };

    const onMove = (ev: PointerEvent) => {
      if (!heightDrag.current) return;
      const delta = heightDrag.current.startY - ev.clientY; // up = taller
      const maxH = Math.floor(window.innerHeight * MAX_HEIGHT_RATIO);
      const newH = Math.round(Math.max(MIN_HEIGHT, Math.min(maxH, heightDrag.current.startH + delta)));
      setDockHeight(newH);
    };
    const onUp = () => {
      heightDrag.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragCleanupRef.current = null;
    };
    dragCleanupRef.current?.();
    dragCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [dockHeight, setDockHeight]);

  // ── Split drag (vertical divider) ─────────────────────────────
  const splitDrag = useRef<{ startX: number; startSplit: number; w: number } | null>(null);

  const onSplitDragStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const container = (e.currentTarget as HTMLElement).parentElement;
    const w = container?.offsetWidth ?? 800;
    splitDrag.current = { startX: e.clientX, startSplit: dockSplit, w };

    const onMove = (ev: PointerEvent) => {
      if (!splitDrag.current) return;
      const delta = ev.clientX - splitDrag.current.startX;
      const newSplit = Math.max(MIN_SPLIT, Math.min(MAX_SPLIT,
        splitDrag.current.startSplit + delta / splitDrag.current.w
      ));
      setDockSplit(newSplit);
    };
    const onUp = () => {
      splitDrag.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dragCleanupRef.current = null;
    };
    dragCleanupRef.current?.();
    dragCleanupRef.current = onUp;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [dockSplit, setDockSplit]);

  if (!ottobotOpen && !logsOpen) return null;

  return (
    <div style={{
      height: dockHeight,
      borderTop: '1px solid var(--border)',
      flexShrink: 0,
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-panel)',
      userSelect: 'none',
    }}>
      {/* ── Top drag handle (resize height) ── */}
      <div
        onPointerDown={onHeightDragStart}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          cursor: 'ns-resize',
          zIndex: 30,
        }}
      />

      {/* ── Panel row ── */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

        {/* OttoBot */}
        {ottobotOpen && (
          <div style={{
            flex: bothOpen ? dockSplit : 1,
            minWidth: 0,
            overflow: 'hidden',
            position: 'relative',
            borderRight: bothOpen ? '1px solid var(--border)' : undefined,
          }}>
            <OttoBotPanel />
            <CloseBtn onClick={toggleOttobot} title="Close OttoBot  O" />
          </div>
        )}

        {/* Vertical split drag handle */}
        {bothOpen && (
          <div
            onPointerDown={onSplitDragStart}
            style={{
              width: 5,
              flexShrink: 0,
              cursor: 'ew-resize',
              background: 'var(--border)',
              transition: 'background 0.1s',
              zIndex: 10,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-dim)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)'; }}
          />
        )}

        {/* Logs / Execution */}
        {logsOpen && (
          <div style={{
            flex: bothOpen ? (1 - dockSplit) : 1,
            minWidth: 0,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <ExecutionPanel />
            <CloseBtn onClick={toggleLogs} title="Close Logs  L" />
          </div>
        )}
      </div>
    </div>
  );
}
