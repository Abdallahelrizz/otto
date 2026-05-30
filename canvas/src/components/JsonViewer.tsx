import { useState } from 'react';

function syntaxHighlight(json: string): string {
  const safe = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return safe.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls: string;
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'syntax-key' : 'syntax-string';
      } else if (/true|false/.test(match)) {
        cls = 'syntax-bool';
      } else if (/null/.test(match)) {
        cls = 'syntax-null';
      } else {
        cls = 'syntax-number';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

export function JsonViewer({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(true);
  const json = JSON.stringify(data, null, 2);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '0 0 6px 0',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontFamily: 'Geist, system-ui, sans-serif',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          fill="currentColor"
          style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', opacity: 0.5 }}
        >
          <polygon points="0,0 8,4 0,8" />
        </svg>
        {label}
      </button>
      {open && (
        <pre
          className="otto-json-viewer"
          style={{
            margin: 0,
            padding: '10px',
            fontSize: '11px',
            lineHeight: 1.7,
            background: 'var(--bg-canvas)',
            border: '1px solid var(--border-input)',
            borderRadius: '6px',
            overflowY: 'auto',
            maxHeight: '180px',
            fontFamily: 'Geist Mono, monospace',
            color: 'var(--text-secondary)',
          }}
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }}
        />
      )}
    </div>
  );
}
