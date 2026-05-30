import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api } from '../api';

type InspectorTab = 'json' | 'binary' | 'table' | 'schema';

type DataInspectorProps = {
  label: string;
  data: unknown;
  defaultOpen?: boolean;
  defaultTab?: InspectorTab;
  maxHeight?: number;
  /** When provided, schema rows become draggable and set this expression on drag */
  makeExpr?: (path: string) => string;
};

const shellStyle: CSSProperties = {
  border: '1px solid var(--border-input)',
  borderRadius: '6px',
  background: 'var(--bg-canvas)',
  overflow: 'hidden',
};

const smallButtonStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: '4px',
  background: 'var(--bg-input)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'Geist Mono',
  fontSize: '9.5px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  padding: '4px 7px',
  textTransform: 'uppercase',
};

type BinaryRef = {
  id: string;
  fileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  metadata?: unknown;
  createdAt?: string | null;
};

type BinaryHit = BinaryRef & {
  path: string;
  property: string;
};

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function stringifyCell(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isBinaryRef(value: unknown): value is BinaryRef {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (
      'fileName' in value
      || 'mimeType' in value
      || 'sizeBytes' in value
      || 'metadata' in value
      || 'createdAt' in value
    );
}

function collectBinaryRefs(data: unknown): BinaryHit[] {
  const hits: BinaryHit[] = [];
  const seenObjects = new Set<object>();
  const seenRefs = new Set<string>();

  const visit = (value: unknown, path: string[], depth: number) => {
    if (depth > 7 || value == null || typeof value !== 'object') return;
    if (seenObjects.has(value)) return;
    seenObjects.add(value);

    if (isBinaryRef(value)) {
      const refPath = path.join('.');
      const key = `${value.id}:${refPath}`;
      if (!seenRefs.has(key)) {
        seenRefs.add(key);
        hits.push({
          ...value,
          path: refPath || '$',
          property: path[path.length - 1] ?? 'binary',
        });
      }
    }

    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item, index) => visit(item, [...path, `[${index}]`], depth + 1));
      return;
    }

    Object.entries(value as Record<string, unknown>)
      .slice(0, 120)
      .forEach(([key, child]) => visit(child, [...path, key], depth + 1));
  };

  visit(data, [], 0);
  return hits;
}

function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return 'unknown';
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

function binaryKind(mimeType: string | null | undefined) {
  const mime = String(mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('text/') || mime.includes('json') || mime.includes('xml') || mime.includes('csv')) return 'text';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('zip') || mime.includes('compressed')) return 'archive';
  return 'file';
}

function metaValue(value: unknown) {
  if (value == null || value === '') return 'unknown';
  return String(value);
}

function normalizeRows(data: unknown): Array<Record<string, unknown>> {
  const source = data && typeof data === 'object'
    ? (Array.isArray((data as { rows?: unknown }).rows) ? (data as { rows: unknown[] }).rows
      : Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items
        : Array.isArray((data as { files?: unknown }).files) ? (data as { files: unknown[] }).files
          : Array.isArray((data as { objects?: unknown }).objects) ? (data as { objects: unknown[] }).objects
            : Array.isArray((data as { binaries?: unknown }).binaries) ? (data as { binaries: unknown[] }).binaries
              : data)
    : data;

  if (Array.isArray(source)) {
    return source.map((item, index) => {
      const value = item && typeof item === 'object' && 'json' in item
        ? (item as { json?: unknown }).json
        : item;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return { index, ...(value as Record<string, unknown>) };
      }
      return { index, value };
    });
  }

  if (source && typeof source === 'object') {
    return Object.entries(source as Record<string, unknown>).map(([key, value]) => ({
      key,
      type: typeOf(value),
      value,
    }));
  }

  return [{ value: source }];
}

function schemaRows(data: unknown, prefix = ''): Array<{ path: string; type: string; sample: string }> {
  if (data == null || typeof data !== 'object') {
    return [{ path: prefix || '$', type: typeOf(data), sample: stringifyCell(data).slice(0, 80) }];
  }

  if (Array.isArray(data)) {
    const first = data[0];
    return [
      { path: prefix || '$', type: `array(${data.length})`, sample: data.length ? typeOf(first) : 'empty' },
      ...schemaRows(first, `${prefix || '$'}[0]`).slice(0, 80),
    ];
  }

  const entries = Object.entries(data as Record<string, unknown>);
  if (!entries.length) return [{ path: prefix || '$', type: 'object', sample: 'empty' }];

  return entries.flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    const current = { path, type: typeOf(value), sample: stringifyCell(value).slice(0, 80) };
    if (value && typeof value === 'object') return [current, ...schemaRows(value, path).slice(0, 30)];
    return [current];
  }).slice(0, 120);
}

function TableView({ rows, maxHeight }: { rows: Array<Record<string, unknown>>; maxHeight: number }) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))].slice(0, 12);
  if (!rows.length) {
    return <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No rows.</div>;
  }

  return (
    <div style={{ maxHeight, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} style={{
                position: 'sticky',
                top: 0,
                background: 'var(--bg-input)',
                borderBottom: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontFamily: 'Geist Mono',
                fontSize: '9.5px',
                letterSpacing: '0.06em',
                padding: '7px 8px',
                textAlign: 'left',
                textTransform: 'uppercase',
              }}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 100).map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column} style={{
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  fontFamily: 'Geist Mono',
                  fontSize: '10.5px',
                  lineHeight: 1.5,
                  padding: '7px 8px',
                  verticalAlign: 'top',
                  wordBreak: 'break-word',
                }}>
                  {stringifyCell(row[column]).slice(0, 240)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SchemaView({
  rows,
  maxHeight,
  makeExpr,
}: {
  rows: Array<{ path: string; type: string; sample: string }>;
  maxHeight: number;
  makeExpr?: (path: string) => string;
}) {
  return (
    <div style={{ maxHeight, overflow: 'auto' }}>
      {rows.map((row) => {
        const expr = makeExpr ? makeExpr(row.path) : null;
        return (
          <div
            key={`${row.path}-${row.type}`}
            className={makeExpr ? 'otto-schema-draggable' : undefined}
            draggable={makeExpr ? true : undefined}
            onDragStart={makeExpr ? (e) => {
              e.dataTransfer.effectAllowed = 'copy';
              e.dataTransfer.setData('text/plain', expr!);
              e.dataTransfer.setData('application/otto-expression', expr!);
            } : undefined}
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(88px, 1fr) 70px minmax(70px, 1fr)',
              gap: '8px',
              borderBottom: '1px solid var(--border)',
              padding: '6px 8px',
              alignItems: 'center',
              borderRadius: '3px',
              transition: 'background 0.08s',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
              {makeExpr && (
                <span className="otto-drag-hint" style={{
                  opacity: 0,
                  transition: 'opacity 0.1s',
                  color: 'var(--accent)',
                  fontSize: '8px',
                  flexShrink: 0,
                }}>
                  ⠿
                </span>
              )}
              <button
                type="button"
                onClick={() => copyText(row.path)}
                title={makeExpr ? `Drag to field or click to copy: ${expr}` : 'Copy path'}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: makeExpr ? 'grab' : 'copy',
                  fontFamily: 'Geist Mono',
                  fontSize: '10.5px',
                  overflow: 'hidden',
                  padding: 0,
                  textAlign: 'left',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}
              >
                {row.path}
              </button>
            </div>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'Geist Mono', fontSize: '10px' }}>{row.type}</span>
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'Geist Mono', fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.sample}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function BinaryView({ refs, maxHeight }: { refs: BinaryHit[]; maxHeight: number }) {
  if (!refs.length) {
    return <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No binary data.</div>;
  }

  return (
    <div style={{
      maxHeight,
      overflow: 'auto',
      padding: '9px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
      gap: '8px',
    }}>
      {refs.map((ref) => {
        const downloadUrl = api.binaryDownloadUrl(ref.id);
        const kind = binaryKind(ref.mimeType);
        const isImage = kind === 'image';
        return (
          <div key={`${ref.id}-${ref.path}`} style={{
            border: '1px solid var(--border)',
            borderRadius: '6px',
            background: 'var(--bg-input)',
            overflow: 'hidden',
            minWidth: 0,
          }}>
            {isImage && (
              <div style={{
                height: 118,
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-canvas)',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
              }}>
                <img
                  src={downloadUrl}
                  alt={ref.fileName ?? ref.property}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  loading="lazy"
                />
              </div>
            )}
            <div style={{ padding: '9px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  color: 'var(--accent)',
                  fontFamily: 'Geist Mono',
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '2px 5px',
                  textTransform: 'uppercase',
                }}>
                  {kind}
                </span>
                <button
                  type="button"
                  onClick={() => copyText(ref.path)}
                  title="Copy binary path"
                  style={{
                    minWidth: 0,
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    cursor: 'copy',
                    fontFamily: 'Geist Mono',
                    fontSize: '10.5px',
                    overflow: 'hidden',
                    padding: 0,
                    textAlign: 'left',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ref.path}
                </button>
              </div>

              <div style={{
                color: 'var(--text-primary)',
                fontFamily: "'Inter'",
                fontSize: '12px',
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {ref.fileName || ref.id}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '58px minmax(0, 1fr)',
                columnGap: '8px',
                rowGap: '4px',
                color: 'var(--text-secondary)',
                fontFamily: 'Geist Mono',
                fontSize: '10px',
                lineHeight: 1.4,
              }}>
                <span style={{ color: 'var(--text-muted)' }}>ID</span>
                <button
                  type="button"
                  onClick={() => copyText(ref.id)}
                  title="Copy binary ID"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    cursor: 'copy',
                    fontFamily: 'Geist Mono',
                    fontSize: '10px',
                    overflow: 'hidden',
                    padding: 0,
                    textAlign: 'left',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {ref.id}
                </button>
                <span style={{ color: 'var(--text-muted)' }}>MIME</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metaValue(ref.mimeType)}</span>
                <span style={{ color: 'var(--text-muted)' }}>Size</span>
                <span>{formatBytes(ref.sizeBytes)}</span>
                <span style={{ color: 'var(--text-muted)' }}>Created</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{metaValue(ref.createdAt)}</span>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <a href={downloadUrl} download={ref.fileName ?? undefined} style={{ ...smallButtonStyle, textDecoration: 'none' }}>
                  Download
                </a>
                <button type="button" style={smallButtonStyle} onClick={() => copyText(downloadUrl)}>
                  Copy URL
                </button>
                {ref.metadata != null && Object.keys(isRecord(ref.metadata) ? ref.metadata : {}).length > 0 && (
                  <button type="button" style={smallButtonStyle} onClick={() => copyText(JSON.stringify(ref.metadata, null, 2))}>
                    Metadata
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DataInspector({
  label,
  data,
  defaultOpen = true,
  defaultTab = 'json',
  maxHeight = 240,
  makeExpr,
}: DataInspectorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<InspectorTab>(defaultTab);
  const json = useMemo(() => JSON.stringify(data ?? null, null, 2), [data]);
  const rows = useMemo(() => normalizeRows(data), [data]);
  const schema = useMemo(() => schemaRows(data), [data]);
  const binaryRefs = useMemo(() => collectBinaryRefs(data), [data]);
  const tabs = useMemo<InspectorTab[]>(
    () => binaryRefs.length ? ['json', 'binary', 'table', 'schema'] : ['json', 'table', 'schema'],
    [binaryRefs.length]
  );

  useEffect(() => {
    if (!tabs.includes(tab)) setTab('json');
  }, [tab, tabs]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flex: 1,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontFamily: 'Geist Mono',
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textAlign: 'left',
            textTransform: 'uppercase',
          }}
        >
          <span style={{ fontSize: '7px', opacity: 0.6 }}>{open ? 'v' : '>'}</span>
          {label}
        </button>
        <button type="button" style={smallButtonStyle} onClick={() => copyText(json)}>Copy</button>
      </div>

      {open && (
        <div style={shellStyle}>
          <div style={{ display: 'flex', gap: '4px', padding: '6px', borderBottom: '1px solid var(--border)' }}>
            {tabs.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setTab(item)}
                style={{
                  ...smallButtonStyle,
                  background: tab === item ? 'var(--bg-hover)' : 'transparent',
                  color: tab === item ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {item === 'binary' ? `binary ${binaryRefs.length}` : item}
              </button>
            ))}
          </div>

          {tab === 'json' && (
            <pre style={{
              margin: 0,
              maxHeight,
              overflow: 'auto',
              padding: '10px',
              color: 'var(--text-primary)',
              fontFamily: 'Geist Mono',
              fontSize: '11px',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {json}
            </pre>
          )}
          {tab === 'binary' && <BinaryView refs={binaryRefs} maxHeight={maxHeight} />}
          {tab === 'table' && <TableView rows={rows} maxHeight={maxHeight} />}
          {tab === 'schema' && <SchemaView rows={schema} maxHeight={maxHeight} makeExpr={makeExpr} />}
        </div>
      )}
    </div>
  );
}
