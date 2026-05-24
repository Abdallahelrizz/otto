import { OttoBotPanel } from './OttoBotPanel';
import { ExecutionPanel } from './ExecutionPanel';
import { useStore } from '../../store';

export function BottomPanels() {
  const bottomPanelsOpen = useStore((s) => s.bottomPanelsOpen);
  const setBottomPanelsOpen = useStore((s) => s.setBottomPanelsOpen);

  if (!bottomPanelsOpen) {
    return (
      <div style={{
        borderTop: '1px solid var(--border)',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        flexShrink: 0,
        background: 'var(--bg-panel)',
        gap: '8px',
      }}>
        <button
          onClick={() => setBottomPanelsOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: "'Inter'",
            padding: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
          Show panels
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      height: 248,
      borderTop: '1px solid var(--border)',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* Collapse button */}
      <button
        onClick={() => setBottomPanelsOpen(false)}
        title="Collapse panels"
        style={{
          position: 'absolute',
          top: '6px',
          right: '6px',
          width: 20,
          height: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          borderRadius: '4px',
          zIndex: 10,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      <OttoBotPanel />
      <ExecutionPanel />
    </div>
  );
}
