import { SHORTCUT_GROUPS } from '../hooks/useEditorShortcuts';

export function ShortcutReference({ onClose }: { onClose: () => void }) {
  return (
    <div className="otto-shortcut-overlay" onClick={onClose}>
      <div
        className="otto-shortcut-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
          <h2 style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            fontFamily: 'Geist, system-ui, sans-serif',
            letterSpacing: '-0.018em',
          }}>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '5px',
              display: 'flex',
              alignItems: 'center',
              fontSize: '18px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <p style={{
          margin: '0 0 16px',
          fontSize: '12px',
          color: 'var(--text-muted)',
          fontFamily: 'Geist, system-ui, sans-serif',
        }}>
          Shortcuts are disabled while typing in a field.
        </p>

        <div className="otto-shortcut-grid">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <div style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: '8px',
                fontFamily: 'Geist, system-ui, sans-serif',
              }}>
                {group.label}
              </div>
              {group.items.map((item) => (
                <div key={item.key} className="otto-shortcut-row">
                  <span className="otto-shortcut-label">{item.description}</span>
                  <span className="otto-shortcut-key">{item.key}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
