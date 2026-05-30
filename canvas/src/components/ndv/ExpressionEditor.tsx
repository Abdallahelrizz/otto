import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type TextareaHTMLAttributes,
  type InputHTMLAttributes,
} from 'react';
import { api } from '../../api';
import { useStore } from '../../store';

const UI_FONT = 'Geist, system-ui, sans-serif';
const MONO_FONT = 'Geist Mono, monospace';

const EXPR_RE = /\{\{[\s\S]*?\}\}/;

function isExpression(value: string): boolean {
  return EXPR_RE.test(value);
}

// Debounce helper
function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// Autocomplete suggestions from the expression context
const STATIC_SUGGESTIONS: Array<{ label: string; detail: string; insert: string }> = [
  { label: '$json',        detail: 'Current item JSON',          insert: '$json.' },
  { label: '$input.item',  detail: 'First input item',           insert: '$input.item.json.' },
  { label: '$input.all()', detail: 'All input items',            insert: '$input.all()' },
  { label: '$now',         detail: 'Current date/time',          insert: '$now' },
  { label: '$today',       detail: 'Start of today',             insert: '$today' },
  { label: '$vars',        detail: 'Workspace variables',        insert: '$vars.' },
  { label: '$string()',    detail: 'Convert to string',          insert: '$string()' },
  { label: '$number()',    detail: 'Convert to number',          insert: '$number()' },
  { label: '$boolean()',   detail: 'Convert to boolean',         insert: '$boolean()' },
  { label: '$if()',        detail: 'Conditional expression',     insert: '$if(condition, whenTrue, whenFalse)' },
  { label: '$lowercase()', detail: 'Lowercase string',           insert: '$lowercase()' },
  { label: '$uppercase()', detail: 'Uppercase string',           insert: '$uppercase()' },
  { label: '$trim()',      detail: 'Trim whitespace',            insert: '$trim()' },
  { label: '$length()',    detail: 'Length of array/string',     insert: '$length()' },
  { label: '$keys()',      detail: 'Object keys',                insert: '$keys()' },
  { label: '$pick()',      detail: 'Pick object fields',         insert: '$pick(obj, keys)' },
];

// ── Expression preview chip ────────────────────────────────────────────────
function PreviewChip({
  value,
  executionId,
  nodeId,
}: {
  value: string;
  executionId: string | null | undefined;
  nodeId: string | null | undefined;
}) {
  const debouncedValue = useDebounce(value, 300);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string>('');
  const [previewError, setPreviewError] = useState(false);

  useEffect(() => {
    if (!isExpression(debouncedValue) || !debouncedValue.trim()) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    api
      .expressionPreview(debouncedValue, { executionId, nodeId })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setPreview(res.result ?? '');
          setPreviewType(res.resolvedType ?? '');
          setPreviewError(false);
        } else {
          setPreview(res.error ?? null);
          setPreviewError(true);
        }
      })
      .catch(() => {
        if (!cancelled) { setPreview(null); }
      });

    return () => { cancelled = true; };
  }, [debouncedValue, executionId, nodeId]);

  if (preview === null) {
    if (!isExpression(value)) return null;
    if (!executionId) {
      return (
        <div style={{
          fontFamily: UI_FONT,
          fontSize: '11px',
          color: 'var(--text-muted)',
          marginTop: '4px',
          padding: '3px 8px',
          background: 'var(--bg-hover)',
          borderRadius: '5px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
        }}>
          <span style={{ opacity: 0.6 }}>⤳</span>
          <span>Run the node to see a resolved preview</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div style={{
      fontFamily: MONO_FONT,
      fontSize: '11px',
      color: previewError ? 'var(--node-error)' : 'var(--node-success)',
      marginTop: '4px',
      padding: '3px 9px',
      background: previewError
        ? 'color-mix(in srgb, var(--node-error) 8%, transparent)'
        : 'color-mix(in srgb, var(--node-success) 8%, transparent)',
      border: `1px solid ${previewError
        ? 'color-mix(in srgb, var(--node-error) 22%, transparent)'
        : 'color-mix(in srgb, var(--node-success) 22%, transparent)'}`,
      borderRadius: '5px',
      display: 'inline-flex',
      alignItems: 'flex-start',
      gap: '5px',
      maxWidth: '100%',
      overflow: 'hidden',
      wordBreak: 'break-all',
    }}>
      <span style={{ opacity: 0.5, flexShrink: 0 }}>{previewError ? '✕' : '⤳'}</span>
      <span style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {preview}
        {previewType && !previewError && (
          <span style={{ marginLeft: '6px', opacity: 0.5, fontSize: '10px' }}>{previewType}</span>
        )}
      </span>
    </div>
  );
}

// ── Suggestion dropdown ────────────────────────────────────────────────────
function SuggestionDropdown({
  query,
  onSelect,
  inputSchema,
}: {
  query: string;
  onSelect: (insert: string) => void;
  inputSchema?: Array<{ path: string; type: string }>;
}) {
  const q = query.toLowerCase();

  const schemaSuggestions = (inputSchema ?? []).map((s) => ({
    label: `$json.${s.path}`,
    detail: s.type,
    insert: `$json.${s.path}`,
  }));

  const all = [...schemaSuggestions, ...STATIC_SUGGESTIONS];
  const filtered = q
    ? all.filter((s) => s.label.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q))
    : all;

  if (!filtered.length) return null;

  return (
    <div style={{
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      zIndex: 1000,
      marginTop: '2px',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-input)',
      borderRadius: '8px',
      boxShadow: 'var(--shadow-main)',
      overflow: 'auto',
      maxHeight: '220px',
    }}>
      {filtered.slice(0, 12).map((s) => (
        <button
          key={s.insert}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); onSelect(s.insert); }}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 11px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.06s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <span style={{ fontFamily: MONO_FONT, fontSize: '11.5px', color: 'var(--accent)', fontWeight: 500 }}>
            {s.label}
          </span>
          <span style={{ fontFamily: UI_FONT, fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
            {s.detail}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Exported standalone preview chip (used by ConfigPanel) ───────────────
export { PreviewChip };

// ── Expression badge overlay ───────────────────────────────────────────────
function ExprBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      position: 'absolute',
      right: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      fontFamily: MONO_FONT,
      fontSize: '9px',
      fontWeight: 700,
      letterSpacing: '0.04em',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      background: active ? 'var(--accent-dim)' : 'var(--bg-hover)',
      border: `1px solid ${active ? 'var(--brand-ring)' : 'var(--border)'}`,
      borderRadius: '4px',
      padding: '2px 5px',
      pointerEvents: 'none',
      userSelect: 'none',
      lineHeight: 1.2,
      transition: 'color 0.15s, background 0.15s, border-color 0.15s',
    }}>
      ƒ(x)
    </span>
  );
}

// ── Main ExpressionInput ───────────────────────────────────────────────────
interface ExpressionFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  executionId?: string | null;
  nodeId?: string | null;
  inputSchema?: Array<{ path: string; type: string }>;
  style?: CSSProperties;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
}

export function ExpressionInput({
  value,
  onChange,
  placeholder,
  executionId,
  nodeId,
  inputSchema,
  style,
  inputProps,
}: ExpressionFieldProps) {
  const [focused, setFocused] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const storeExecId = useStore((s) => s.executionId);
  const storeNdvNodeId = useStore((s) => s.ndvNodeId);

  const resolvedExecutionId = executionId ?? storeExecId;
  const resolvedNodeId      = nodeId ?? storeNdvNodeId;

  const hasExpr = isExpression(value);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v);

    // Show autocomplete when typing inside {{ }} or typing $
    const cursor = e.target.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const match = before.match(/\{\{([^}]*)$|(\$[\w.]*)$/);
    if (match) {
      const q = (match[1] ?? match[2] ?? '').replace(/^\$/, '').replace(/^json\./, '');
      setAutocompleteQuery(q);
    } else {
      setAutocompleteQuery(null);
    }
  }, [onChange]);

  const handleSelectSuggestion = useCallback((insert: string) => {
    const el = inputRef.current;
    if (!el) { onChange(`{{ ${insert} }}`); return; }

    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after  = value.slice(cursor);

    // Replace the partial expression token before cursor
    const replaced = before.replace(/\{\{([^}]*)$/, `{{ ${insert}`) +
      (after.startsWith('}}') ? '' : ' }}') + (after.startsWith('}}') ? after : after);
    onChange(replaced);
    setAutocompleteQuery(null);

    requestAnimationFrame(() => {
      el.focus();
    });
  }, [value, onChange]);

  const fieldStyle: CSSProperties = {
    width: '100%',
    fontFamily: hasExpr ? MONO_FONT : UI_FONT,
    fontSize: hasExpr ? '12px' : '13px',
    background: 'var(--bg-input)',
    border: `1px solid ${hasExpr ? 'var(--accent)' : focused ? 'var(--accent)' : 'var(--border-input)'}`,
    borderRadius: '7px',
    padding: '7px 32px 7px 10px',
    color: 'var(--text-primary)',
    boxSizing: 'border-box' as const,
    outline: 'none',
    transition: 'border-color 0.15s',
    ...style,
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          {...inputProps}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTimeout(() => setAutocompleteQuery(null), 150); }}
          placeholder={placeholder}
          style={fieldStyle}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAutocompleteQuery(null);
            if (e.key === '{' && value.endsWith('{')) {
              setTimeout(() => setAutocompleteQuery(''), 0);
            }
          }}
        />
        <ExprBadge active={hasExpr} />

        {focused && autocompleteQuery !== null && (
          <SuggestionDropdown
            query={autocompleteQuery}
            onSelect={handleSelectSuggestion}
            inputSchema={inputSchema}
          />
        )}
      </div>
      <PreviewChip value={value} executionId={resolvedExecutionId} nodeId={resolvedNodeId} />
    </div>
  );
}

// ── ExpressionTextarea ─────────────────────────────────────────────────────
interface ExpressionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  executionId?: string | null;
  nodeId?: string | null;
  inputSchema?: Array<{ path: string; type: string }>;
  style?: CSSProperties;
  textareaProps?: TextareaHTMLAttributes<HTMLTextAreaElement>;
  rows?: number;
}

export function ExpressionTextarea({
  value,
  onChange,
  placeholder,
  executionId,
  nodeId,
  inputSchema,
  style,
  textareaProps,
  rows = 4,
}: ExpressionTextareaProps) {
  const [focused, setFocused] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const storeExecId = useStore((s) => s.executionId);
  const storeNdvNodeId = useStore((s) => s.ndvNodeId);

  const resolvedExecutionId = executionId ?? storeExecId;
  const resolvedNodeId      = nodeId ?? storeNdvNodeId;
  const hasExpr = isExpression(value);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    onChange(v);
    const cursor = e.target.selectionStart ?? v.length;
    const before = v.slice(0, cursor);
    const match = before.match(/\{\{([^}]*)$|(\$[\w.]*)$/);
    setAutocompleteQuery(match ? (match[1] ?? match[2] ?? '').replace(/^\$/, '') : null);
  }, [onChange]);

  const handleSelectSuggestion = useCallback((insert: string) => {
    const el = textareaRef.current;
    if (!el) { onChange(`{{ ${insert} }}`); return; }
    const cursor = el.selectionStart ?? value.length;
    const before = value.slice(0, cursor);
    const after  = value.slice(cursor);
    const replaced = before.replace(/\{\{([^}]*)$/, `{{ ${insert}`) +
      (after.startsWith('}}') ? '' : ' }}') + (after.startsWith('}}') ? after : after);
    onChange(replaced);
    setAutocompleteQuery(null);
    requestAnimationFrame(() => el.focus());
  }, [value, onChange]);

  const fieldStyle: CSSProperties = {
    width: '100%',
    fontFamily: hasExpr ? MONO_FONT : UI_FONT,
    fontSize: hasExpr ? '12px' : '13px',
    background: 'var(--bg-input)',
    border: `1px solid ${hasExpr ? 'var(--accent)' : focused ? 'var(--accent)' : 'var(--border-input)'}`,
    borderRadius: '7px',
    padding: '8px 10px',
    color: 'var(--text-primary)',
    boxSizing: 'border-box' as const,
    outline: 'none',
    resize: 'vertical',
    lineHeight: 1.55,
    minHeight: `${rows * 22 + 16}px`,
    transition: 'border-color 0.15s',
    ...style,
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <textarea
          ref={textareaRef}
          {...textareaProps}
          value={value}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTimeout(() => setAutocompleteQuery(null), 150); }}
          placeholder={placeholder}
          rows={rows}
          style={fieldStyle}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAutocompleteQuery(null);
          }}
        />
        {hasExpr && (
          <span style={{
            position: 'absolute',
            top: '7px',
            right: '8px',
            fontFamily: MONO_FONT,
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--accent)',
            background: 'var(--accent-dim)',
            border: '1px solid var(--brand-ring)',
            borderRadius: '4px',
            padding: '2px 5px',
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1.2,
          }}>
            ƒ(x)
          </span>
        )}
        {focused && autocompleteQuery !== null && (
          <SuggestionDropdown
            query={autocompleteQuery}
            onSelect={handleSelectSuggestion}
            inputSchema={inputSchema}
          />
        )}
      </div>
      <PreviewChip value={value} executionId={resolvedExecutionId} nodeId={resolvedNodeId} />
    </div>
  );
}
