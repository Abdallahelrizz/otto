import type { CSSProperties } from 'react';
import { useStore } from '../store';
import { getNodeDef, CATEGORY_COLORS } from './nodes/nodeConfig';
import { NodeIcon } from './NodeIcon';
import { JsonViewer } from './JsonViewer';
import { ModelSelect } from './ModelSelect';
import type { NodeExecution } from '../types';

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

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
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
function ExecutionSection({ execution }: { execution: NodeExecution }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <ExecBadge execution={execution} />
      {execution.error && (
        <div style={{ marginTop: '12px' }}>
          <label style={{ ...labelStyle, color: 'var(--node-error)' }}>Error</label>
          <pre style={{
            ...monoStyle,
            color: 'var(--node-error)',
            minHeight: 0,
            padding: '8px 10px',
            margin: 0,
          }}>
            {execution.error}
          </pre>
        </div>
      )}
      {execution.input != null && (
        <div style={{ marginTop: '12px' }}>
          <JsonViewer label="Input" data={execution.input} />
        </div>
      )}
      {execution.output != null && (
        <div style={{ marginTop: '12px' }}>
          <JsonViewer label="Output" data={execution.output} />
        </div>
      )}
      <div style={{ height: '1px', background: 'var(--border)', margin: '20px 0 0' }} />
    </div>
  );
}

/* ════════════════════════════════════════════
   NODE-SPECIFIC PANELS
════════════════════════════════════════════ */

type PanelProps = {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

/* ── Webhook ── */
function WebhookPanel({ config, onChange }: PanelProps) {
  return (
    <FieldGroup label="Path">
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
  );
}

/* ── HTTP Request ── */
type Header = { key: string; value: string };

function HttpRequestPanel({ config, onChange }: PanelProps) {
  const headers = (config.headers as Header[]) ?? [];
  const authType = (config.authType as string) ?? 'none';

  const updateHeader = (i: number, field: 'key' | 'value', val: string) => {
    onChange('headers', headers.map((h, j) => j === i ? { ...h, [field]: val } : h));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          <label style={labelStyle}>URL</label>
          <input style={inputStyle} value={(config.url as string) ?? ''} placeholder="https://api.example.com/v1/..."
            onChange={(e) => onChange('url', e.target.value)} />
        </div>
      </div>

      {/* Headers */}
      <div>
        <label style={labelStyle}>Headers</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {headers.map((h, i) => (
            <div key={i} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="Key" value={h.key}
                onChange={(e) => updateHeader(i, 'key', e.target.value)} />
              <input style={{ ...inputStyle, flex: 2 }} placeholder="Value" value={h.value}
                onChange={(e) => updateHeader(i, 'value', e.target.value)} />
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
      <FieldGroup label="Body">
        <textarea style={monoStyle} value={(config.body as string) ?? ''} placeholder='{ "key": "value" }'
          onChange={(e) => onChange('body', e.target.value)} />
      </FieldGroup>
    </div>
  );
}

/* ── LLM Call ── */
function LlmCallPanel({ config, onChange }: PanelProps) {
  const provider    = (config.provider    as string) ?? 'openai';
  const apiKey      = (config.apiKey      as string) ?? '';
  const model       = (config.model       as string) ?? '';
  const temperature = (config.temperature as number) ?? 0.7;

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

      {/* API Key — OpenAI only, used to fetch model list */}
      {provider === 'openai' && (
        <div>
          <label style={labelStyle}>API Key</label>
          <input
            type="password"
            style={inputStyle}
            value={apiKey}
            placeholder="sk-..."
            onChange={(e) => onChange('apiKey', e.target.value)}
          />
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px', display: 'block' }}>
            Used only to fetch the model list
          </span>
        </div>
      )}

      {/* Model — dynamic dropdown */}
      <FieldGroup label="Model">
        <ModelSelect
          provider={provider}
          apiKey={apiKey}
          value={model}
          onChange={(v) => onChange('model', v)}
        />
      </FieldGroup>

      {/* System Prompt */}
      <FieldGroup label="System Prompt">
        <textarea style={monoStyle} value={(config.systemPrompt as string) ?? ''} placeholder="You are a helpful assistant."
          onChange={(e) => onChange('systemPrompt', e.target.value)} />
      </FieldGroup>

      {/* User Prompt */}
      <FieldGroup label="User Prompt">
        <textarea style={monoStyle} value={(config.userPrompt as string) ?? ''} placeholder="{{ input.message }}"
          onChange={(e) => onChange('userPrompt', e.target.value)} />
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

function IfConditionPanel({ config, onChange }: PanelProps) {
  const conditions = (config.conditions as Condition[]) ?? [];
  const combinator = (config.combinator as string) ?? 'and';

  const updateCond = (i: number, field: keyof Condition, val: string) => {
    onChange('conditions', conditions.map((c, j) => j === i ? { ...c, [field]: val } : c));
  };

  const needsValue = (op: string) => !['isEmpty', 'isNotEmpty'].includes(op);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
              <input style={inputStyle} placeholder="field.path" value={cond.left}
                onChange={(e) => updateCond(i, 'left', e.target.value)} />
              <select style={selectStyle} value={cond.operator}
                onChange={(e) => updateCond(i, 'operator', e.target.value)}>
                {IF_OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              {needsValue(cond.operator) && (
                <input style={inputStyle} placeholder="value" value={cond.right}
                  onChange={(e) => updateCond(i, 'right', e.target.value)} />
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

function SetPanel({ config, onChange }: PanelProps) {
  const assignments = (config.assignments as Assignment[]) ?? [];

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {assignments.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
              <input style={{ ...inputStyle, flex: 1 }} placeholder="output.key" value={a.key}
                onChange={(e) => update(i, 'key', e.target.value)} />
              <span style={{ color: 'var(--text-muted)', fontSize: '12px', flexShrink: 0 }}>→</span>
              <input style={{ ...inputStyle, flex: 2 }} placeholder="{{ input.field }}" value={a.value}
                onChange={(e) => update(i, 'value', e.target.value)} />
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

/* ── Generic fallback (for non-custom nodes) ── */
function GenericPanel({ config, onChange, nodeType }: PanelProps & { nodeType: string }) {
  const def = getNodeDef(nodeType);

  if (def.fields.length === 0) {
    return (
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>
        No configuration required.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {def.fields.map((field) => {
        const v = config[field.key];

        if (field.type === 'text') return (
          <FieldGroup key={field.key} label={field.label}>
            <input style={inputStyle} value={(v as string) ?? ''} placeholder={field.key}
              onChange={(e) => onChange(field.key, e.target.value)} />
          </FieldGroup>
        );

        if (field.type === 'number') return (
          <FieldGroup key={field.key} label={field.label}>
            <input type="number" style={inputStyle} value={(v as number) ?? ''} step="0.1"
              onChange={(e) => onChange(field.key, parseFloat(e.target.value))} />
          </FieldGroup>
        );

        if (field.type === 'textarea' || field.type === 'code') return (
          <FieldGroup key={field.key} label={field.label}>
            <textarea style={monoStyle} value={(v as string) ?? ''} placeholder={field.key}
              onChange={(e) => onChange(field.key, e.target.value)} />
          </FieldGroup>
        );

        if (field.type === 'select') return (
          <FieldGroup key={field.key} label={field.label}>
            <select style={selectStyle} value={(v as string) ?? ''}
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

/* ── Node panel router ── */
function NodePanel({ nodeType, config, onChange }: PanelProps & { nodeType: string }) {
  switch (nodeType) {
    case 'webhook_trigger':
    case 'manual_trigger':
      return <WebhookPanel config={config} onChange={onChange} />;
    case 'http_request':
      return <HttpRequestPanel config={config} onChange={onChange} />;
    case 'llm_call':
      return <LlmCallPanel config={config} onChange={onChange} />;
    case 'if':
      return <IfConditionPanel config={config} onChange={onChange} />;
    case 'merge':
      return <MergePanel config={config} onChange={onChange} />;
    case 'set':
      return <SetPanel config={config} onChange={onChange} />;
    default:
      return <GenericPanel nodeType={nodeType} config={config} onChange={onChange} />;
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
  const selectNode = useStore((s) => s.selectNode);
  const nodeExecutions = useStore((s) => s.nodeExecutions);

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) return null;

  const execution: NodeExecution | undefined = selectedNodeId
    ? nodeExecutions[selectedNodeId]
    : undefined;

  const def = getNodeDef(node.data.nodeType);
  const config = (node.data.config ?? {}) as Record<string, unknown>;
  const categoryColor = CATEGORY_COLORS[def.category] ?? def.color;

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
          padding: '11px 12px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '9px',
        }}
      >
        {/* Category-tinted icon — 32×32 */}
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: `${categoryColor}1e`,
            flexShrink: 0,
          }}
        >
          <NodeIcon type={node.data.nodeType} size={16} color={categoryColor} />
        </span>

        {/* Editable node name */}
        <input
          style={{
            flex: 1,
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: "'Inter'",
            letterSpacing: '-0.01em',
            minWidth: 0,
          }}
          value={node.data.label as string}
          onChange={(e) => updateNodeLabel(node.id, e.target.value)}
          placeholder="Node name"
        />

        {/* Close */}
        <button
          onClick={() => selectNode(null)}
          style={{
            width: '22px', height: '22px',
            borderRadius: '4px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '16px',
            color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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
          ×
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
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

        <NodePanel
          nodeType={node.data.nodeType}
          config={config}
          onChange={setField}
        />
      </div>
    </aside>
  );
}
