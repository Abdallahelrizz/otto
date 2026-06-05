import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { getNodeDef } from './nodes/nodeConfig';
import { DataInspector } from './DataInspector';
import { JsonViewer } from './JsonViewer';
import { ModelSelect } from './ModelSelect';
import type { Credential, NodeExecution, OttoNodeData, TriggerSample, WorkflowValidationIssue } from '../types';
import type { AgentTool, FieldDef } from './nodes/nodeConfig';
import { PreviewChip } from './ndv/ExpressionEditor';
import MonacoEditor from '@monaco-editor/react';

/* ── Shared style tokens ── */
const labelStyle: CSSProperties = {
  display: 'block',
  fontFamily: "'Inter'",
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  letterSpacing: '0.02em',
  marginBottom: '5px',
};

const inputStyle: CSSProperties = {
  width: '100%',
  fontFamily: "'Inter'",
  fontSize: '13px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: '5px',
  padding: '7px 10px',
  color: 'var(--text-primary)',
  transition: 'border-color 0.15s ease',
};

const monoStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: 'Geist Mono',
  fontSize: '11px',
  resize: 'vertical',
  minHeight: '80px',
  lineHeight: 1.6,
};

const selectStyle: CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2371717a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '28px',
};

const addBtnStyle: CSSProperties = {
  fontSize: '11px',
  color: 'var(--accent)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left' as const,
  padding: '2px 0',
  fontWeight: 500,
  fontFamily: "'Inter'",
};

const removeBtnStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: '15px',
  padding: '0 2px',
  lineHeight: 1,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
};

const subtleButtonStyle: CSSProperties = {
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

export function FieldGroup({
  label,
  children,
  required,
  helper,
  error,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  helper?: string;
  error?: string | null;
}) {
  return (
    <div>
      <label style={{ ...labelStyle, color: error ? 'var(--node-error)' : labelStyle.color }}>
        {label}
        {required && <span style={{ color: 'var(--node-error)' }}> *</span>}
      </label>
      {children}
      {error ? (
        <div style={{ marginTop: '5px', color: 'var(--node-error)', fontSize: '11px', lineHeight: 1.35 }}>
          {error}
        </div>
      ) : helper ? (
        <div style={{ marginTop: '5px', color: 'var(--text-muted)', fontSize: '11px', lineHeight: 1.35 }}>
          {helper}
        </div>
      ) : null}
    </div>
  );
}

/* ── Execution status badge ── */
function ExecBadge({ execution }: { execution: NodeExecution }) {
  const c: Record<string, string> = {
    success: 'var(--node-success)', error: 'var(--node-error)',
    running: 'var(--node-running)', skipped: 'var(--text-secondary)', pending: 'var(--text-secondary)',
  };
  const color = c[execution.status] ?? 'var(--text-secondary)';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '3px 9px', borderRadius: '100px',
      border: `1px solid ${color}`, color,
      fontSize: '10px', fontWeight: 600, letterSpacing: '0.07em',
      fontFamily: 'Geist Mono',
    }}>
      {execution.status === 'running' && (
        <span className="animate-pulse" style={{ width: '5px', height: '5px', borderRadius: '50%', background: color, display: 'inline-block' }} />
      )}
      {execution.status.toUpperCase()}
      {execution.duration_ms != null && ` · ${execution.duration_ms}ms`}
    </div>
  );
}

/* ── Execution data section ── */
type OttoImportMeta = {
  status?: 'exact' | 'partial' | 'placeholder' | 'unsupported';
  n8nName?: string | null;
  n8nType?: string | null;
  notes?: string[];
};

function ImportMetadataSection({ config }: { config: Record<string, unknown> }) {
  const meta = config._ottoImport as OttoImportMeta | undefined;
  if (!meta) return null;
  const color = meta.status === 'exact'
    ? 'var(--node-success)'
    : meta.status === 'partial'
      ? 'var(--node-running)'
      : meta.status === 'placeholder'
        ? 'var(--node-error)'
        : 'var(--text-muted)';

  return (
    <div style={{
      marginBottom: '20px',
      border: `1px solid ${color}`,
      borderRadius: '5px',
      background: 'var(--bg-input)',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color,
        fontFamily: 'Geist Mono',
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        <span>{meta.status ?? 'imported'}</span>
        <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta.n8nType}
        </span>
      </div>
      {(meta.notes ?? []).map((note, index) => (
        <div key={index} style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {note}
        </div>
      ))}
    </div>
  );
}

function ValidationIssuesSection({ issues }: { issues: WorkflowValidationIssue[] }) {
  if (!issues.length) return null;
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const color = errorCount > 0 ? 'var(--node-error)' : 'var(--node-running)';

  return (
    <div style={{
      marginBottom: '20px',
      border: `1px solid ${color}`,
      borderRadius: '5px',
      background: 'var(--bg-input)',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '7px',
    }}>
      <div style={{
        color,
        fontFamily: 'Geist Mono',
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {errorCount > 0 ? `${errorCount} validation error${errorCount === 1 ? '' : 's'}` : 'validation warning'}
      </div>
      {issues.map((issue, index) => (
        <div key={`${issue.code}-${issue.field ?? index}`} style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          <span style={{ color: issue.severity === 'error' ? 'var(--node-error)' : 'var(--node-running)', fontWeight: 700 }}>
            {issue.field ?? issue.code}
          </span>
          {': '}
          {issue.message}
        </div>
      ))}
    </div>
  );
}

function ExecutionSection({ execution }: { execution: NodeExecution }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <ExecBadge execution={execution} />
      {execution.error && (
        <div style={{
          marginTop: '10px',
          borderRadius: '7px',
          border: '1px solid color-mix(in srgb, var(--node-error) 30%, transparent)',
          background: 'color-mix(in srgb, var(--node-error) 7%, transparent)',
          padding: '8px 10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--node-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span style={{ fontFamily: 'Geist, system-ui, sans-serif', fontSize: '10.5px', fontWeight: 600, color: 'var(--node-error)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Error</span>
          </div>
          <pre style={{
            fontFamily: 'Geist Mono, monospace',
            fontSize: '11px',
            color: 'var(--node-error)',
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            lineHeight: 1.45,
          }}>
            {execution.error}
          </pre>
        </div>
      )}
      {execution.input != null && (
        <div style={{ marginTop: '12px' }}>
          <DataInspector label="Input" data={execution.input} maxHeight={180} />
        </div>
      )}
      {execution.output != null && (
        <div style={{ marginTop: '12px' }}>
          <DataInspector label="Output" data={execution.output} maxHeight={180} />
        </div>
      )}
      <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0 0' }} />
    </div>
  );
}

function PinnedDataEditor({
  nodeId,
  data,
  onSave,
}: {
  nodeId: string;
  data: unknown;
  onSave: (nodeId: string, data: unknown) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(JSON.stringify(data ?? null, null, 2));
    setError(null);
    setEditing(false);
  }, [nodeId, data]);

  const save = () => {
    try {
      const parsed = JSON.parse(text);
      onSave(nodeId, parsed);
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pinned data must be valid JSON');
    }
  };

  return (
    <div style={{
      marginBottom: '20px',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      background: 'var(--bg-input)',
      padding: '10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <div style={{
          flex: 1,
          color: 'var(--node-running)',
          fontFamily: 'Geist Mono',
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Pinned data active
        </div>
        <button type="button" style={addBtnStyle} onClick={() => setEditing((value) => !value)}>
          {editing ? 'Preview' : 'Edit JSON'}
        </button>
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <textarea
            style={{ ...monoStyle, minHeight: '180px', maxHeight: '320px' }}
            value={text}
            spellCheck={false}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
          />
          {error && <div style={{ color: 'var(--node-error)', fontSize: '11px', lineHeight: 1.4 }}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={{ ...addBtnStyle, color: 'var(--node-success)' }} onClick={save}>
              Save pinned JSON
            </button>
            <button
              type="button"
              style={addBtnStyle}
              onClick={() => {
                setText(JSON.stringify(data ?? null, null, 2));
                setError(null);
              }}
            >
              Reset
            </button>
          </div>
        </div>
      ) : (
        <DataInspector label="Pinned output" data={data} maxHeight={180} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════
   NODE-SPECIFIC PANELS
════════════════════════════════════════════ */

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '9px 0',
      cursor: 'pointer',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block',
          color: 'var(--text-primary)',
          fontFamily: "'Inter'",
          fontSize: '12.5px',
          fontWeight: 600,
          letterSpacing: '-0.004em',
        }}>
          {label}
        </span>
        <span style={{
          display: 'block',
          marginTop: '3px',
          color: 'var(--text-muted)',
          fontSize: '11px',
          lineHeight: 1.35,
        }}>
          {description}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--accent)' }}
      />
    </label>
  );
}

function NodeControlsPanel({
  data,
  onChange,
}: {
  data: OttoNodeData;
  onChange: (patch: Partial<OttoNodeData>) => void;
}) {
  const retryOnFail = Boolean(data.retryOnFail);
  const maxTries = Number(data.maxTries ?? 2);
  const retryDelayMs = Number(data.retryDelayMs ?? 1000);

  return (
    <div style={{
      marginBottom: '20px',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      background: 'var(--bg-input)',
      padding: '10px',
    }}>
      <div style={{
        color: 'var(--text-secondary)',
        fontFamily: 'Geist Mono',
        fontSize: '10px',
        fontWeight: 800,
        letterSpacing: '0.08em',
        marginBottom: '2px',
        textTransform: 'uppercase',
      }}>
        Node controls
      </div>

      <ToggleRow
        label="Active"
        description="Disabled nodes are skipped and pass input through."
        checked={!data.disabled}
        onChange={(checked) => onChange({ disabled: !checked })}
      />
      <div style={{ height: '1px', background: 'var(--border)' }} />
      <ToggleRow
        label="Continue on error"
        description="Return an error object and keep downstream nodes running."
        checked={Boolean(data.continueOnError)}
        onChange={(checked) => onChange({ continueOnError: checked })}
      />
      <div style={{ height: '1px', background: 'var(--border)' }} />
      <ToggleRow
        label="Retry on fail"
        description="Retry this node before marking it failed."
        checked={retryOnFail}
        onChange={(checked) => onChange({ retryOnFail: checked })}
      />
      {retryOnFail && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '2px 0 10px' }}>
          <FieldGroup label="Max tries" helper="Includes the first attempt.">
            <input
              type="number"
              min={1}
              max={10}
              style={inputStyle}
              value={Number.isFinite(maxTries) ? maxTries : 2}
              onChange={(event) => onChange({
                maxTries: Math.max(1, Math.min(10, Number.parseInt(event.target.value, 10) || 1)),
              })}
            />
          </FieldGroup>
          <FieldGroup label="Wait ms" helper="Delay between retries.">
            <input
              type="number"
              min={0}
              max={60000}
              step={100}
              style={inputStyle}
              value={Number.isFinite(retryDelayMs) ? retryDelayMs : 1000}
              onChange={(event) => onChange({
                retryDelayMs: Math.max(0, Math.min(60000, Number.parseInt(event.target.value, 10) || 0)),
              })}
            />
          </FieldGroup>
        </div>
      )}
      <div style={{ height: '1px', background: 'var(--border)' }} />
      <ToggleRow
        label="Always output data"
        description="Emit an empty item when the node returns no output."
        checked={Boolean(data.alwaysOutputData)}
        onChange={(checked) => onChange({ alwaysOutputData: checked })}
      />
      <div style={{ height: '1px', background: 'var(--border)', marginBottom: '10px' }} />
      <FieldGroup label="Notes" helper="Builder-facing context for this node.">
        <textarea
          style={{ ...monoStyle, minHeight: '64px', maxHeight: '180px' }}
          value={data.notes ?? ''}
          spellCheck={false}
          placeholder="Purpose, expected payload, or test notes"
          onChange={(event) => onChange({ notes: event.target.value })}
        />
      </FieldGroup>
      <ToggleRow
        label="Show note on canvas"
        description="Display this note below the node card."
        checked={Boolean(data.displayNote)}
        onChange={(checked) => onChange({ displayNote: checked })}
      />
    </div>
  );
}

export type PanelProps = {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  nodeId?: string;
  issues?: WorkflowValidationIssue[];
};

type SelectFieldDef = Extract<FieldDef, { type: 'select' }>;

type DataPathRow = {
  path: string;
  accessPath: string;
  type: string;
  sample: string;
};

type ExpressionOption = {
  id: string;
  group: string;
  label: string;
  detail: string;
  expression: string;
  sample?: string;
};

const NODE_CREDENTIAL_TYPE_HINTS: Record<string, string[]> = {
  http_request:        ['api_key', 'bearer_token', 'basic'],
  parallel_ai:         ['openai', 'anthropic', 'openrouter', 'api_key', 'bearer_token'],
  llm_call:            ['openai', 'anthropic', 'openrouter', 'api_key'],
  ai_agent:            ['openai', 'anthropic', 'openrouter', 'api_key'],
  vector_search:       ['openai', 'api_key'],
  memory_read:         ['openai', 'api_key'],
  memory_write:        ['openai', 'api_key'],
  slack_send_message:  ['api_key', 'bearer_token'],
  discord_send_message: ['api_key', 'bearer_token'],
  telegram_send_message: ['api_key'],
  notion_api:          ['api_key', 'bearer_token'],
  airtable_records:    ['api_key'],
  graphql_request:     ['api_key', 'bearer_token', 'basic'],
  s3_object:           ['s3'],
  stripe_api:          ['api_key'],
  sendgrid_email:      ['api_key'],
  twilio_sms:          ['api_key'],
  salesforce_api:      ['bearer_token'],
  linear_api:          ['api_key', 'bearer_token'],
  send_email:          ['smtp', 'resend'],
  postgres_query:      ['postgres'],
  redis_get:           ['redis'],
  redis_set:           ['redis'],
};

function credentialsForNode(credentials: Credential[], nodeType: string, fallbackTypes?: string[]) {
  const allowed = NODE_CREDENTIAL_TYPE_HINTS[nodeType] ?? fallbackTypes;
  if (!allowed) return credentials;
  const allowedSet = new Set(allowed);
  return credentials.filter((credential) => allowedSet.has(credential.type));
}

function copyText(value: string) {
  void navigator.clipboard?.writeText(value);
}

function valueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}

function sampleValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return valueType(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function withoutBinary(value: unknown) {
  if (!isPlainObject(value)) return value ?? {};
  const { binary: _binary, ...rest } = value;
  return rest;
}

function inputJsonSource(value: unknown) {
  if (isPlainObject(value) && 'json' in value) return value.json ?? {};
  return withoutBinary(value);
}

function nodeJsonSource(value: unknown) {
  if (isPlainObject(value) && ('json' in value || 'binary' in value)) return value.json ?? withoutBinary(value);
  if (isPlainObject(value) && 'data' in value) return value.data ?? {};
  return withoutBinary(value);
}

function segmentLabel(segment: string | number) {
  return typeof segment === 'number' ? `[${segment}]` : segment;
}

function dotPath(segments: Array<string | number>) {
  return segments.map(segmentLabel).join('.').replace(/\.\[/g, '[');
}

function jsAccessPath(segments: Array<string | number>) {
  return segments.map((segment) => {
    if (typeof segment === 'number') return `[${segment}]`;
    return /^[A-Za-z_$][\w$]*$/.test(segment)
      ? `.${segment}`
      : `[${JSON.stringify(segment)}]`;
  }).join('');
}

function collectDataPaths(value: unknown, maxRows = 48): DataPathRow[] {
  const rows: DataPathRow[] = [];
  const seen = new Set<unknown>();

  const visit = (current: unknown, segments: Array<string | number>, depth: number) => {
    if (rows.length >= maxRows || depth > 4) return;
    if (segments.length > 0) {
      rows.push({
        path: dotPath(segments),
        accessPath: jsAccessPath(segments),
        type: valueType(current),
        sample: sampleValue(current).slice(0, 80),
      });
    }

    if (!current || typeof current !== 'object') return;
    if (seen.has(current)) return;
    seen.add(current);

    if (Array.isArray(current)) {
      if (current.length) visit(current[0], [...segments, 0], depth + 1);
      return;
    }

    const entries = Object.entries(current as Record<string, unknown>)
      .filter(([key]) => key !== 'binary')
      .slice(0, 16);
    for (const [key, child] of entries) {
      visit(child, [...segments, key], depth + 1);
      if (rows.length >= maxRows) break;
    }
  };

  visit(value, [], 0);
  return rows;
}

function expressionString(strings: TemplateStringsArray, ...values: string[]) {
  return strings.reduce((out, part, index) => out + part + (values[index] ?? ''), '');
}

function appendExpression(current: unknown, expression: string) {
  const text = String(current ?? '');
  if (!text.trim()) return expression;
  const joiner = text.endsWith(' ') || text.endsWith('\n') ? '' : ' ';
  return `${text}${joiner}${expression}`;
}

function hasExpression(value: string) {
  return /\{\{[\s\S]*(?:\}\})?/.test(value);
}

function expressionFieldStyle(base: CSSProperties, expressionActive: boolean): CSSProperties {
  if (!expressionActive) return base;
  return {
    ...base,
    borderColor: base.borderColor === 'var(--node-error)' ? base.borderColor : 'var(--accent)',
    boxShadow: 'inset 2px 0 0 var(--accent)',
  };
}

function insertExpressionText(
  current: string,
  expression: string,
  start: number | null | undefined,
  end: number | null | undefined
) {
  const fallbackIndex = current.length;
  const from = Math.max(0, Math.min(start ?? fallbackIndex, current.length));
  const to = Math.max(from, Math.min(end ?? from, current.length));
  return {
    value: `${current.slice(0, from)}${expression}${current.slice(to)}`,
    cursor: from + expression.length,
  };
}

function ancestorsForNode(nodeId: string | null, edges: Array<{ source: string; target: string }>) {
  if (!nodeId) return [];
  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  }
  const visited = new Set<string>();
  const ordered: string[] = [];
  const visit = (id: string) => {
    for (const source of incoming.get(id) ?? []) {
      if (visited.has(source)) continue;
      visited.add(source);
      visit(source);
      ordered.push(source);
    }
  };
  visit(nodeId);
  return ordered;
}

function useExpressionOptions(maxRows = 64): ExpressionOption[] {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const nodeExecutions = useStore((s) => s.nodeExecutions);
  const selectedExecutionDetail = useStore((s) => s.selectedExecutionDetail);

  return useMemo(() => {
    const options: ExpressionOption[] = [
      {
        id: 'current-json',
        group: 'Current input',
        label: '$json',
        detail: 'Current item JSON',
        expression: '{{ $json }}',
      },
      {
        id: 'current-input',
        group: 'Current input',
        label: 'input',
        detail: 'Raw merged input',
        expression: '{{ input }}',
      },
      {
        id: 'input-all',
        group: 'Current input',
        label: '$input.all()',
        detail: 'All input items',
        expression: '{{ $input.all() }}',
      },
      {
        id: 'now',
        group: 'Helpers',
        label: '$now',
        detail: 'Current date/time',
        expression: '{{ $now }}',
      },
    ];

    const executions = new Map<string, NodeExecution>();
    for (const execution of selectedExecutionDetail?.nodes ?? []) executions.set(execution.node_id, execution);
    for (const execution of Object.values(nodeExecutions)) executions.set(execution.node_id, execution);

    const selectedExecution = selectedNodeId ? executions.get(selectedNodeId) : null;
    const inputSource = inputJsonSource(selectedExecution?.input ?? selectedExecutionDetail?.execution?.input ?? null);
    for (const row of collectDataPaths(inputSource, 24)) {
      options.push({
        id: `json:${row.path}`,
        group: 'Current input',
        label: `$json.${row.path}`,
        detail: row.type,
        expression: `{{ $json${row.accessPath} }}`,
        sample: row.sample,
      });
      options.push({
        id: `input:${row.path}`,
        group: 'Current input',
        label: `input.${row.path}`,
        detail: row.type,
        expression: `{{ input${row.accessPath} }}`,
        sample: row.sample,
      });
    }

    const ancestorIds = ancestorsForNode(selectedNodeId, edges);
    const orderedNodeIds = ancestorIds.length
      ? ancestorIds
      : nodes.map((node) => node.id).filter((nodeId) => nodeId !== selectedNodeId);

    for (const nodeId of orderedNodeIds) {
      const execution = executions.get(nodeId);
      if (!execution || execution.output == null) continue;
      const node = nodes.find((candidate) => candidate.id === nodeId);
      const nodeName = execution.node_name || String(node?.data?.label ?? nodeId);
      const nodeKey = JSON.stringify(nodeName);
      const outputSource = nodeJsonSource(execution.output);

      options.push({
        id: `node:${nodeId}:json`,
        group: nodeName,
        label: `${nodeName}.json`,
        detail: 'Node output JSON',
        expression: expressionString`{{ $node[${nodeKey}].json }}`,
      });
      options.push({
        id: `node:${nodeId}:data`,
        group: nodeName,
        label: `${nodeName}.data`,
        detail: 'Raw node output',
        expression: expressionString`{{ $node[${nodeKey}].data }}`,
      });

      for (const row of collectDataPaths(outputSource, 16)) {
        options.push({
          id: `node:${nodeId}:json:${row.path}`,
          group: nodeName,
          label: `${nodeName}.${row.path}`,
          detail: row.type,
          expression: expressionString`{{ $node[${nodeKey}].json${row.accessPath} }}`,
          sample: row.sample,
        });
      }
      if (options.length >= maxRows) break;
    }

    return options.slice(0, maxRows);
  }, [edges, maxRows, nodeExecutions, nodes, selectedExecutionDetail, selectedNodeId]);
}

function ExpressionOptionRow({
  option,
  onInsert,
}: {
  option: ExpressionOption;
  onInsert?: (expression: string) => void;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: onInsert ? 'minmax(0, 1fr) auto auto' : 'minmax(0, 1fr) auto',
      gap: '6px',
      alignItems: 'center',
      padding: '7px 8px',
      borderTop: '1px solid var(--border)',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          color: 'var(--text-primary)',
          fontFamily: 'Geist Mono',
          fontSize: '10.5px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {option.label}
        </div>
        <div style={{
          color: 'var(--text-muted)',
          fontSize: '10.5px',
          lineHeight: 1.35,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {option.detail}{option.sample ? ` - ${option.sample}` : ''}
        </div>
      </div>
      {onInsert && (
        <button
          type="button"
          style={subtleButtonStyle}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(option.expression)}
        >
          Insert
        </button>
      )}
      <button type="button" style={subtleButtonStyle} onClick={() => copyText(option.expression)}>
        Copy
      </button>
    </div>
  );
}

function ExpressionToolbar({
  value,
  onInsert,
}: {
  value: string;
  onInsert: (expression: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = useExpressionOptions(36);
  const expressionActive = hasExpression(value);

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        type="button"
        title={expressionActive ? 'Expression detected in this field' : 'Insert data expression'}
        style={{
          ...subtleButtonStyle,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: open || expressionActive ? 'var(--bg-hover)' : 'transparent',
          borderColor: expressionActive ? 'var(--accent)' : 'var(--border)',
          color: open || expressionActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
        onClick={() => setOpen((next) => !next)}
      >
        <span>Data</span>
        {expressionActive && (
          <span style={{
            color: 'var(--accent)',
            fontSize: '9px',
            fontWeight: 800,
          }}>
            EXPR
          </span>
        )}
      </button>
      {open && (
        <div style={{
          marginTop: '6px',
          border: '1px solid var(--border)',
          borderRadius: '5px',
          background: 'var(--bg-input)',
          overflow: 'hidden',
          maxHeight: '220px',
          overflowY: 'auto',
        }}>
          {options.map((option) => (
            <ExpressionOptionRow
              key={option.id}
              option={option}
              onInsert={onInsert}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type ExpressionInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'style'> & {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
};

function ExpressionInput({ value, onChange, style, containerStyle, ...props }: ExpressionInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const expressionActive = hasExpression(value);
  const insertAtCursor = (expression: string) => {
    const target = inputRef.current;
    const fallback = appendExpression(value, expression);
    const { value: nextValue, cursor } = target
      ? insertExpressionText(value, expression, target.selectionStart, target.selectionEnd)
      : { value: fallback, cursor: fallback.length };
    onChange(nextValue);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const execId = useStore((s) => s.executionId);
  const nodeForPreview = useStore((s) => s.selectedNodeId);

  return (
    <div style={containerStyle}>
      <input
        {...props}
        ref={inputRef}
        style={expressionFieldStyle(style ?? inputStyle, expressionActive)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <ExpressionToolbar value={value} onInsert={insertAtCursor} />
      {expressionActive && (
        <PreviewChip
          value={value}
          executionId={execId}
          nodeId={nodeForPreview}
        />
      )}
    </div>
  );
}

type ExpressionTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'style'> & {
  value: string;
  onChange: (value: string) => void;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
};

function ExpressionTextarea({ value, onChange, style, containerStyle, ...props }: ExpressionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const expressionActive = hasExpression(value);
  const execId        = useStore((s) => s.executionId);
  const nodeForPreview = useStore((s) => s.selectedNodeId);
  const insertAtCursor = (expression: string) => {
    const target = textareaRef.current;
    const fallback = appendExpression(value, expression);
    const { value: nextValue, cursor } = target
      ? insertExpressionText(value, expression, target.selectionStart, target.selectionEnd)
      : { value: fallback, cursor: fallback.length };
    onChange(nextValue);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div style={containerStyle}>
      <textarea
        {...props}
        ref={textareaRef}
        style={expressionFieldStyle(style ?? monoStyle, expressionActive)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <ExpressionToolbar value={value} onInsert={insertAtCursor} />
      {expressionActive && (
        <PreviewChip value={value} executionId={execId} nodeId={nodeForPreview} />
      )}
    </div>
  );
}

function ExpressionDataPanel() {
  const [open, setOpen] = useState(false);
  const options = useExpressionOptions(18);
  const grouped = options.reduce<Record<string, ExpressionOption[]>>((acc, option) => {
    acc[option.group] = [...(acc[option.group] ?? []), option];
    return acc;
  }, {});

  return (
    <div style={{
      marginBottom: '16px',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      background: 'var(--bg-input)',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setOpen((next) => !next)}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '9px 10px',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '7px', opacity: 0.65 }}>{open ? 'v' : '>'}</span>
        <span style={{
          flex: 1,
          color: 'var(--text-secondary)',
          fontFamily: 'Geist Mono',
          fontSize: '10px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Data picker
        </span>
        <span style={{
          color: 'var(--text-muted)',
          fontFamily: 'Geist Mono',
          fontSize: '9px',
          fontWeight: 700,
        }}>
          {options.length}
        </span>
      </button>
      {open && Object.entries(grouped).map(([group, groupOptions]) => (
        <div key={group}>
          <div style={{
            borderTop: '1px solid var(--border)',
            color: 'var(--text-muted)',
            fontFamily: 'Geist Mono',
            fontSize: '9px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            padding: '7px 8px 5px',
            textTransform: 'uppercase',
          }}>
            {group}
          </div>
          {groupOptions.map((option) => (
            <ExpressionOptionRow key={option.id} option={option} />
          ))}
        </div>
      ))}
    </div>
  );
}

const OPERATION_HELP: Record<string, Record<string, string>> = {
  airtable_records: {
    list: 'Read records from a table, optionally using a formula and limit.',
    create: 'Create one record from the Fields JSON object.',
    update: 'Update an existing record by Record ID.',
    delete: 'Delete an existing record by Record ID.',
  },
  s3_object: {
    list: 'Return objects from a bucket using the optional prefix.',
    get: 'Download one object and expose it as binary data.',
    put: 'Upload text, JSON, or an input binary property.',
    head: 'Fetch object metadata without downloading the object.',
    delete: 'Delete one object from the bucket.',
  },
  json_transform: {
    get: 'Return one value from a dot path.',
    set: 'Write a value to a dot path and return the changed object.',
    pick: 'Keep only comma-separated paths.',
    omit: 'Remove comma-separated paths.',
    parse: 'Parse JSON text into data.',
    stringify: 'Serialize data into JSON text.',
    merge: 'Merge an object into the input value.',
  },
  compression: {
    gzip: 'Compress text and usually return base64.',
    gunzip: 'Decode gzip data back into text.',
    deflate: 'Compress text using deflate.',
    inflate: 'Decode deflated data back into text.',
  },
  crypto: {
    md5: 'Return an MD5 hash for compatibility workflows.',
    sha1: 'Return a SHA-1 hash for compatibility workflows.',
    sha256: 'Return a SHA-256 hash.',
    sha512: 'Return a SHA-512 hash.',
    'hmac-sha256': 'Sign the value with a secret using HMAC SHA-256.',
    'hmac-sha512': 'Sign the value with a secret using HMAC SHA-512.',
    'base64-encode': 'Convert text to base64.',
    'base64-decode': 'Convert base64 back to text.',
    uuid: 'Generate a UUID value.',
    'random-bytes': 'Generate secure random bytes.',
  },
  datetime: {
    now: 'Return the current timestamp.',
    format: 'Format an input date into the output format.',
    parse: 'Parse an input date and normalize it.',
    add: 'Add an amount of time to a date.',
    subtract: 'Subtract an amount of time from a date.',
    diff: 'Compare two dates and return the difference.',
    toTimezone: 'Shift a date into a target timezone.',
  },
  jwt: {
    sign: 'Create a signed JWT from a JSON payload.',
    verify: 'Verify a token and return its decoded payload.',
    decode: 'Decode a token without verification.',
  },
};

const FIELD_HELP_BY_KEY: Record<string, string> = {
  credentialId: 'Select a saved credential. Leave empty only when this node supports inline or environment credentials.',
  token: 'Inline token override. Prefer saved credentials for reusable workflows.',
  endpoint: 'Base URL for the API or service endpoint.',
  bucket: 'S3-compatible bucket name.',
  key: 'Object key or lookup key. Expressions are allowed.',
  prefix: 'Prefix used to narrow list results.',
  maxKeys: 'Maximum number of objects to return.',
  path: 'Workspace-safe path or public trigger path, depending on this node.',
  sourceField: 'Input field used when the direct value is empty.',
  binaryProperty: 'Name of the binary property on the input or output item.',
  value: 'Static value or expression. Use {{ input.field }} to read incoming data.',
  fieldsJson: 'JSON object or array used by this node. Expressions are allowed when the whole value is dynamic.',
  body: 'Request body JSON or text. Expressions are allowed.',
  query: 'Query text for this node. Expressions are allowed.',
  variablesJson: 'GraphQL variables as a JSON object.',
  params: 'Postgres query parameters as a JSON array.',
  recordId: 'Required for update and delete operations.',
};

const FIELD_HELP_BY_NODE: Record<string, Record<string, string>> = {
  s3_object: {
    endpoint: 'Use this for R2, MinIO, DigitalOcean Spaces, or other S3-compatible storage. Leave empty for AWS S3.',
    sourceMode: 'Choose whether upload reads from a text value or binary input.',
    forcePathStyle: 'Use path-style URLs for MinIO and many S3-compatible providers.',
  },
  slack_send_message: {
    channel: 'Slack channel ID (e.g. C01234ABCDE) or name prefixed with # (e.g. #general). Expressions allowed.',
    text: 'Message text. Supports Slack mrkdwn formatting. Expressions are resolved before sending.',
    username: 'Bot display name override. Leave empty to use the default app name.',
    iconEmoji: 'Emoji code for the bot icon, e.g. :robot_face:',
    iconUrl: 'URL for a custom bot avatar image.',
    threadTs: 'Parent message timestamp to reply in thread.',
  },
  discord_send_message: {
    channelId: 'Discord channel ID (numeric snowflake). Enable Developer Mode in Discord to copy it.',
    content: 'Message content, up to 2000 characters. Expressions allowed.',
    username: 'Webhook display name override.',
    avatarUrl: 'Webhook avatar image URL.',
    tts: 'Set to true to send as a text-to-speech message.',
  },
  telegram_send_message: {
    chatId: 'Telegram chat ID, group ID, or @username. Numeric IDs are prefixed with - for groups.',
    text: 'Message text. Supports Telegram MarkdownV2 or HTML. Expressions allowed.',
    parseMode: 'Formatting mode: MarkdownV2, HTML, or leave empty for plain text.',
    disableNotification: 'Set to true to send silently.',
  },
  notion_api: {
    method: 'HTTP method for the Notion API call.',
    path: 'Notion API path, e.g. /v1/databases/{database_id}/query. Expressions allowed.',
    notionVersion: 'Notion API version header, e.g. 2022-06-28.',
    body: 'Request body as a JSON object. Used for POST/PATCH requests.',
  },
  graphql_request: {
    endpoint: 'GraphQL endpoint URL.',
    query: 'GraphQL query or mutation string. Expressions allowed.',
    variablesJson: 'GraphQL variables as a JSON object. Expressions are resolved before sending.',
  },
  airtable_records: {
    baseId: 'The Airtable base id, usually starting with app.',
    tableName: 'Table name or table id.',
    filterByFormula: 'Airtable formula used only when listing records.',
  },
  json_transform: {
    paths: 'Comma-separated dot paths.',
    setValue: 'Value used by set and merge operations.',
  },
  binary_metadata: {
    source: 'Choose whether to inspect input binary data, one binary id, or recent binary records.',
    lookup: 'When enabled, Otto reads saved metadata from the binary data table.',
  },
  parallel_ai: {
    targetsJson: 'JSON array of branches. Each branch can set id, provider, model, credentialId, userPrompt, systemPrompt, temperature, maxTokens, and timeoutMs.',
    userPrompt: 'Default prompt used by branches that do not define their own userPrompt. Expressions are resolved before the fan-out starts.',
    failureMode: 'Choose whether branch errors fail the node or are returned alongside successful model outputs.',
  },
};

const REQUIRED_FIELDS_BY_NODE: Record<string, string[]> = {
  read_file: ['path', 'binaryProperty'],
  write_file: ['path', 'binaryProperty'],
  move_binary_data: ['mode', 'sourceField', 'targetField', 'binaryProperty'],
  list_files: ['path'],
  binary_metadata: ['source'],
  s3_object: ['operation', 'bucket'],
  csv_parse: ['delimiter', 'hasHeader'],
  csv_stringify: ['delimiter', 'includeHeader'],
  xml_stringify: ['rootName'],
  html_extract: ['selector', 'attribute'],
  json_transform: ['operation'],
  compression: ['operation'],
  crypto: ['operation'],
  datetime: ['operation'],
  jwt: ['operation'],
  slack_send_message: ['channel', 'text'],
  discord_send_message: ['content'],
  telegram_send_message: ['chatId', 'text'],
  notion_api: ['method', 'path', 'notionVersion'],
  airtable_records: ['operation', 'baseId', 'tableName'],
  graphql_request: ['endpoint', 'query'],
  parallel_ai: ['targetsJson'],
};

const REQUIRED_WHEN_BY_NODE: Record<string, Array<{ when: (config: Record<string, unknown>) => boolean; fields: string[] }>> = {
  binary_metadata: [
    { when: (config) => String(config.source ?? 'input') === 'input', fields: ['binaryProperty'] },
    { when: (config) => String(config.source ?? '') === 'id', fields: ['binaryId'] },
  ],
  s3_object: [
    { when: (config) => ['get', 'put', 'delete', 'head'].includes(String(config.operation ?? '')), fields: ['key'] },
    { when: (config) => String(config.operation ?? '') === 'put' && String(config.sourceMode ?? '') === 'binary', fields: ['binaryProperty'] },
  ],
  json_transform: [
    { when: (config) => String(config.operation ?? '') === 'set', fields: ['path'] },
    { when: (config) => ['pick', 'omit'].includes(String(config.operation ?? '')), fields: ['paths'] },
    { when: (config) => ['set', 'merge'].includes(String(config.operation ?? '')), fields: ['setValue'] },
  ],
  crypto: [
    { when: (config) => String(config.operation ?? '').startsWith('hmac-'), fields: ['secret'] },
  ],
  jwt: [
    { when: (config) => config.operation === 'sign', fields: ['payload', 'secret', 'algorithm'] },
    { when: (config) => config.operation === 'verify', fields: ['token', 'secret', 'algorithm'] },
    { when: (config) => config.operation === 'decode', fields: ['token'] },
  ],
  airtable_records: [
    { when: (config) => ['update', 'delete'].includes(String(config.operation ?? '')), fields: ['recordId'] },
  ],
};

function getOperationField(nodeType: string): SelectFieldDef | null {
  const def = getNodeDef(nodeType);
  const field = def.fields.find((candidate): candidate is SelectFieldDef => (
    candidate.type === 'select' && candidate.key === 'operation' && candidate.options.length > 1
  ));
  return field ?? null;
}

function fieldIssues(issues: WorkflowValidationIssue[], key: string) {
  return issues.filter((issue) => {
    const field = issue.field ?? '';
    if (field === key) return true;
    if (field.split('|').includes(key)) return true;
    return field.startsWith(`${key}.`) || field.startsWith(`${key}[`);
  });
}

function fieldIsRequired(
  nodeType: string,
  field: FieldDef,
  config: Record<string, unknown>,
  issues: WorkflowValidationIssue[]
) {
  if (field.required) return true;
  if ((REQUIRED_FIELDS_BY_NODE[nodeType] ?? []).includes(field.key)) return true;
  if ((REQUIRED_WHEN_BY_NODE[nodeType] ?? []).some((condition) => (
    condition.when(config) && condition.fields.includes(field.key)
  ))) return true;
  return issues.some((issue) => (
    issue.severity === 'error'
    && (issue.code === 'required_field_missing' || issue.code === 'missing_credential')
  ));
}

function fieldHelper(nodeType: string, field: FieldDef) {
  return field.description
    ?? FIELD_HELP_BY_NODE[nodeType]?.[field.key]
    ?? FIELD_HELP_BY_KEY[field.key]
    ?? '';
}

function fieldInputStyle(hasError: boolean, base: CSSProperties = inputStyle): CSSProperties {
  return {
    ...base,
    borderColor: hasError ? 'var(--node-error)' : base.borderColor,
  };
}

function customFieldProps(
  issues: WorkflowValidationIssue[],
  key: string,
  helper?: string,
  required = false
) {
  const relatedIssues = fieldIssues(issues, key);
  const error = relatedIssues.find((issue) => issue.severity === 'error')?.message ?? null;
  return {
    required: required || relatedIssues.some((issue) => issue.severity === 'error'),
    helper,
    error,
  };
}

function OperationPicker({
  nodeType,
  config,
  onChange,
}: {
  nodeType: string;
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const def = getNodeDef(nodeType);
  const field = getOperationField(nodeType);
  if (!field) return null;

  const current = String(config[field.key] ?? def.defaultConfig[field.key] ?? field.options[0]?.value ?? '');

  return (
    <div style={{
      marginBottom: '16px',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      background: 'var(--bg-input)',
      padding: '10px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        marginBottom: '8px',
      }}>
        <label style={{ ...labelStyle, margin: 0 }}>{field.label}</label>
        <span style={{
          color: 'var(--text-muted)',
          fontFamily: 'Geist Mono',
          fontSize: '9px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          action
        </span>
      </div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {field.options.map((option) => {
          const active = option.value === current;
          const help = option.description ?? OPERATION_HELP[nodeType]?.[option.value] ?? '';
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(field.key, option.value)}
              style={{
                width: '100%',
                border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: '5px',
                background: active ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '8px 9px',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 700, lineHeight: 1.2 }}>{option.label}</span>
              {help && <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.35 }}>{help}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function publicTriggerOrigin() {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  // Explicit override always wins (production / Railway)
  const apiUrl = env?.VITE_API_URL?.replace(/\/$/, '') ?? '';
  if (apiUrl) return apiUrl.replace(/\/api\/v1$/, '');
  // In dev, Vite runs on :5173 but the backend (webhook handler) is on :3000
  const origin = window.location.origin;
  if (origin.includes(':5173')) return origin.replace(':5173', ':3000');
  return origin;
}

function triggerPath(config: Record<string, unknown>, fallback: string) {
  return String(config.path ?? fallback).trim().replace(/^\/+/, '') || fallback;
}

function ReadOnlyUrlField({ label, value }: { label: string; value: string }) {
  return (
    <FieldGroup label={label}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input style={{ ...inputStyle, fontFamily: 'Geist Mono', fontSize: '10.5px' }} value={value} readOnly />
        <button
          type="button"
          style={{ ...addBtnStyle, border: '1px solid var(--border)', borderRadius: '5px', padding: '0 10px', textAlign: 'center' }}
          onClick={() => navigator.clipboard?.writeText(value)}
        >
          Copy
        </button>
      </div>
    </FieldGroup>
  );
}

function LatestTriggerSample({ workflowId, nodeId }: { workflowId: string | null; nodeId?: string }) {
  const [sample, setSample] = useState<TriggerSample | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!workflowId || !nodeId) {
      setSample(null);
      return;
    }
    setLoading(true);
    try {
      const result = await api.getTriggerSample(workflowId, nodeId);
      setSample(result.sample);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [workflowId, nodeId]);

  if (!workflowId || !nodeId) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <label style={{ ...labelStyle, margin: 0 }}>Latest sample</label>
        <button type="button" style={addBtnStyle} onClick={() => void load()}>
          {loading ? 'Loading' : 'Refresh'}
        </button>
      </div>
      {sample ? (
        <JsonViewer label={`${sample.trigger_type} sample`} data={sample.payload} />
      ) : (
        <div style={{ ...monoStyle, minHeight: 0, color: 'var(--text-muted)' }}>No sample</div>
      )}
    </div>
  );
}

/* ── Webhook ── */
function WebhookPanel({ config, onChange, nodeId }: PanelProps) {
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const origin = useMemo(() => publicTriggerOrigin(), []);
  const path = triggerPath(config, 'my-webhook');
  const responseMode = (config.responseMode as string) ?? 'accepted';
  const productionUrl = `${origin}/webhooks/${path}`;
  const testUrl = `${origin}/webhooks-test/${savedWorkflowId ?? ':workflowId'}/${path}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReadOnlyUrlField label="Production URL" value={productionUrl} />
      <ReadOnlyUrlField label="Test URL" value={testUrl} />
      <FieldGroup label="Path" helper="URL segment after /webhooks/. Use lowercase letters, numbers, and hyphens.">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            /webhooks/
          </span>
          <input
            style={inputStyle}
            value={(config.path as string) ?? ''}
            placeholder="my-webhook"
            onChange={(e) => onChange('path', e.target.value)}
          />
        </div>
      </FieldGroup>
      <FieldGroup label="Method" helper="HTTP method to listen for. Use Any to accept all methods.">
        <select style={selectStyle} value={(config.method as string) ?? 'POST'} onChange={(e) => onChange('method', e.target.value)}>
          <option value="POST">POST</option>
          <option value="GET">GET</option>
          <option value="PUT">PUT</option>
          <option value="PATCH">PATCH</option>
          <option value="DELETE">DELETE</option>
          <option value="ANY">Any method</option>
        </select>
      </FieldGroup>
      <FieldGroup label="Response mode" helper="What to send back to the caller immediately. Use Custom to control status code and body.">
        <select style={selectStyle} value={responseMode} onChange={(e) => onChange('responseMode', e.target.value)}>
          <option value="accepted">Accepted JSON</option>
          <option value="custom">Custom body</option>
          <option value="empty">Empty 204</option>
        </select>
      </FieldGroup>
      {responseMode === 'custom' && (
        <>
          <FieldGroup label="Response status" helper="HTTP status code to return.">
            <input type="number" style={inputStyle} value={(config.responseStatus as number) ?? 200}
              onChange={(e) => onChange('responseStatus', parseInt(e.target.value))} />
          </FieldGroup>
          <FieldGroup label="Response body" helper="JSON or text body. Expressions are resolved before responding.">
            <textarea style={monoStyle} value={(config.responseBody as string) ?? '{}'}
              onChange={(e) => onChange('responseBody', e.target.value)} />
          </FieldGroup>
        </>
      )}
      <LatestTriggerSample workflowId={savedWorkflowId} nodeId={nodeId} />
    </div>
  );
}

function FormTriggerPanel({ config, onChange, nodeId }: PanelProps) {
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const origin = useMemo(() => publicTriggerOrigin(), []);
  const path = triggerPath(config, 'lead-form');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReadOnlyUrlField label="Production URL" value={`${origin}/forms/${path}`} />
      <ReadOnlyUrlField label="Test URL" value={`${origin}/forms-test/${savedWorkflowId ?? ':workflowId'}/${path}`} />
      <FieldGroup label="Path" helper="URL segment for this form's public URL.">
        <input style={inputStyle} value={(config.path as string) ?? ''} onChange={(e) => onChange('path', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Title" helper="Heading shown at the top of the public form page.">
        <input style={inputStyle} value={(config.title as string) ?? ''} onChange={(e) => onChange('title', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Description" helper="Optional subheading displayed below the form title.">
        <textarea style={monoStyle} value={(config.description as string) ?? ''} onChange={(e) => onChange('description', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Fields JSON" helper='JSON array of field objects. Each field: { "name": "email", "label": "Email", "type": "email", "required": true }. Types: text, email, number, textarea.'>
        <textarea style={monoStyle} value={(config.fieldsJson as string) ?? '[]'} onChange={(e) => onChange('fieldsJson', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Submit label" helper="Text displayed on the form submit button.">
        <input style={inputStyle} value={(config.submitLabel as string) ?? 'Submit'} onChange={(e) => onChange('submitLabel', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Response message" helper="Message shown to the user after successful form submission.">
        <input style={inputStyle} value={(config.responseMessage as string) ?? 'Submitted'} onChange={(e) => onChange('responseMessage', e.target.value)} />
      </FieldGroup>
      <LatestTriggerSample workflowId={savedWorkflowId} nodeId={nodeId} />
    </div>
  );
}

function ChatTriggerPanel({ config, onChange, nodeId }: PanelProps) {
  const savedWorkflowId = useStore((s) => s.savedWorkflowId);
  const nodeExecutions = useStore((s) => s.nodeExecutions);
  const selectedExecutionDetail = useStore((s) => s.selectedExecutionDetail);
  const origin = useMemo(() => publicTriggerOrigin(), []);
  const path = triggerPath(config, 'assistant');

  // Resolve latest execution data for this chat trigger node
  const latestExecution = useMemo(() => {
    if (!nodeId) return null;
    const liveExec = nodeExecutions[nodeId] ?? null;
    if (liveExec) return liveExec;
    if (selectedExecutionDetail?.nodes) {
      return selectedExecutionDetail.nodes.find((n) => n.node_id === nodeId) ?? null;
    }
    return null;
  }, [nodeId, nodeExecutions, selectedExecutionDetail]);

  const sessionIdRaw = latestExecution?.input
    ? (latestExecution.input as Record<string, unknown>)?.sessionId
      ?? (latestExecution.input as Record<string, unknown>)?.[String(config.sessionField ?? 'sessionId')]
    : undefined;
  const sessionId: string | undefined = sessionIdRaw != null ? String(sessionIdRaw) : undefined;

  const lastMessageRaw = latestExecution?.input
    ? (latestExecution.input as Record<string, unknown>)?.message
      ?? (latestExecution.input as Record<string, unknown>)?.[String(config.messageField ?? 'message')]
    : undefined;
  const lastMessage: string | undefined = lastMessageRaw != null ? String(lastMessageRaw) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <ReadOnlyUrlField label="Production URL" value={`${origin}/chat/${path}`} />
      <ReadOnlyUrlField label="Test URL" value={`${origin}/chat-test/${savedWorkflowId ?? ':workflowId'}/${path}`} />

      {/* Chat session info */}
      {(sessionId || lastMessage) && (
        <div style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-input)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Last execution
          </div>
          {sessionId && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, minWidth: 70 }}>Session</span>
              <span style={{ fontFamily: 'Geist Mono', fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {sessionId}
              </span>
            </div>
          )}
          {lastMessage && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, minWidth: 70 }}>Message</span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                {lastMessage}
              </span>
            </div>
          )}
        </div>
      )}

      <FieldGroup label="Path" helper="URL path segment for this chat endpoint.">
        <input style={inputStyle} value={(config.path as string) ?? ''} onChange={(e) => onChange('path', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Session field" helper="Request body key used to group messages into conversation sessions.">
        <input style={inputStyle} value={(config.sessionField as string) ?? 'sessionId'} onChange={(e) => onChange('sessionField', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Message field" helper="Request body key containing the chat message text.">
        <input style={inputStyle} value={(config.messageField as string) ?? 'message'} onChange={(e) => onChange('messageField', e.target.value)} />
      </FieldGroup>

      <FieldGroup label="System prompt" helper="Injected before the conversation. Use {{ $vars.PROMPT }} to reference a variable.">
        <ExpressionTextarea
          style={monoStyle}
          value={(config.systemPrompt as string) ?? ''}
          onChange={(val) => onChange('systemPrompt', val)}
          placeholder="You are a helpful assistant..."
          spellCheck={false}
        />
      </FieldGroup>

      <FieldGroup label="Response mode" helper="What to return after all downstream nodes complete.">
        <select
          style={selectStyle}
          value={(config.responseMode as string) ?? 'lastNode'}
          onChange={(e) => onChange('responseMode', e.target.value)}
        >
          <option value="lastNode">Last node output</option>
          <option value="allNodes">All node outputs (array)</option>
          <option value="stream">Stream (SSE)</option>
        </select>
      </FieldGroup>

      <FieldGroup label="Welcome message" helper="Shown to users when a new chat session starts. Leave empty to skip.">
        <input
          style={inputStyle}
          value={(config.welcomeMessage as string) ?? ''}
          onChange={(e) => onChange('welcomeMessage', e.target.value)}
          placeholder="Hello! How can I help you today?"
        />
      </FieldGroup>

      <FieldGroup label="Welcome text (legacy)" helper="Optional greeting returned when a new session starts. Leave empty to skip.">
        <textarea style={monoStyle} value={(config.welcomeText as string) ?? ''} onChange={(e) => onChange('welcomeText', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Response message" helper="Acknowledgment sent back after the message is accepted for processing.">
        <input style={inputStyle} value={(config.responseMessage as string) ?? 'Message accepted'} onChange={(e) => onChange('responseMessage', e.target.value)} />
      </FieldGroup>
      <LatestTriggerSample workflowId={savedWorkflowId} nodeId={nodeId} />
    </div>
  );
}

/* Schedule */
function SchedulePanel({ config, onChange }: PanelProps) {
  const mode = (config.mode as string) ?? 'interval';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Mode" helper="Interval repeats on a fixed cadence. Cron gives full control with a cron expression.">
        <select style={selectStyle} value={mode} onChange={(e) => onChange('mode', e.target.value)}>
          <option value="interval">Interval</option>
          <option value="cron">Cron</option>
        </select>
      </FieldGroup>
      {mode === 'cron' ? (
        <>
          <FieldGroup label="Cron expression" helper='Five fields: minute hour day-of-month month day-of-week. E.g. "0 9 * * 1" = 9am every Monday, "*/15 * * * *" = every 15 minutes.'>
            <input style={inputStyle} value={(config.cron as string) ?? '0 * * * *'} onChange={(e) => onChange('cron', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Timezone" helper='IANA timezone name. E.g. "America/New_York", "Europe/London". Defaults to UTC.'>
            <input style={inputStyle} value={(config.timezone as string) ?? 'UTC'} onChange={(e) => onChange('timezone', e.target.value)} />
          </FieldGroup>
        </>
      ) : (
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Every</label>
            <input type="number" min={1} style={inputStyle} value={(config.every as number) ?? 15}
              onChange={(e) => onChange('every', parseInt(e.target.value))} />
          </div>
          <div style={{ width: 120 }}>
            <label style={labelStyle}>Unit</label>
            <select style={selectStyle} value={(config.unit as string) ?? 'minutes'} onChange={(e) => onChange('unit', e.target.value)}>
              <option value="seconds">Seconds</option>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── HTTP Request ── */
type Header = { key: string; value: string };

function HttpRequestPanel({ config, onChange, issues = [] }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const headers = (config.headers as Header[]) ?? [];
  const authType = (config.authType as string) ?? 'none';
  const httpCredentials = credentials.filter((c) => ['api_key', 'bearer_token', 'basic', 'basic_auth', 'oauth2'].includes(c.type));
  const urlProps = customFieldProps(issues, 'url', 'Supports expressions from current input and upstream node outputs.', true);
  const bodyProps = customFieldProps(issues, 'body', 'Optional request body. Expressions are resolved before the request is sent.');

  const updateHeader = (i: number, field: 'key' | 'value', val: string) => {
    onChange('headers', headers.map((h, j) => j === i ? { ...h, [field]: val } : h));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Credential">
        <select
          style={selectStyle}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}
        >
          <option value="">No saved credential</option>
          {httpCredentials.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
          ))}
        </select>
      </FieldGroup>

      {/* Method + URL */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flexShrink: 0, width: '92px' }}>
          <label style={labelStyle}>Method</label>
          <select style={selectStyle} value={(config.method as string) ?? 'GET'}
            onChange={(e) => onChange('method', e.target.value)}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <FieldGroup label="URL" {...urlProps}>
            <ExpressionInput
              style={fieldInputStyle(Boolean(urlProps.error))}
              value={(config.url as string) ?? ''}
              placeholder="https://api.example.com/v1/..."
              onChange={(value) => onChange('url', value)}
            />
          </FieldGroup>
        </div>
      </div>

      {/* Headers */}
      <div>
        <label style={labelStyle}>Headers</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {headers.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Key" value={h.key}
                onChange={(e) => updateHeader(i, 'key', e.target.value)} />
              <ExpressionInput
                containerStyle={{ flex: 2 }}
                style={inputStyle}
                placeholder="Value"
                value={h.value}
                onChange={(value) => updateHeader(i, 'value', value)}
              />
              <button style={removeBtnStyle}
                onClick={() => onChange('headers', headers.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button style={addBtnStyle}
            onClick={() => onChange('headers', [...headers, { key: '', value: '' }])}>
            + Add header
          </button>
        </div>
      </div>

      {/* Auth */}
      <div>
        <label style={labelStyle}>Authentication</label>
        <select style={{ ...selectStyle, marginBottom: '8px' }} value={authType}
          onChange={(e) => onChange('authType', e.target.value)}>
          <option value="none">None</option>
          <option value="api_key">API Key</option>
          <option value="basic">Basic Auth</option>
          <option value="bearer">Bearer Token</option>
        </select>
        {authType === 'api_key' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <input style={inputStyle} placeholder="Header name (e.g. X-API-Key)"
              value={(config.authKey as string) ?? ''}
              onChange={(e) => onChange('authKey', e.target.value)} />
            <input style={inputStyle} placeholder="API key value"
              value={(config.authValue as string) ?? ''}
              onChange={(e) => onChange('authValue', e.target.value)} />
          </div>
        )}
        {authType === 'bearer' && (
          <input style={inputStyle} placeholder="Bearer token"
            value={(config.authValue as string) ?? ''}
            onChange={(e) => onChange('authValue', e.target.value)} />
        )}
        {authType === 'basic' && (
          <div style={{ display: 'flex', gap: '5px' }}>
            <input style={{ ...inputStyle, flex: 1 }} placeholder="Username"
              value={(config.authUsername as string) ?? ''}
              onChange={(e) => onChange('authUsername', e.target.value)} />
            <input style={{ ...inputStyle, flex: 1 }} type="password" placeholder="Password"
              value={(config.authPassword as string) ?? ''}
              onChange={(e) => onChange('authPassword', e.target.value)} />
          </div>
        )}
      </div>

      {/* Body */}
      <FieldGroup label="Body" {...bodyProps}>
        <ExpressionTextarea
          style={fieldInputStyle(Boolean(bodyProps.error), monoStyle)}
          value={(config.body as string) ?? ''}
          placeholder='{ "key": "value" }'
          onChange={(value) => onChange('body', value)}
        />
      </FieldGroup>
    </div>
  );
}

/* ── LLM Call ── */
function LlmCallPanel({ config, onChange, issues = [] }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const provider    = (config.provider    as string) ?? 'openai';
  const apiKey      = (config.apiKey      as string) ?? '';
  const model       = (config.model       as string) ?? '';
  const temperature = (config.temperature as number) ?? 0.7;
  const providerCredentials = credentials.filter((c) => c.type === provider || c.type === 'api_key');
  const systemPromptProps = customFieldProps(issues, 'systemPrompt', 'Optional system instructions. Data expressions are resolved before the LLM call.');
  const userPromptProps = customFieldProps(issues, 'userPrompt', 'Use expressions to insert fields from the current item or upstream nodes.', true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Provider */}
      <FieldGroup label="Provider">
        <select style={selectStyle} value={provider}
          onChange={(e) => onChange('provider', e.target.value)}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="openrouter">OpenRouter</option>
        </select>
      </FieldGroup>

      <FieldGroup label="Credential" helper="Manage credentials on the Credentials page. Keys are encrypted and never exposed here.">
        <select
          style={selectStyle}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}
        >
          <option value="">No credential (use server env var)</option>
          {providerCredentials.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
          ))}
        </select>
      </FieldGroup>

      {/* Model — dynamic dropdown (no inline key needed) */}
      <FieldGroup label="Model">
        <ModelSelect
          provider={provider}
          value={model}
          onChange={(v) => onChange('model', v)}
        />
      </FieldGroup>

      {/* System Prompt */}
      <FieldGroup label="System Prompt" {...systemPromptProps}>
        <ExpressionTextarea
          style={fieldInputStyle(Boolean(systemPromptProps.error), monoStyle)}
          value={(config.systemPrompt as string) ?? ''}
          placeholder="You are a helpful assistant."
          onChange={(value) => onChange('systemPrompt', value)}
        />
      </FieldGroup>

      {/* User Prompt */}
      <FieldGroup label="User Prompt" {...userPromptProps}>
        <ExpressionTextarea
          style={fieldInputStyle(Boolean(userPromptProps.error), monoStyle)}
          value={(config.userPrompt as string) ?? ''}
          placeholder="{{ input.message }}"
          onChange={(value) => onChange('userPrompt', value)}
        />
      </FieldGroup>

      {/* Temperature */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Temperature</label>
          <span style={{ fontSize: '11px', fontFamily: 'Geist Mono', color: 'var(--text-secondary)' }}>
            {temperature.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min="0" max="1" step="0.01"
          value={temperature}
          onChange={(e) => onChange('temperature', parseFloat(e.target.value))}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Precise</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Creative</span>
        </div>
      </div>

      {/* Max Tokens */}
      <FieldGroup label="Max Tokens">
        <input type="number" style={inputStyle} value={(config.maxTokens as number) ?? 1000}
          onChange={(e) => onChange('maxTokens', parseInt(e.target.value))} />
      </FieldGroup>
    </div>
  );
}

/* ── IF Condition ── */
type Condition = { left: string; operator: string; right: string };

const IF_OPS = ['==', '!=', '>', '<', '>=', '<=', 'contains', 'startsWith', 'endsWith', 'isEmpty'];

function IfConditionPanel({ config, onChange, issues = [] }: PanelProps) {
  const conditions = (config.conditions as Condition[]) ?? [];
  const combinator = (config.combinator as string) ?? 'and';
  const conditionProps = customFieldProps(issues, 'conditions', 'Use expressions or data paths on either side of the comparison.');

  const updateCond = (i: number, field: keyof Condition, val: string) => {
    onChange('conditions', conditions.map((c, j) => j === i ? { ...c, [field]: val } : c));
  };

  const needsValue = (op: string) => !['isEmpty', 'isNotEmpty'].includes(op);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {conditionProps.error || conditionProps.helper ? (
        <div style={{
          color: conditionProps.error ? 'var(--node-error)' : 'var(--text-muted)',
          fontSize: '11px',
          lineHeight: 1.4,
        }}>
          {conditionProps.error ?? conditionProps.helper}
        </div>
      ) : null}
      {conditions.map((cond, i) => (
        <div key={i}>
          {i > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <button
                onClick={() => onChange('combinator', combinator === 'and' ? 'or' : 'and')}
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-input)',
                  background: 'var(--bg-input)',
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  fontFamily: "'Inter'",
                }}
              >
                {combinator.toUpperCase()}
              </button>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>
          )}
          <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
              <ExpressionInput
                value={cond.left}
                placeholder="field.path or {{ input.field }}"
                onChange={(value) => updateCond(i, 'left', value)}
              />
              <select style={selectStyle} value={cond.operator}
                onChange={(e) => updateCond(i, 'operator', e.target.value)}>
                {IF_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              {needsValue(cond.operator) && (
                <ExpressionInput
                  value={cond.right}
                  placeholder="value or {{ input.value }}"
                  onChange={(value) => updateCond(i, 'right', value)}
                />
              )}
            </div>
            <button style={{ ...removeBtnStyle, marginTop: '7px' }}
              onClick={() => onChange('conditions', conditions.filter((_, j) => j !== i))}>×</button>
          </div>
        </div>
      ))}
      <button style={addBtnStyle}
        onClick={() => onChange('conditions', [...conditions, { left: '', operator: '==', right: '' }])}>
        + Add condition
      </button>
    </div>
  );
}

/* ── Merge ── */
function MergePanel({ config, onChange }: PanelProps) {
  return (
    <FieldGroup label="Mode">
      <select style={selectStyle} value={(config.mode as string) ?? 'merge-object'}
        onChange={(e) => onChange('mode', e.target.value)}>
        <option value="merge-object">Merge Object — combine all inputs into one object</option>
        <option value="collect-array">Collect Array — gather inputs as array items</option>
      </select>
    </FieldGroup>
  );
}

/* ── Set / Transform ── */
type Assignment = { key: string; value: string };

function SetPanel({ config, onChange, issues = [] }: PanelProps) {
  const assignments = (config.assignments as Assignment[]) ?? [];
  const assignmentProps = customFieldProps(issues, 'assignments', 'Set static values or insert expressions from execution data.');

  const update = (i: number, field: 'key' | 'value', val: string) => {
    onChange('assignments', assignments.map((a, j) => j === i ? { ...a, [field]: val } : a));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Mode">
        <select style={selectStyle} value={(config.mode as string) ?? 'set'}
          onChange={(e) => onChange('mode', e.target.value)}>
          <option value="set">Set only — output only assigned fields</option>
          <option value="merge">Merge — merge onto input object</option>
        </select>
      </FieldGroup>

      <div>
        <label style={labelStyle}>Assignments</label>
        {assignmentProps.error || assignmentProps.helper ? (
          <div style={{
            marginBottom: '6px',
            color: assignmentProps.error ? 'var(--node-error)' : 'var(--text-muted)',
            fontSize: '11px',
            lineHeight: 1.35,
          }}>
            {assignmentProps.error ?? assignmentProps.helper}
          </div>
        ) : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {assignments.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: '5px', alignItems: 'flex-start' }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="output.key" value={a.key}
                onChange={(e) => update(i, 'key', e.target.value)} />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}>→</span>
              <ExpressionInput
                containerStyle={{ flex: 2 }}
                style={fieldInputStyle(Boolean(assignmentProps.error))}
                placeholder="{{ input.field }}"
                value={a.value}
                onChange={(value) => update(i, 'value', value)}
              />
              <button style={removeBtnStyle}
                onClick={() => onChange('assignments', assignments.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button style={addBtnStyle}
            onClick={() => onChange('assignments', [...assignments, { key: '', value: '' }])}>
            + Add field
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Delay ── */
function DelayPanel({ config, onChange }: PanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Amount</label>
          <input type="number" style={inputStyle} min={0}
            value={(config.amount as number) ?? 1}
            onChange={(e) => onChange('amount', parseFloat(e.target.value))} />
        </div>
        <div style={{ width: '90px' }}>
          <label style={labelStyle}>Unit</label>
          <select style={selectStyle} value={(config.unit as string) ?? 's'}
            onChange={(e) => onChange('unit', e.target.value)}>
            <option value="ms">ms</option>
            <option value="s">s</option>
            <option value="m">m</option>
          </select>
        </div>
      </div>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        Max 5 minutes. Input passes through unchanged.
      </p>
    </div>
  );
}

/* ── Stop and Error ── */
function StopErrorPanel({ config, onChange }: PanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Error message">
        <ExpressionTextarea
          style={monoStyle}
          value={(config.message as string) ?? ''}
          placeholder="Something went wrong"
          onChange={(value) => onChange('message', value)}
        />
      </FieldGroup>
      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        Execution halts immediately and the workflow is marked as failed with this message.
      </p>
    </div>
  );
}

/* ── Filter ── */
function FilterPanel({ config, onChange, issues = [] }: PanelProps) {
  return <IfConditionPanel config={config} onChange={onChange} issues={issues} />;
}

/* ── Loop ── */
function LoopPanel({ config, onChange, issues = [] }: PanelProps) {
  const overProps = customFieldProps(issues, 'over', 'Dot-path or expression that resolves to the array to iterate over.', true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Array path" {...overProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(overProps.error))}
          value={(config.over as string) ?? ''}
          placeholder="input.items or {{ input.results }}"
          onChange={(value) => onChange('over', value)}
        />
      </FieldGroup>
      <FieldGroup label="Max iterations">
        <input type="number" style={inputStyle} min={1} max={1000}
          value={(config.limit as number) ?? 100}
          onChange={(e) => onChange('limit', parseInt(e.target.value))} />
      </FieldGroup>
    </div>
  );
}

/* ── Sub-workflow ── */
function SubWorkflowPanel({ config, onChange }: PanelProps) {
  const workflowList = useStore((s) => s.workflowList);
  const inputMode = (config.inputMode as string) ?? 'forward';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Workflow" helper="Workflow to call as a sub-workflow. Max recursion depth: 5.">
        {workflowList.length > 0 ? (
          <select style={selectStyle}
            value={(config.workflowId as string) ?? ''}
            onChange={(e) => onChange('workflowId', e.target.value)}>
            <option value="">Select a workflow…</option>
            {workflowList.map((wf) => (
              <option key={wf.id} value={wf.id}>{wf.name}</option>
            ))}
          </select>
        ) : (
          <ExpressionInput style={inputStyle}
            value={(config.workflowId as string) ?? ''}
            placeholder="Workflow ID (UUID)"
            onChange={(v) => onChange('workflowId', v)} />
        )}
      </FieldGroup>

      <FieldGroup label="Input mapping" helper="How data from this node's input is passed to the sub-workflow trigger.">
        <select style={selectStyle} value={inputMode}
          onChange={(e) => onChange('inputMode', e.target.value)}>
          <option value="forward">Forward all input (default)</option>
          <option value="none">No input (empty object)</option>
          <option value="map">Custom JSON mapping</option>
        </select>
      </FieldGroup>

      {inputMode === 'map' && (
        <FieldGroup
          label="Input map (JSON)"
          helper='JSON object mapping field names to values. Expressions like {{ input.field }} are resolved before passing.'
        >
          <ExpressionTextarea
            style={{ ...inputStyle, ...monoStyle, minHeight: '80px' }}
            value={(config.inputMap as string) ?? '{}'}
            placeholder={'{\n  "name": "{{ input.name }}",\n  "id": "{{ input.id }}"\n}'}
            spellCheck={false}
            onChange={(v) => onChange('inputMap', v)}
          />
        </FieldGroup>
      )}
    </div>
  );
}

/* ── Send Email ── */
function SendEmailPanel({ config, onChange, issues = [] }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const toProps = customFieldProps(issues, 'to', 'Recipient address. Expressions are resolved before sending.', true);
  const subjectProps = customFieldProps(issues, 'subject', 'Subject can include fields from the current item.', true);
  const bodyProps = customFieldProps(issues, 'body', 'Email body can include expressions from current or upstream data.', true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Credential">
        <select style={selectStyle}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}>
          <option value="">Use env SMTP config</option>
          {credentials.filter((c) => ['smtp', 'resend'].includes(c.type)).map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="To" {...toProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(toProps.error))}
          value={(config.to as string) ?? ''}
          placeholder="{{ input.email }}"
          onChange={(value) => onChange('to', value)}
        />
      </FieldGroup>
      <FieldGroup label="Subject" {...subjectProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(subjectProps.error))}
          value={(config.subject as string) ?? ''}
          placeholder="{{ input.subject }}"
          onChange={(value) => onChange('subject', value)}
        />
      </FieldGroup>
      <FieldGroup label="Body" {...bodyProps}>
        <ExpressionTextarea
          style={fieldInputStyle(Boolean(bodyProps.error), monoStyle)}
          value={(config.body as string) ?? ''}
          placeholder="Hello {{ input.name }},&#10;&#10;…"
          onChange={(value) => onChange('body', value)}
        />
      </FieldGroup>
    </div>
  );
}

/* ── Postgres Query ── */
function PostgresQueryPanel({ config, onChange, issues = [] }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const queryProps = customFieldProps(issues, 'query', 'SQL statement. Use parameters for user data when possible.', true);
  const paramsProps = customFieldProps(issues, 'params', 'JSON array for $1, $2, and later placeholders. Values can include expressions.');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Credential">
        <select style={selectStyle}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}>
          <option value="">Use DATABASE_URL env</option>
          {credentials.filter((c) => c.type === 'postgres').map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="SQL" {...queryProps}>
        <ExpressionTextarea
          style={fieldInputStyle(Boolean(queryProps.error), { ...monoStyle, minHeight: '100px' })}
          value={(config.query as string) ?? ''}
          placeholder="SELECT * FROM users WHERE id = $1"
          onChange={(value) => onChange('query', value)}
        />
      </FieldGroup>
      <FieldGroup label="Params (JSON array)" {...paramsProps}>
        <ExpressionTextarea
          style={fieldInputStyle(Boolean(paramsProps.error), { ...monoStyle, minHeight: '50px' })}
          value={(config.params as string) ?? '[]'}
          placeholder='["{{ input.userId }}"]'
          onChange={(value) => onChange('params', value)}
        />
      </FieldGroup>
    </div>
  );
}

/* ── Redis Get ── */
function RedisGetPanel({ config, onChange, issues = [] }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const redisCredentials = credentials.filter((c) => c.type === 'redis');
  const keyProps = customFieldProps(issues, 'key', 'Redis key. Expressions are resolved before lookup.', true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Credential">
        <select style={selectStyle}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}>
          <option value="">Use REDIS_URL env</option>
          {redisCredentials.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Key" {...keyProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(keyProps.error))}
          value={(config.key as string) ?? ''}
          placeholder="{{ input.userId }}"
          onChange={(value) => onChange('key', value)}
        />
      </FieldGroup>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
        Supports {'{{ }}'} expressions. Returns &#123; key, value, found &#125;.
      </span>
    </div>
  );
}

/* ── Redis Set ── */
function RedisSetPanel({ config, onChange, issues = [] }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const redisCredentials = credentials.filter((c) => c.type === 'redis');
  const keyProps = customFieldProps(issues, 'key', 'Redis key. Expressions are resolved before write.', true);
  const valueProps = customFieldProps(issues, 'value', 'Value to store. Use expressions to write item or node output data.', true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Credential">
        <select style={selectStyle}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}>
          <option value="">Use REDIS_URL env</option>
          {redisCredentials.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Key" {...keyProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(keyProps.error))}
          value={(config.key as string) ?? ''}
          placeholder="{{ input.sessionId }}"
          onChange={(value) => onChange('key', value)}
        />
      </FieldGroup>
      <FieldGroup label="Value" {...valueProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(valueProps.error))}
          value={(config.value as string) ?? ''}
          placeholder="{{ input.data }}"
          onChange={(value) => onChange('value', value)}
        />
      </FieldGroup>
      <div>
        <label style={labelStyle}>TTL (seconds)</label>
        <input type="number" style={inputStyle} min={0}
          value={(config.ttl as number) ?? ''}
          placeholder="Leave empty for no expiry"
          onChange={(e) => onChange('ttl', e.target.value ? parseInt(e.target.value) : null)} />
      </div>
    </div>
  );
}

/* ── AI Agent ── */
function AiAgentPanel({ config, onChange, issues = [] }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const provider = (config.provider as string) ?? 'openai';
  const tools = (config.tools as AgentTool[]) ?? [];
  const systemPromptProps = customFieldProps(issues, 'systemPrompt', 'Agent instructions can reference current item or upstream node data.', true);
  const TOOL_TYPES = [
    'http_request',
    'slack_send_message',
    'github_api',
    'notion_api',
    'graphql_request',
    'csv_parse',
    'csv_stringify',
    'xml_parse',
    'xml_stringify',
    'html_extract',
    'json_transform',
    'compression',
    'postgres_query',
    'redis_get',
    'list_files',
    'binary_metadata',
    'code',
    'datetime',
    'crypto',
    'memory_read',
    'memory_write',
    'vector_search',
  ];
  const providerCredentials = credentials.filter((c) => c.type === provider || c.type === 'api_key');

  const updateTool = (i: number, field: keyof AgentTool, val: string) => {
    onChange('tools', tools.map((t, j) => j === i ? { ...t, [field]: val } : t));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Provider">
        <select style={selectStyle} value={provider}
          onChange={(e) => onChange('provider', e.target.value)}>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="openrouter">OpenRouter</option>
        </select>
      </FieldGroup>
      <FieldGroup label="Credential">
        <select
          style={selectStyle}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}
        >
          <option value="">Use env provider key</option>
          {providerCredentials.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Model">
        <input style={inputStyle} value={(config.model as string) ?? 'gpt-4o'}
          onChange={(e) => onChange('model', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="System Prompt" {...systemPromptProps}>
        <ExpressionTextarea
          style={fieldInputStyle(Boolean(systemPromptProps.error), { ...monoStyle, minHeight: '80px' })}
          value={(config.systemPrompt as string) ?? ''}
          placeholder="You are a helpful assistant."
          onChange={(value) => onChange('systemPrompt', value)}
        />
      </FieldGroup>
      <FieldGroup label="Max Steps">
        <input type="number" style={inputStyle} min={1} max={100}
          value={(config.maxSteps as number) ?? 20}
          onChange={(e) => onChange('maxSteps', parseInt(e.target.value))} />
      </FieldGroup>

      <div>
        <label style={labelStyle}>Tools</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tools.map((tool, i) => (
            <div key={tool.id} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <input style={{ ...inputStyle, flex: 2 }} placeholder="Tool name"
                value={tool.name}
                onChange={(e) => updateTool(i, 'name', e.target.value)} />
              <select style={{ ...selectStyle, flex: 1 }}
                value={tool.type}
                onChange={(e) => updateTool(i, 'type', e.target.value)}>
                {TOOL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button style={removeBtnStyle}
                onClick={() => onChange('tools', tools.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          <button style={addBtnStyle}
            onClick={() => onChange('tools', [...tools, { id: crypto.randomUUID().slice(0, 8), name: '', type: 'http_request' }])}>
            + Add tool
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Vector Search ── */
function OpenAiCredentialSelect({ config, onChange, emptyLabel }: PanelProps & { emptyLabel: string }) {
  const credentials = useStore((s) => s.credentials);
  const openAiCredentials = credentials.filter((c) => c.type === 'openai' || c.type === 'api_key');
  return (
    <FieldGroup label="Credential">
      <select
        style={selectStyle}
        value={(config.credentialId as string) ?? ''}
        onChange={(e) => onChange('credentialId', e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {openAiCredentials.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
        ))}
      </select>
    </FieldGroup>
  );
}

function MemoryReadPanel({ config, onChange, issues = [] }: PanelProps) {
  const mode = (config.mode as string) ?? 'semantic';
  const queryProps = customFieldProps(issues, 'query', 'Search text for semantic memory lookup.', mode === 'semantic' || mode === 'all');
  const sessionIdProps = customFieldProps(issues, 'sessionId', 'Session key for interaction or summary memory lookup.', mode === 'session' || mode === 'summary' || mode === 'all');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <OpenAiCredentialSelect config={config} onChange={onChange} emptyLabel="Use OPENAI_API_KEY env" />
      <FieldGroup label="Mode">
        <select style={selectStyle} value={mode} onChange={(e) => onChange('mode', e.target.value)}>
          <option value="semantic">Semantic patterns</option>
          <option value="session">Session interactions</option>
          <option value="summary">Session summary</option>
          <option value="all">All memory</option>
        </select>
      </FieldGroup>
      {(mode === 'semantic' || mode === 'all') && (
        <>
          <FieldGroup label="Query" {...queryProps}>
            <ExpressionInput
              style={fieldInputStyle(Boolean(queryProps.error))}
              value={(config.query as string) ?? ''}
              placeholder="{{ input.text }}"
              onChange={(value) => onChange('query', value)}
            />
          </FieldGroup>
          <FieldGroup label="Category">
            <input style={inputStyle} value={(config.category as string) ?? ''} placeholder="general"
              onChange={(e) => onChange('category', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Min score">
            <input type="number" min={0} max={1} step={0.05} style={inputStyle}
              value={(config.minScore as number) ?? 0}
              onChange={(e) => onChange('minScore', parseFloat(e.target.value))} />
          </FieldGroup>
        </>
      )}
      {(mode === 'session' || mode === 'summary' || mode === 'all') && (
        <FieldGroup label="Session ID" {...sessionIdProps}>
          <ExpressionInput
            style={fieldInputStyle(Boolean(sessionIdProps.error))}
            value={(config.sessionId as string) ?? ''}
            placeholder="{{ input.sessionId }}"
            onChange={(value) => onChange('sessionId', value)}
          />
        </FieldGroup>
      )}
      <FieldGroup label="Limit">
        <input type="number" min={1} max={50} style={inputStyle}
          value={(config.topK as number) ?? 5}
          onChange={(e) => onChange('topK', parseInt(e.target.value))} />
      </FieldGroup>
    </div>
  );
}

function MemoryWritePanel({ config, onChange, issues = [] }: PanelProps) {
  const mode = (config.mode as string) ?? 'pattern';
  const contentProps = customFieldProps(issues, 'content', 'Pattern content to store. Expressions are resolved before writing.', mode === 'pattern');
  const sessionIdProps = customFieldProps(issues, 'sessionId', 'Session key for interaction or summary memory.', mode === 'interaction' || mode === 'summary');
  const inputTextProps = customFieldProps(issues, 'inputText', 'Interaction input text. Usually the user message or question.', mode === 'interaction');
  const outputTextProps = customFieldProps(issues, 'outputText', 'Interaction output text. Usually the model or workflow answer.', mode === 'interaction');
  const summaryProps = customFieldProps(issues, 'summary', 'Summary text to store for this session.', mode === 'summary');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <OpenAiCredentialSelect config={config} onChange={onChange} emptyLabel="Use OPENAI_API_KEY env" />
      <FieldGroup label="Mode">
        <select style={selectStyle} value={mode} onChange={(e) => onChange('mode', e.target.value)}>
          <option value="pattern">Pattern</option>
          <option value="interaction">Interaction</option>
          <option value="summary">Summary</option>
        </select>
      </FieldGroup>
      {mode === 'pattern' && (
        <>
          <FieldGroup label="Content" {...contentProps}>
            <ExpressionTextarea
              style={fieldInputStyle(Boolean(contentProps.error), monoStyle)}
              value={(config.content as string) ?? ''}
              placeholder="{{ input.text }}"
              onChange={(value) => onChange('content', value)}
            />
          </FieldGroup>
          <FieldGroup label="Category">
            <input style={inputStyle} value={(config.category as string) ?? 'general'}
              onChange={(e) => onChange('category', e.target.value)} />
          </FieldGroup>
        </>
      )}
      {mode === 'interaction' && (
        <>
          <FieldGroup label="Session ID" {...sessionIdProps}>
            <ExpressionInput
              style={fieldInputStyle(Boolean(sessionIdProps.error))}
              value={(config.sessionId as string) ?? ''}
              placeholder="{{ input.sessionId }}"
              onChange={(value) => onChange('sessionId', value)}
            />
          </FieldGroup>
          <FieldGroup label="Input text" {...inputTextProps}>
            <ExpressionTextarea
              style={fieldInputStyle(Boolean(inputTextProps.error), monoStyle)}
              value={(config.inputText as string) ?? ''}
              placeholder="{{ input.question }}"
              onChange={(value) => onChange('inputText', value)}
            />
          </FieldGroup>
          <FieldGroup label="Output text" {...outputTextProps}>
            <ExpressionTextarea
              style={fieldInputStyle(Boolean(outputTextProps.error), monoStyle)}
              value={(config.outputText as string) ?? ''}
              placeholder="{{ input.answer }}"
              onChange={(value) => onChange('outputText', value)}
            />
          </FieldGroup>
        </>
      )}
      {mode === 'summary' && (
        <>
          <FieldGroup label="Session ID" {...sessionIdProps}>
            <ExpressionInput
              style={fieldInputStyle(Boolean(sessionIdProps.error))}
              value={(config.sessionId as string) ?? ''}
              placeholder="{{ input.sessionId }}"
              onChange={(value) => onChange('sessionId', value)}
            />
          </FieldGroup>
          <FieldGroup label="Summary" {...summaryProps}>
            <ExpressionTextarea
              style={fieldInputStyle(Boolean(summaryProps.error), monoStyle)}
              value={(config.summary as string) ?? ''}
              placeholder="{{ input.summary }}"
              onChange={(value) => onChange('summary', value)}
            />
          </FieldGroup>
        </>
      )}
      <FieldGroup label="Confidence">
        <input type="number" min={0} max={1} step={0.05} style={inputStyle}
          value={(config.confidence as number) ?? 1}
          onChange={(e) => onChange('confidence', parseFloat(e.target.value))} />
      </FieldGroup>
    </div>
  );
}

function VectorSearchPanel({ config, onChange, issues = [] }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const openAiCredentials = credentials.filter((c) => c.type === 'openai' || c.type === 'api_key');
  const queryProps = customFieldProps(issues, 'query', 'Search query text. Expressions are resolved before embedding.', true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Credential">
        <select
          style={selectStyle}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}
        >
          <option value="">Use OPENAI_API_KEY env</option>
          {openAiCredentials.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
          ))}
        </select>
      </FieldGroup>
      <FieldGroup label="Query" {...queryProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(queryProps.error))}
          value={(config.query as string) ?? ''}
          placeholder="{{ input.question }}"
          onChange={(value) => onChange('query', value)}
        />
      </FieldGroup>
      <FieldGroup label="Collection">
        <input style={inputStyle} value={(config.collection as string) ?? 'memory_patterns'}
          onChange={(e) => onChange('collection', e.target.value)} />
      </FieldGroup>
      <FieldGroup label="Top K">
        <input type="number" style={inputStyle} min={1} max={100}
          value={(config.topK as number) ?? 10}
          onChange={(e) => onChange('topK', parseInt(e.target.value))} />
      </FieldGroup>
      <FieldGroup label="Min Score (0–1)">
        <input type="number" style={inputStyle} min={0} max={1} step={0.05}
          value={(config.minScore as number) ?? 0.7}
          onChange={(e) => onChange('minScore', parseFloat(e.target.value))} />
      </FieldGroup>
    </div>
  );
}

/* ── Language metadata for the Code node ── */
const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript',  monacoLang: 'javascript', defaultVersion: '18.x'    },
  { value: 'typescript', label: 'TypeScript',  monacoLang: 'typescript', defaultVersion: '5.x'     },
  { value: 'python',     label: 'Python',      monacoLang: 'python',     defaultVersion: '3.11.x'  },
  { value: 'bash',       label: 'Bash',        monacoLang: 'shell',      defaultVersion: '5.x'     },
  { value: 'go',         label: 'Go',          monacoLang: 'go',         defaultVersion: '1.16.2'  },
  { value: 'ruby',       label: 'Ruby',        monacoLang: 'ruby',       defaultVersion: '3.3.0'   },
  { value: 'rust',       label: 'Rust',        monacoLang: 'rust',       defaultVersion: '1.73.0'  },
  { value: 'php',        label: 'PHP',         monacoLang: 'php',        defaultVersion: '8.2.3'   },
  { value: 'c',          label: 'C',           monacoLang: 'c',          defaultVersion: '10.2.0'  },
  { value: 'cpp',        label: 'C++',         monacoLang: 'cpp',        defaultVersion: '10.2.0'  },
];

const STDIN_HINT: Record<string, string> = {
  javascript: 'input object is available directly. Return any value to pass it downstream.',
  typescript: 'input object is available directly. Return any value to pass it downstream.',
  python:     'Read JSON from stdin: import sys, json; data = json.load(sys.stdin)',
  bash:       'Read JSON from stdin: DATA=$(cat); echo "$DATA" | jq .',
  go:         'Read stdin: json.NewDecoder(os.Stdin).Decode(&input)',
  ruby:       'Read stdin: require "json"; input = JSON.parse($stdin.read)',
  rust:       'Read stdin: serde_json::from_reader(std::io::stdin())',
  php:        'Read stdin: $input = json_decode(file_get_contents("php://stdin"), true);',
  c:          'Read stdin with fgets/scanf; data arrives as JSON text.',
  cpp:        'Read stdin with std::cin; data arrives as JSON text.',
};

/* Code */
function CodePanel({ config, onChange, issues = [] }: PanelProps) {
  const language = (config.language as string) ?? 'javascript';
  const langMeta = LANGUAGES.find((l) => l.value === language) ?? LANGUAGES[0];
  const [expanded, setExpanded] = useState(false);
  const codeError = issues.find((i) => i.field === 'code' && i.severity === 'error')?.message ?? null;

  // Reactively track the app theme so Monaco switches when the user toggles dark/light
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light'
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  const monacoTheme = isDark ? 'vs-dark' : 'vs';
  const editorBg = isDark ? '#1e1e1e' : '#ffffff';

  const sharedOptions = {
    fontSize: 13,
    fontFamily: 'Geist Mono, JetBrains Mono, Menlo, monospace',
    lineNumbers: 'on' as const,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on' as const,
    tabSize: 2,
    automaticLayout: true,
    overviewRulerLanes: 0,
    renderLineHighlight: 'line' as const,
    bracketPairColorization: { enabled: true },
    scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
  };

  return (
    <>
      {/* ── Expanded overlay ─────────────────────────────────────── */}
      {expanded && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 2000,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setExpanded(false); }}
        >
          <div style={{
            width: 'min(900px, 90vw)',
            background: 'var(--bg-panel)',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          }}>
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              background: 'var(--bg-input)',
            }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  style={{ ...selectStyle, width: 'auto', fontSize: '12px' }}
                  value={language}
                  onChange={(e) => {
                    const next = LANGUAGES.find((l) => l.value === e.target.value) ?? LANGUAGES[0];
                    onChange('language', next.value);
                    onChange('version', next.defaultVersion);
                  }}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'Geist Mono' }}>
                  {(config.version as string) ?? langMeta.defaultVersion}
                </span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', fontSize: '13px',
                  padding: '4px 8px', borderRadius: '4px',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                ✕ Close
              </button>
            </div>
            {/* Full Monaco */}
            <div style={{ background: editorBg }}>
              <MonacoEditor
                height="65vh"
                language={langMeta.monacoLang}
                theme={monacoTheme}
                value={(config.code as string) ?? ''}
                onChange={(value) => onChange('code', value ?? '')}
                options={{ ...sharedOptions, padding: { top: 12, bottom: 12 } }}
              />
            </div>
            {/* Modal footer hint */}
            <div style={{
              padding: '8px 14px', borderTop: '1px solid var(--border)',
              fontSize: '11px', color: 'var(--text-secondary)',
              background: 'var(--bg-input)',
            }}>
              {STDIN_HINT[language] ?? 'JSON data is passed via stdin.'}
            </div>
          </div>
        </div>
      )}

      {/* ── Compact inline panel ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* Language + Version */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Language</label>
            <select
              style={selectStyle}
              value={language}
              onChange={(e) => {
                const next = LANGUAGES.find((l) => l.value === e.target.value) ?? LANGUAGES[0];
                onChange('language', next.value);
                onChange('version', next.defaultVersion);
              }}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div style={{ width: 96 }}>
            <label style={labelStyle}>Version</label>
            <input
              style={inputStyle}
              value={(config.version as string) ?? langMeta.defaultVersion}
              onChange={(e) => onChange('version', e.target.value)}
            />
          </div>
        </div>

        {/* Code editor */}
        <div>
          <label style={{ ...labelStyle, marginBottom: '6px' }}>
            Code
            {codeError && (
              <span style={{ marginLeft: 6, color: 'var(--color-error, #f87171)', fontWeight: 400 }}>{codeError}</span>
            )}
          </label>
          <div style={{ position: 'relative' }}>
            <div style={{
              border: codeError ? '1px solid var(--color-error, #f87171)' : '1px solid var(--border)',
              borderRadius: '6px',
              overflow: 'hidden',
              background: editorBg,
            }}>
              <MonacoEditor
                height="160px"
                language={langMeta.monacoLang}
                theme={monacoTheme}
                value={(config.code as string) ?? ''}
                onChange={(value) => onChange('code', value ?? '')}
                options={{ ...sharedOptions, padding: { top: 8, bottom: 8 } }}
              />
            </div>
            {/* Expand button — bottom-right corner */}
            <button
              title="Expand editor"
              onClick={() => setExpanded(true)}
              style={{
                position: 'absolute', bottom: '6px', right: '6px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '2px 6px',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                lineHeight: 1,
                opacity: 0.8,
                zIndex: 10,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
            >
              ↗
            </button>
          </div>
          {/* Compact stdin hint below editor */}
          <p style={{ margin: '4px 0 0', fontSize: '10.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {STDIN_HINT[language] ?? 'JSON data is passed via stdin.'}
          </p>
        </div>

        {/* Timeout + Memory */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Timeout ms</label>
            <input type="number" min={100} max={30000} style={inputStyle}
              value={(config.timeoutMs as number) ?? 5000}
              onChange={(e) => onChange('timeoutMs', parseInt(e.target.value))} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Memory MB</label>
            <input type="number" min={16} max={512} style={inputStyle}
              value={(config.memoryLimitMb as number) ?? 128}
              onChange={(e) => onChange('memoryLimitMb', parseInt(e.target.value))} />
          </div>
        </div>
      </div>
    </>
  );
}

/* ── Notion API ── */
function NotionApiPanel({ config, onChange }: PanelProps) {
  const credentials = useStore((s) => s.credentials);
  const operation = (config.operation as string) ?? 'generic';
  const notionCreds = credentials.filter((c) => ['api_key', 'bearer_token', 'oauth2'].includes(c.type));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Credential" helper="Notion integration token.">
        <select style={selectStyle} value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}>
          <option value="">No saved credential</option>
          {notionCreds.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
        </select>
      </FieldGroup>

      <FieldGroup label="Operation">
        <select style={selectStyle} value={operation}
          onChange={(e) => onChange('operation', e.target.value)}>
          <option value="generic">Generic (method + path)</option>
          <option value="create_page">Create page</option>
          <option value="get_page">Get page</option>
          <option value="update_page">Update page</option>
          <option value="list_pages">List pages (query DB)</option>
          <option value="search">Search</option>
        </select>
      </FieldGroup>

      {['get_page', 'update_page'].includes(operation) && (
        <FieldGroup label="Page ID" required helper="Notion page UUID.">
          <ExpressionInput style={inputStyle} value={(config.pageId as string) ?? ''}
            placeholder="{{ input.pageId }}" onChange={(v) => onChange('pageId', v)} />
        </FieldGroup>
      )}

      {operation === 'create_page' && <>
        <FieldGroup label="Parent type">
          <select style={selectStyle} value={(config.parentType as string) ?? 'page'}
            onChange={(e) => onChange('parentType', e.target.value)}>
            <option value="page">Page</option>
            <option value="database">Database</option>
          </select>
        </FieldGroup>
        <FieldGroup label="Parent ID" required helper="ID of the parent page or database.">
          <ExpressionInput style={inputStyle} value={(config.parentId as string) ?? ''}
            placeholder="{{ input.parentId }}" onChange={(v) => onChange('parentId', v)} />
        </FieldGroup>
        <FieldGroup label="Title">
          <ExpressionInput style={inputStyle} value={(config.title as string) ?? ''}
            placeholder="New page" onChange={(v) => onChange('title', v)} />
        </FieldGroup>
        <FieldGroup label="Content" helper="Plain text paragraph added as the first block.">
          <ExpressionTextarea style={inputStyle} value={(config.content as string) ?? ''}
            placeholder="Page content…" onChange={(v) => onChange('content', v)} />
        </FieldGroup>
      </>}

      {operation === 'update_page' && (
        <FieldGroup label="Properties (JSON)" helper='Notion properties object. Example: {"Name":{"title":[{"text":{"content":"Title"}}]}}'>
          <ExpressionTextarea style={{ ...inputStyle, ...monoStyle }} spellCheck={false}
            value={(config.properties as string) ?? '{}'} onChange={(v) => onChange('properties', v)} />
        </FieldGroup>
      )}

      {operation === 'list_pages' && <>
        <FieldGroup label="Database ID" required>
          <ExpressionInput style={inputStyle} value={(config.databaseId as string) ?? ''}
            placeholder="{{ input.databaseId }}" onChange={(v) => onChange('databaseId', v)} />
        </FieldGroup>
        <FieldGroup label="Filter (JSON)" helper="Optional Notion filter object.">
          <ExpressionTextarea style={{ ...inputStyle, ...monoStyle }} spellCheck={false}
            value={(config.filter as string) ?? ''} placeholder="{}" onChange={(v) => onChange('filter', v)} />
        </FieldGroup>
        <FieldGroup label="Page size" helper="Max 100.">
          <input type="number" style={inputStyle} value={(config.pageSize as number) ?? 20} min={1} max={100}
            onChange={(e) => onChange('pageSize', parseInt(e.target.value))} />
        </FieldGroup>
      </>}

      {operation === 'search' && (
        <FieldGroup label="Query" helper="Search query. Leave empty to list all accessible pages.">
          <ExpressionInput style={inputStyle} value={(config.query as string) ?? ''}
            placeholder="{{ input.query }}" onChange={(v) => onChange('query', v)} />
        </FieldGroup>
      )}

      {operation === 'generic' && <>
        <FieldGroup label="Method">
          <select style={selectStyle} value={(config.method as string) ?? 'GET'}
            onChange={(e) => onChange('method', e.target.value)}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </FieldGroup>
        <FieldGroup label="Path" helper="Notion API path, e.g. /v1/databases/{id}/query.">
          <ExpressionInput style={inputStyle} value={(config.path as string) ?? ''}
            placeholder="/v1/users/me" onChange={(v) => onChange('path', v)} />
        </FieldGroup>
        <FieldGroup label="Notion-Version">
          <input style={inputStyle} value={(config.notionVersion as string) ?? '2022-06-28'}
            onChange={(e) => onChange('notionVersion', e.target.value)} />
        </FieldGroup>
        <FieldGroup label="Body (JSON)">
          <ExpressionTextarea style={{ ...inputStyle, ...monoStyle }} spellCheck={false}
            value={(config.body as string) ?? '{}'} onChange={(v) => onChange('body', v)} />
        </FieldGroup>
      </>}
    </div>
  );
}

/* ── Human Approval ── */
function HumanApprovalPanel({ config, onChange, issues = [] }: PanelProps) {
  const subjectProps = customFieldProps(issues, 'subject', 'The question or title shown to approvers.', true);
  const messageProps = customFieldProps(issues, 'message', 'Optional longer description of what needs approval.');
  const approversProps = customFieldProps(issues, 'approvers', 'Comma-separated emails (informational; no email sent automatically).');
  const timeoutProps = customFieldProps(issues, 'timeoutHours', 'Max 168 (7 days). Execution resumes as rejected after timeout.');

  const approvalUrl = `${window.location.origin}/api/v1/approvals/<pending>`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Subject" {...subjectProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(subjectProps.error))}
          value={(config.subject as string) ?? ''}
          placeholder="Approve this action?"
          onChange={(value) => onChange('subject', value)}
        />
      </FieldGroup>
      <FieldGroup label="Message" {...messageProps}>
        <ExpressionTextarea
          style={fieldInputStyle(Boolean(messageProps.error), monoStyle)}
          value={(config.message as string) ?? ''}
          placeholder="Describe what needs approval..."
          onChange={(value) => onChange('message', value)}
        />
      </FieldGroup>
      <FieldGroup label="Approvers" {...approversProps}>
        <ExpressionInput
          style={fieldInputStyle(Boolean(approversProps.error))}
          value={(config.approvers as string) ?? ''}
          placeholder="email@example.com, another@example.com"
          onChange={(value) => onChange('approvers', value)}
        />
      </FieldGroup>
      <FieldGroup label="Timeout (hours)" {...timeoutProps}>
        <input
          type="number"
          min={1}
          max={168}
          step={1}
          style={fieldInputStyle(Boolean(timeoutProps.error))}
          value={(config.timeoutHours as number) ?? 24}
          onChange={(e) => onChange('timeoutHours', Math.max(1, Math.min(168, parseInt(e.target.value, 10) || 24)))}
        />
      </FieldGroup>
      <ReadOnlyUrlField label="Approval URL" value={approvalUrl} />
    </div>
  );
}

function GenericPanel({ config, onChange, nodeType, issues = [] }: PanelProps & { nodeType: string }) {
  const def = getNodeDef(nodeType);
  const credentials = useStore((s) => s.credentials);
  const matchingCredentials = credentialsForNode(credentials, nodeType);
  const operationField = getOperationField(nodeType);
  const visibleFields = def.fields.filter((field) => field.key !== operationField?.key);

  if (visibleFields.length === 0) {
    return (
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
        No additional configuration required.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {visibleFields.map((field) => {
        const v = config[field.key];
        const relatedIssues = fieldIssues(issues, field.key);
        const error = relatedIssues.find((issue) => issue.severity === 'error')?.message ?? null;
        const required = fieldIsRequired(nodeType, field, config, relatedIssues);
        const helper = fieldHelper(nodeType, field);
        const groupProps = {
          key: field.key,
          label: field.label,
          required,
          helper,
          error,
        };

        if (field.key === 'credentialId') return (
          <FieldGroup {...groupProps}>
            <select style={fieldInputStyle(Boolean(error), selectStyle)} value={(v as string) ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}>
              <option value="">No saved credential</option>
              {matchingCredentials.map((credential) => (
                <option key={credential.id} value={credential.id}>{credential.name} ({credential.type})</option>
              ))}
            </select>
          </FieldGroup>
        );

        if (field.type === 'text') return (
          <FieldGroup {...groupProps}>
            <ExpressionInput
              style={fieldInputStyle(Boolean(error))}
              value={(v as string) ?? ''}
              placeholder={field.placeholder ?? field.key}
              onChange={(next) => onChange(field.key, next)}
            />
          </FieldGroup>
        );

        if (field.type === 'number') return (
          <FieldGroup {...groupProps}>
            <input type="number" style={fieldInputStyle(Boolean(error))} value={(v as number) ?? ''} step="0.1"
              onChange={(e) => onChange(field.key, parseFloat(e.target.value))} />
          </FieldGroup>
        );

        if (field.type === 'textarea' || field.type === 'code') return (
          <FieldGroup {...groupProps}>
            <ExpressionTextarea
              style={fieldInputStyle(Boolean(error), monoStyle)}
              value={(v as string) ?? ''}
              placeholder={field.placeholder ?? field.key}
              spellCheck={false}
              onChange={(next) => onChange(field.key, next)}
            />
          </FieldGroup>
        );

        if (field.type === 'select') return (
          <FieldGroup {...groupProps}>
            <select style={fieldInputStyle(Boolean(error), selectStyle)} value={(v as string) ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}>
              {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldGroup>
        );

        return null;
      })}
    </div>
  );
}

function ServiceNodePanel({ config, onChange, nodeType, issues = [] }: PanelProps & { nodeType: string }) {
  const def = getNodeDef(nodeType);
  const credentials = useStore((s) => s.credentials);
  const matchingCredentials = credentialsForNode(credentials, nodeType, def.credentialTypes);
  const operations = def.operations ?? {};
  const opKeys = Object.keys(operations);
  const currentOp = (config.operation as string) || opKeys[0];
  const opFields = operations[currentOp]?.fields ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <FieldGroup label="Credential">
        <select
          style={fieldInputStyle(false, selectStyle)}
          value={(config.credentialId as string) ?? ''}
          onChange={(e) => onChange('credentialId', e.target.value)}
        >
          <option value="">No saved credential</option>
          {matchingCredentials.map((credential) => (
            <option key={credential.id} value={credential.id}>{credential.name} ({credential.type})</option>
          ))}
        </select>
      </FieldGroup>

      <FieldGroup label="Operation">
        <select
          style={fieldInputStyle(false, selectStyle)}
          value={currentOp}
          onChange={(e) => onChange('operation', e.target.value)}
        >
          {opKeys.map((key) => (
            <option key={key} value={key}>{operations[key].label}</option>
          ))}
        </select>
      </FieldGroup>

      {opFields.map((field) => {
        const v = config[field.key];
        const relatedIssues = fieldIssues(issues, field.key);
        const error = relatedIssues.find((issue) => issue.severity === 'error')?.message ?? null;
        const groupProps = { key: field.key, label: field.label, required: field.required, error };

        if (field.type === 'number') return (
          <FieldGroup {...groupProps}>
            <input type="number" style={fieldInputStyle(Boolean(error))} value={(v as number) ?? ''} step="0.1"
              onChange={(e) => onChange(field.key, parseFloat(e.target.value))} />
          </FieldGroup>
        );

        if (field.type === 'textarea' || field.type === 'code') return (
          <FieldGroup {...groupProps}>
            <ExpressionTextarea
              style={fieldInputStyle(Boolean(error), monoStyle)}
              value={(v as string) ?? ''}
              placeholder={field.placeholder ?? field.key}
              spellCheck={false}
              onChange={(next) => onChange(field.key, next)}
            />
          </FieldGroup>
        );

        if (field.type === 'select') return (
          <FieldGroup {...groupProps}>
            <select style={fieldInputStyle(Boolean(error), selectStyle)} value={(v as string) ?? ''}
              onChange={(e) => onChange(field.key, e.target.value)}>
              {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </FieldGroup>
        );

        return (
          <FieldGroup {...groupProps}>
            <ExpressionInput
              style={fieldInputStyle(Boolean(error))}
              value={(v as string) ?? ''}
              placeholder={field.placeholder ?? field.key}
              onChange={(next) => onChange(field.key, next)}
            />
          </FieldGroup>
        );
      })}
    </div>
  );
}

/* ── Node panel router ── */
export function NodePanel({ nodeType, config, onChange, nodeId, issues = [] }: PanelProps & { nodeType: string }) {
  if (getNodeDef(nodeType).operations) {
    return <ServiceNodePanel nodeType={nodeType} config={config} onChange={onChange} issues={issues} />;
  }
  switch (nodeType) {
    case 'webhook_trigger':
      return <WebhookPanel config={config} onChange={onChange} nodeId={nodeId} issues={issues} />;
    case 'form_trigger':
      return <FormTriggerPanel config={config} onChange={onChange} nodeId={nodeId} issues={issues} />;
    case 'chat_trigger':
      return <ChatTriggerPanel config={config} onChange={onChange} nodeId={nodeId} issues={issues} />;
    case 'manual_trigger':
      return <GenericPanel nodeType={nodeType} config={config} onChange={onChange} issues={issues} />;
    case 'schedule_trigger':
      return <SchedulePanel config={config} onChange={onChange} issues={issues} />;
    case 'http_request':
      return <HttpRequestPanel config={config} onChange={onChange} issues={issues} />;
    case 'llm_call':
      return <LlmCallPanel config={config} onChange={onChange} issues={issues} />;
    case 'if':
      return <IfConditionPanel config={config} onChange={onChange} issues={issues} />;
    case 'merge':
      return <MergePanel config={config} onChange={onChange} issues={issues} />;
    case 'set':
      return <SetPanel config={config} onChange={onChange} issues={issues} />;
    case 'code':
      return <CodePanel config={config} onChange={onChange} issues={issues} />;
    case 'delay':
      return <DelayPanel config={config} onChange={onChange} issues={issues} />;
    case 'stop_error':
      return <StopErrorPanel config={config} onChange={onChange} issues={issues} />;
    case 'human_approval':
      return <HumanApprovalPanel config={config} onChange={onChange} nodeId={nodeId} issues={issues} />;
    case 'filter':
      return <FilterPanel config={config} onChange={onChange} issues={issues} />;
    case 'loop':
      return <LoopPanel config={config} onChange={onChange} issues={issues} />;
    case 'sub_workflow':
      return <SubWorkflowPanel config={config} onChange={onChange} issues={issues} />;
    case 'send_email':
      return <SendEmailPanel config={config} onChange={onChange} issues={issues} />;
    case 'postgres_query':
      return <PostgresQueryPanel config={config} onChange={onChange} issues={issues} />;
    case 'redis_get':
      return <RedisGetPanel config={config} onChange={onChange} issues={issues} />;
    case 'redis_set':
      return <RedisSetPanel config={config} onChange={onChange} issues={issues} />;
    case 'ai_agent':
      return <AiAgentPanel config={config} onChange={onChange} issues={issues} />;
    case 'memory_read':
      return <MemoryReadPanel config={config} onChange={onChange} issues={issues} />;
    case 'memory_write':
      return <MemoryWritePanel config={config} onChange={onChange} issues={issues} />;
    case 'vector_search':
      return <VectorSearchPanel config={config} onChange={onChange} issues={issues} />;
    case 'notion_api':
      return <NotionApiPanel config={config} onChange={onChange} issues={issues} />;
    default:
      return <GenericPanel nodeType={nodeType} config={config} onChange={onChange} issues={issues} />;
  }
}

/* ════════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════════ */

export function ConfigPanel() {
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const nodes = useStore((s) => s.nodes);
  const updateNodeConfig = useStore((s) => s.updateNodeConfig);
  const updateNodeLabel = useStore((s) => s.updateNodeLabel);
  const updateNodeControls = useStore((s) => s.updateNodeControls);
  const setConfigPanelOpen = useStore((s) => s.setConfigPanelOpen);
  const nodeExecutions = useStore((s) => s.nodeExecutions);
  const fetchCredentials = useStore((s) => s.fetchCredentials);
  const runExecution = useStore((s) => s.runExecution);
  const setPinnedDataForNode = useStore((s) => s.setPinnedDataForNode);
  const pinNodeOutput = useStore((s) => s.pinNodeOutput);
  const clearPinnedDataForNode = useStore((s) => s.clearPinnedDataForNode);
  const pinnedData = useStore((s) => s.pinnedData);
  const setBottomPanelsOpen = useStore((s) => s.setBottomPanelsOpen);
  const validationIssues = useStore((s) => s.validationIssues);

  const node = nodes.find((n) => n.id === selectedNodeId);

  useEffect(() => {
    fetchCredentials();
  }, [fetchCredentials]);

  if (!node) return null;

  const execution: NodeExecution | undefined = selectedNodeId
    ? nodeExecutions[selectedNodeId]
    : undefined;

  const def = getNodeDef(node.data.nodeType);
  const config = (node.data.config ?? {}) as Record<string, unknown>;
  const isPinned = Object.prototype.hasOwnProperty.call(pinnedData, node.id);
  const nodeIssues = validationIssues.filter((issue) => issue.nodeId === node.id);
  const actionBtnStyle: CSSProperties = {
    minHeight: 28,
    borderRadius: '5px',
    border: '1px solid var(--border)',
    background: 'var(--bg-input)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontFamily: "'Inter'",
    fontSize: '11.5px',
    fontWeight: 600,
    letterSpacing: '-0.005em',
  };

  const runSelected = (mode: 'single_node' | 'to_node' | 'from_node') => {
    setBottomPanelsOpen(true);
    void runExecution(mode, node.id);
  };

  const pinOutput = () => {
    pinNodeOutput(node.id);
  };

  function setField(key: string, value: unknown) {
    updateNodeConfig(node!.id, { ...config, [key]: value });
  }

  return (
    <aside
      style={{
        width: '320px',
        height: '100%',
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: '54px',
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
        }}
      >
        <span style={{
          fontSize: '13.5px',
          fontWeight: 700,
          color: 'var(--text-primary)',
          letterSpacing: '-0.012em',
          fontFamily: "'Inter'",
          flexShrink: 0,
        }}>
          Properties
        </span>

        {/* Node ID pill */}
        <span style={{
          fontFamily: "'JetBrains Mono'",
          fontSize: '9.5px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          padding: '2px 6px',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '120px',
        }}>
          {node.data.nodeType}_{node.id.slice(0, 6)}
        </span>

        <div style={{ flex: 1 }} />

        {/* Close */}
        <button
          onClick={() => setConfigPanelOpen(false)}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.1s ease, color 0.1s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Node label</label>
          <input
            style={inputStyle}
            value={(node.data.label as string) ?? ''}
            onChange={(e) => updateNodeLabel(node.id, e.target.value)}
          />
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '6px',
          marginBottom: '18px',
        }}>
          <button style={actionBtnStyle} onClick={() => runSelected('single_node')}>Run node</button>
          <button style={actionBtnStyle} onClick={() => runSelected('to_node')}>Run to here</button>
          <button style={actionBtnStyle} onClick={() => runSelected('from_node')}>Run from here</button>
          <button
            style={{
              ...actionBtnStyle,
              color: isPinned ? 'var(--node-running)' : 'var(--text-primary)',
            }}
            onClick={isPinned ? () => clearPinnedDataForNode(node.id) : pinOutput}
          >
            {isPinned ? 'Clear pin' : 'Pin output'}
          </button>
        </div>

        <NodeControlsPanel
          data={node.data}
          onChange={(patch) => updateNodeControls(node.id, patch)}
        />

        {isPinned && (
          <PinnedDataEditor nodeId={node.id} data={pinnedData[node.id]} onSave={setPinnedDataForNode} />
        )}

        <ImportMetadataSection config={config} />
        <ValidationIssuesSection issues={nodeIssues} />

        {/* EXECUTION section */}
        {execution && (
          <>
            <div style={{
              fontFamily: "'JetBrains Mono'",
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.14em',
              color: 'rgba(170,170,180,0.85)',
              marginBottom: '12px',
            }}>
              EXECUTION
            </div>
            <ExecutionSection execution={execution} />
          </>
        )}

        {/* CONFIGURATION section */}
        <div style={{
          fontFamily: "'JetBrains Mono'",
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.14em',
          color: 'rgba(170,170,180,0.85)',
          marginBottom: '12px',
        }}>
          CONFIGURATION
        </div>

        <ExpressionDataPanel />

        <OperationPicker
          nodeType={node.data.nodeType}
          config={config}
          onChange={setField}
        />

        <NodePanel
          nodeType={node.data.nodeType}
          config={config}
          onChange={setField}
          nodeId={node.id}
          issues={nodeIssues}
        />
      </div>
    </aside>
  );
}
