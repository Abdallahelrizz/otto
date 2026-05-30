import { useState, useEffect, type CSSProperties } from 'react';

type ModelEntry = {
  id: string;
  name: string;
  contextWindow?: number;
  isFree?: boolean;
};

const MODEL_CACHE = new Map<string, ModelEntry[]>();

// Common OpenAI models shown when no credential is connected.
// The user can always type a model name if theirs isn't listed.
const OPENAI_MODELS: ModelEntry[] = [
  { id: 'gpt-4o',              name: 'GPT-4o' },
  { id: 'gpt-4o-mini',         name: 'GPT-4o mini' },
  { id: 'gpt-4-turbo',         name: 'GPT-4 Turbo' },
  { id: 'gpt-4',               name: 'GPT-4' },
  { id: 'gpt-3.5-turbo',       name: 'GPT-3.5 Turbo' },
  { id: 'o1',                  name: 'o1' },
  { id: 'o1-mini',             name: 'o1 mini' },
  { id: 'o3-mini',             name: 'o3 mini' },
  { id: 'o4-mini',             name: 'o4 mini' },
];

const ANTHROPIC_MODELS: ModelEntry[] = [
  { id: 'claude-opus-4-5',           name: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-5',         name: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-8',           name: 'Claude Opus 4.8' },
];

function formatCtx(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M ctx`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K ctx`;
  return `${n} ctx`;
}

async function fetchOpenRouterModels(): Promise<ModelEntry[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) throw new Error(`OpenRouter fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.data as { id: string; name: string; context_length?: number; pricing?: { prompt?: string } }[])
    .map((m) => ({
      id: m.id,
      name: m.name,
      contextWindow: m.context_length,
      isFree: m.pricing?.prompt === '0',
    }));
}

const baseInputStyle: CSSProperties = {
  width: '100%',
  fontSize: '12px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: '5px',
  padding: '7px 10px',
  color: 'var(--text-primary)',
  fontFamily: 'Geist, system-ui, sans-serif',
  transition: 'border-color 0.15s ease',
};

const selectStyle: CSSProperties = {
  ...baseInputStyle,
  cursor: 'pointer',
  appearance: 'none',
  WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%2371717a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '28px',
};

interface ModelSelectProps {
  provider: string;
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelect({ provider, value, onChange }: ModelSelectProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [models, setModels] = useState<ModelEntry[]>([]);

  useEffect(() => {
    if (provider === 'anthropic') {
      setModels(ANTHROPIC_MODELS);
      setStatus('loaded');
      return;
    }

    if (provider === 'openai') {
      // Use the hardcoded list — no inline key needed
      setModels(OPENAI_MODELS);
      setStatus('loaded');
      return;
    }

    // OpenRouter — public endpoint, no auth required
    const cached = MODEL_CACHE.get('openrouter');
    if (cached) { setModels(cached); setStatus('loaded'); return; }

    setStatus('loading');
    fetchOpenRouterModels()
      .then((result) => { MODEL_CACHE.set('openrouter', result); setModels(result); setStatus('loaded'); })
      .catch(() => setStatus('error'));
  }, [provider]);

  if (status === 'error') {
    return (
      <input
        style={baseInputStyle}
        value={value}
        placeholder="Enter model name (e.g. gpt-4o-mini)"
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  const loading = status === 'loading';

  if (provider === 'openrouter' && status === 'loaded') {
    const free = models.filter((m) => m.isFree);
    const paid = models.filter((m) => !m.isFree);
    return (
      <select style={{ ...selectStyle, opacity: loading ? 0.6 : 1 }} value={value} disabled={loading} onChange={(e) => onChange(e.target.value)}>
        {!value && <option value="">Select a model…</option>}
        {free.length > 0 && <optgroup label="★ Free">{free.map((m) => <option key={m.id} value={m.id}>{m.name}{m.contextWindow ? ` · ${formatCtx(m.contextWindow)}` : ''}</option>)}</optgroup>}
        {paid.length > 0 && <optgroup label="Paid">{paid.map((m) => <option key={m.id} value={m.id}>{m.name}{m.contextWindow ? ` · ${formatCtx(m.contextWindow)}` : ''}</option>)}</optgroup>}
      </select>
    );
  }

  return (
    <select style={{ ...selectStyle, opacity: loading ? 0.6 : 1 }} value={loading ? '' : value} disabled={loading} onChange={(e) => onChange(e.target.value)}>
      {loading && <option value="">Loading models…</option>}
      {!loading && !value && <option value="">Select a model…</option>}
      {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
}
