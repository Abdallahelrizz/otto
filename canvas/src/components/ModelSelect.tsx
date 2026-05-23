import { useState, useEffect, type CSSProperties } from 'react';

type ModelEntry = {
  id: string;
  name: string;
  contextWindow?: number;
  isFree?: boolean;
};

/* ── Session-level cache — persists across panel open/close ── */
const MODEL_CACHE = new Map<string, ModelEntry[]>();

const ANTHROPIC_MODELS: ModelEntry[] = [
  { id: 'claude-opus-4-5',           name: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4-5',         name: 'Claude Sonnet 4.5' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
];

function formatCtx(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)}M ctx`;
  if (n >= 1_000)     return `${Math.round(n / 1_000)}K ctx`;
  return `${n} ctx`;
}

async function fetchOpenAIModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI fetch failed: ${res.status}`);
  const data = await res.json();
  return (data.data as { id: string }[])
    .filter((m) => m.id.startsWith('gpt-') || m.id.startsWith('o'))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => ({ id: m.id, name: m.id }));
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

/* ── Shared styles (mirrors ConfigPanel tokens) ── */
const baseInputStyle: CSSProperties = {
  width: '100%',
  fontSize: '12px',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-input)',
  borderRadius: '5px',
  padding: '7px 10px',
  color: 'var(--text-primary)',
  fontFamily: 'Geist, sans-serif',
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

/* ── Props ── */
interface ModelSelectProps {
  provider: string;
  apiKey: string;
  value: string;
  onChange: (model: string) => void;
}

export function ModelSelect({ provider, apiKey, value, onChange }: ModelSelectProps) {
  const cacheKey = provider === 'openai' ? `openai:${apiKey}` : provider;
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [models, setModels] = useState<ModelEntry[]>([]);

  useEffect(() => {
    // Anthropic: hardcoded, no fetch
    if (provider === 'anthropic') {
      setModels(ANTHROPIC_MODELS);
      setStatus('loaded');
      return;
    }

    // OpenAI: requires API key — skip if empty
    if (provider === 'openai' && !apiKey.trim()) {
      setStatus('error'); // fall back to text input
      return;
    }

    // Check cache
    const cached = MODEL_CACHE.get(cacheKey);
    if (cached) {
      setModels(cached);
      setStatus('loaded');
      return;
    }

    // Fetch
    setStatus('loading');
    setModels([]);

    const doFetch = provider === 'openai'
      ? fetchOpenAIModels(apiKey)
      : fetchOpenRouterModels();

    doFetch
      .then((result) => {
        MODEL_CACHE.set(cacheKey, result);
        setModels(result);
        setStatus('loaded');
      })
      .catch(() => {
        setStatus('error');
      });
  }, [cacheKey, provider, apiKey]);

  // Fallback to text input on error or unknown provider
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

  // OpenRouter: group into Free / Paid using <optgroup>
  if (provider === 'openrouter' && status === 'loaded') {
    const free = models.filter((m) => m.isFree);
    const paid = models.filter((m) => !m.isFree);

    return (
      <select
        style={{ ...selectStyle, opacity: loading ? 0.6 : 1 }}
        value={value}
        disabled={loading}
        onChange={(e) => onChange(e.target.value)}
      >
        {!value && <option value="">Select a model...</option>}
        {free.length > 0 && (
          <optgroup label="★ Free">
            {free.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.contextWindow ? ` · ${formatCtx(m.contextWindow)}` : ''}
              </option>
            ))}
          </optgroup>
        )}
        {paid.length > 0 && (
          <optgroup label="Paid">
            {paid.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}{m.contextWindow ? ` · ${formatCtx(m.contextWindow)}` : ''}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    );
  }

  // OpenAI + Anthropic: flat list
  return (
    <select
      style={{ ...selectStyle, opacity: loading ? 0.6 : 1 }}
      value={loading ? '' : value}
      disabled={loading}
      onChange={(e) => onChange(e.target.value)}
    >
      {loading && <option value="">Loading models...</option>}
      {!loading && !value && <option value="">Select a model...</option>}
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}{m.contextWindow ? ` · ${formatCtx(m.contextWindow)}` : ''}
        </option>
      ))}
    </select>
  );
}
