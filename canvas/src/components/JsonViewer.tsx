import { useState } from 'react';

function syntaxHighlight(json: string): string {
  const safe = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return safe.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let color: string;
      if (/^"/.test(match)) {
        color = /:$/.test(match) ? '#E2E8F0' : '#86EFAC'; // key=white, string=green
      } else if (/true|false/.test(match)) {
        color = '#FCA5A5'; // boolean=red
      } else if (/null/.test(match)) {
        color = '#9CA3AF'; // null=gray
      } else {
        color = '#93C5FD'; // number=blue
      }
      return `<span style="color:${color}">${match}</span>`;
    }
  );
}

export function JsonViewer({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(true);
  const json = JSON.stringify(data, null, 2);

  return (
    <div>
      <button
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
          fontFamily: 'Geist, sans-serif',
          fontSize: '10px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        <span style={{ fontSize: '7px', opacity: 0.6 }}>{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && (
        <pre
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
