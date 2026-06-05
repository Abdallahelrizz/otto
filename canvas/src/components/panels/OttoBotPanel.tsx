import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { api } from '../../api';
import { getNodeDef } from '../nodes/nodeConfig';
import type { Node, Edge } from 'reactflow';

const UI_FONT = 'Geist, system-ui, sans-serif';
const MONO    = 'Geist Mono, monospace';

// ─── DAG analysis (kept intact) ──────────────────────────────────────────────

type Insight = { type: 'parallel' | 'composition' | 'pattern'; text: string; highlight?: string };
type Message  = { role: 'user' | 'assistant'; content: string; id: string };

function buildAdjacency(nodes: Node[], edges: Edge[]) {
  const parents:  Record<string, Set<string>> = {};
  const children: Record<string, Set<string>> = {};
  for (const n of nodes) { parents[n.id] = new Set(); children[n.id] = new Set(); }
  for (const e of edges) {
    if (parents[e.target])  parents[e.target].add(e.source);
    if (children[e.source]) children[e.source].add(e.target);
  }
  return { parents, children };
}

function getAncestors(nodeId: string, parents: Record<string, Set<string>>): Set<string> {
  const visited = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of (parents[cur] ?? new Set())) {
      if (!visited.has(p)) { visited.add(p); stack.push(p); }
    }
  }
  return visited;
}

function analyzeWorkflow(nodes: Node[], edges: Edge[]): Insight[] {
  if (nodes.length === 0) return [{ type: 'composition', text: 'Canvas is empty — drag nodes in from the sidebar to get started.' }];
  const { parents, children } = buildAdjacency(nodes, edges);
  const insights: Insight[] = [];

  const cats: Record<string, number> = {};
  for (const n of nodes) {
    const cat = getNodeDef((n.data?.nodeType as string) ?? '').category ?? 'core';
    cats[cat] = (cats[cat] ?? 0) + 1;
  }
  const parts: string[] = [];
  if (cats.triggers) parts.push(`${cats.triggers} trigger${cats.triggers > 1 ? 's' : ''}`);
  if (cats.ai)       parts.push(`${cats.ai} AI node${cats.ai > 1 ? 's' : ''}`);
  if (cats.core)     parts.push(`${cats.core} core node${cats.core > 1 ? 's' : ''}`);
  if (cats.data)     parts.push(`${cats.data} data node${cats.data > 1 ? 's' : ''}`);
  insights.push({ type: 'composition', text: `${nodes.length} node${nodes.length > 1 ? 's' : ''}: ${parts.join(', ')}.` });

  const isolated = nodes.filter(n => !(parents[n.id]?.size) && !(children[n.id]?.size));
  if (isolated.length) {
    insights.push({ type: 'pattern', text: `${isolated.length} isolated node${isolated.length > 1 ? 's' : ''}: ${isolated.slice(0, 3).map(n => `"${n.data?.label ?? n.id}"`).join(', ')}. Connect or remove them.` });
  }

  if (nodes.length >= 2) {
    const ancestorMap = new Map(nodes.map(n => [n.id, getAncestors(n.id, parents)]));
    const parallelIds = new Set<string>();
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const [a, b] = [nodes[i], nodes[j]];
      if (!ancestorMap.get(a.id)!.has(b.id) && !ancestorMap.get(b.id)!.has(a.id)) {
        parallelIds.add(a.id); parallelIds.add(b.id);
      }
    }
    parallelIds.size === 0
      ? insights.push({ type: 'parallel', text: `All ${nodes.length} nodes are sequential. Independent steps can run in parallel.` })
      : insights.push({ type: 'parallel', highlight: `${parallelIds.size} nodes run in parallel`, text: `${parallelIds.size} of ${nodes.length} nodes run concurrently via Promise.all().` });
  }

  const llmIds = new Set(nodes.filter(n => ['llm_call','ai_agent'].includes((n.data?.nodeType as string) ?? '')).map(n => n.id));
  if (llmIds.size >= 2) {
    const chain = edges.filter(e => llmIds.has(e.source) && llmIds.has(e.target));
    if (chain.length) {
      const src = nodes.find(n => n.id === chain[0].source)?.data?.label as string ?? chain[0].source;
      const tgt = nodes.find(n => n.id === chain[0].target)?.data?.label as string ?? chain[0].target;
      insights.push({ type: 'pattern', text: `LLM chain: "${src}" → "${tgt}". Each chained call adds latency — consider merging prompts.` });
    }
  }
  return insights;
}

// ─── Bot logo ─────────────────────────────────────────────────────────────────

function BotAvatar({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/big_new_logo.svg"
      alt="Otto"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain', flexShrink: 0 }}
    />
  );
}

// ─── Memory tab ──────────────────────────────────────────────────────────────

function MemoryTab() {
  const [stats, setStats]   = useState<{ patternsCount?: number; sessionsCount?: number } | null>(null);
  const [interactions, setInteractions] = useState<unknown[]>([]);
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState<unknown[]>([]);
  const [searching, setSearching] = useState(false);
  const [clearing, setClearing]   = useState(false);

  useEffect(() => {
    api.getMemoryStats().then(setStats).catch(() => {});
    api.getMemoryInteractions(10).then(setInteractions).catch(() => {});
  }, []);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try { setResults(await api.searchMemory(query.trim(), 5)); }
    catch { /**/ }
    finally { setSearching(false); }
  };

  const clear = async () => {
    if (!confirm('Clear all OttoBot memory? This cannot be undone.')) return;
    setClearing(true);
    try { await api.clearMemory(); setStats(null); setInteractions([]); setResults([]); }
    catch { /**/ }
    finally { setClearing(false); }
  };

  const row: React.CSSProperties = { fontFamily: UI_FONT, fontSize: '12px', color: 'var(--text-secondary)', padding: '7px 0', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '2px' };
  const label: React.CSSProperties = { fontFamily: UI_FONT, fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '4px' };

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto', flex: 1 }}>
      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[['Patterns', stats.patternsCount ?? 0], ['Sessions', stats.sessionsCount ?? 0]].map(([k, v]) => (
            <div key={String(k)} style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
              <div style={{ fontFamily: MONO, fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
              <div style={{ fontFamily: UI_FONT, fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{k}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div>
        <div style={label}>Search memory</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Query patterns…"
            style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid var(--border-input)', borderRadius: '7px', padding: '6px 10px', color: 'var(--text-primary)', fontFamily: UI_FONT, fontSize: '13px', outline: 'none' }}
          />
          <button onClick={search} disabled={searching} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 12px', cursor: 'pointer', fontFamily: UI_FONT, fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(results as Array<Record<string, unknown>>).map((r, i) => (
              <div key={i} style={{ ...row, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-input)' }}>
                <span style={{ fontFamily: UI_FONT, fontSize: '12px', color: 'var(--text-primary)' }}>{String(r.content ?? r.text ?? JSON.stringify(r)).slice(0, 120)}</span>
                {r.similarity != null && <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-muted)' }}>{Number(r.similarity).toFixed(3)} similarity</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent interactions */}
      {interactions.length > 0 && (
        <div>
          <div style={label}>Recent interactions</div>
          {(interactions as Array<Record<string, unknown>>).slice(0, 8).map((item, i) => (
            <div key={i} style={row}>
              <span style={{ color: 'var(--text-primary)', fontFamily: UI_FONT, fontSize: '12px' }}>{String(item.content ?? item.message ?? '').slice(0, 100)}</span>
              {item.created_at != null && <span style={{ fontFamily: MONO, fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(String(item.created_at)).toLocaleString()}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Clear */}
      <button onClick={clear} disabled={clearing} style={{ background: 'color-mix(in srgb, var(--node-error) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--node-error) 22%, transparent)', borderRadius: '7px', padding: '7px 12px', cursor: 'pointer', fontFamily: UI_FONT, fontSize: '12px', color: 'var(--node-error)', marginTop: 'auto' }}>
        {clearing ? 'Clearing…' : 'Clear all memory'}
      </button>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OttoBotPanel() {
  const nodes = useStore(s => s.nodes);
  const edges = useStore(s => s.edges);

  const [tab,        setTab]        = useState<'chat' | 'memory'>('chat');
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState('');
  const [streaming,  setStreaming]   = useState(false);
  const [enabled,    setEnabled]    = useState(true);
  const [credError,  setCredError]  = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  // Fetch workspace settings on mount
  useEffect(() => {
    api.authStatus()
      .then(r => setEnabled(r.workspace?.ottobot_settings?.enabled ?? true))
      .catch(() => setEnabled(true));
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const insights = analyzeWorkflow(nodes, edges);
  const ready = enabled;

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming || !ready) return;
    const userMsg: Message = { role: 'user', content: input.trim(), id: String(Date.now()) };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setStreaming(true);
    setCredError(null);

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    // Include workflow context as a system note in the first user turn if canvas has nodes
    const contextNote = nodes.length > 0
      ? `\n\n[Workflow context: ${nodes.length} nodes, ${edges.length} edges. Analysis: ${insights.map(i => i.text).join(' ')}]`
      : '';
    const historyWithContext = history.map((m, i) =>
      i === 0 ? { ...m, content: m.content + contextNote } : m
    );

    const assistantId = String(Date.now() + 1);
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantId }]);

    abortRef.current = new AbortController();
    try {
      const res = await api.ottobotChat(historyWithContext);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'OttoBot request failed' }));
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: err.error ?? 'Request failed.' } : m));
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { setStreaming(false); return; }
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]' || payload === '[ERROR]') break;
          try {
            const { text } = JSON.parse(payload) as { text?: string };
            if (text) setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + text } : m));
          } catch { /**/ }
        }
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: 'Request failed. Check your connection.' } : m));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, ready, messages, nodes, edges, insights]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); }
  };

  const PROVIDER_LABELS: Record<string, string> = { openai: 'OpenAI', anthropic: 'Anthropic', openrouter: 'OpenRouter' };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-panel)', minWidth: 0 }}>

      {/* Header */}
      <div style={{ height: 36, padding: '0 14px', display: 'flex', alignItems: 'center', gap: '9px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <BotAvatar size={24} />
        <span style={{ fontFamily: UI_FONT, fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.008em' }}>OttoBot</span>

        {/* Ready dot */}
        {ready && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--node-success)', flexShrink: 0 }} />
            <span style={{ fontFamily: UI_FONT, fontSize: '11px', color: 'var(--text-muted)' }}>
              Online
            </span>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Chat / Memory tabs */}
        {['chat', 'memory'].map(t => (
          <button key={t} onClick={() => setTab(t as 'chat' | 'memory')} style={{
            fontFamily: UI_FONT, fontSize: '11px', fontWeight: tab === t ? 600 : 400,
            background: tab === t ? 'var(--bg-hover)' : 'transparent',
            border: '1px solid var(--border)', borderRadius: '5px',
            color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '2px 8px', cursor: 'pointer',
          }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Memory tab */}
      {tab === 'memory' && <MemoryTab />}

      {/* Chat tab */}
      {tab === 'chat' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>

            {/* Disabled CTA */}
            {!enabled && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '24px 16px', textAlign: 'center' }}>
                <BotAvatar size={40} />
                <span style={{ fontFamily: UI_FONT, fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>OttoBot is disabled</span>
                <span style={{ fontFamily: UI_FONT, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  This workspace has disabled the AI assistant. You can re-enable it in Settings.
                </span>
                <button
                  onClick={() => window.location.assign('/app/settings/ottobot')}
                  style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '7px', padding: '7px 14px', cursor: 'pointer', fontFamily: UI_FONT, fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}
                >
                  Manage Settings →
                </button>
              </div>
            )}

            {/* Insights */}
            {messages.length === 0 && enabled && insights.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '4px' }}>
                {insights.map((ins, i) => (
                  <div key={i} style={{
                    background: ins.type === 'parallel' ? 'color-mix(in srgb, var(--node-success) 8%, transparent)' : ins.type === 'pattern' ? 'color-mix(in srgb, var(--node-running) 8%, transparent)' : 'var(--bg-hover)',
                    border: `1px solid ${ins.type === 'parallel' ? 'color-mix(in srgb, var(--node-success) 18%, transparent)' : ins.type === 'pattern' ? 'color-mix(in srgb, var(--node-running) 18%, transparent)' : 'var(--border)'}`,
                    borderRadius: '7px', padding: '7px 10px',
                  }}>
                    {ins.highlight && <div style={{ fontFamily: UI_FONT, fontSize: '11px', fontWeight: 700, color: ins.type === 'parallel' ? 'var(--node-success)' : 'var(--node-running)', marginBottom: '2px' }}>{ins.highlight}</div>}
                    <div style={{ fontFamily: UI_FONT, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{ins.text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Messages */}
            {messages.map(msg => (
              <div key={msg.id} style={{ display: 'flex', gap: '8px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <span style={{ flexShrink: 0, marginTop: 2 }}><BotAvatar size={22} /></span>
                )}
                <div style={{
                  maxWidth: '82%',
                  background: msg.role === 'user' ? 'var(--accent-dim)' : 'var(--bg-input)',
                  border: `1px solid ${msg.role === 'user' ? 'var(--brand-ring)' : 'var(--border)'}`,
                  borderRadius: '10px',
                  padding: '8px 11px',
                  fontFamily: UI_FONT,
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.content ? msg.content : (streaming && msg.role === 'assistant' ? <span style={{ opacity: 0.4, animation: 'otto-pulse 1s ease-in-out infinite' }}>●●●</span> : null)}
                </div>
              </div>
            ))}

            <div ref={bottomRef} />
          </div>

          {/* Error */}
          {credError && (
            <div style={{ padding: '6px 14px', fontFamily: UI_FONT, fontSize: '11px', color: 'var(--node-error)', background: 'color-mix(in srgb, var(--node-error) 8%, transparent)', borderTop: '1px solid var(--border)' }}>
              {credError}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', display: 'flex', gap: '7px', alignItems: 'flex-end', flexShrink: 0 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={ready ? 'Ask OttoBot about your workflow…' : 'Connect a credential to chat'}
              disabled={!ready || streaming}
              rows={1}
              style={{
                flex: 1,
                fontFamily: UI_FONT,
                fontSize: '13px',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-input)',
                borderRadius: '8px',
                padding: '7px 10px',
                color: 'var(--text-primary)',
                resize: 'none',
                outline: 'none',
                lineHeight: 1.4,
                maxHeight: '80px',
                overflowY: 'auto',
                opacity: ready ? 1 : 0.5,
              }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim() || !ready || streaming}
              style={{
                width: 32, height: 32, borderRadius: '8px',
                background: input.trim() && ready && !streaming ? 'var(--accent-strong)' : 'var(--bg-hover)',
                border: '1px solid var(--border)',
                cursor: input.trim() && ready && !streaming ? 'pointer' : 'not-allowed',
                color: input.trim() && ready && !streaming ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.1s, color 0.1s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </button>
          </div>
          <div style={{ padding: '0 10px 8px', textAlign: 'center', fontFamily: UI_FONT, fontSize: '10px', color: 'var(--text-muted)' }}>
            OttoBot uses your workspace credentials if not configured personally.
          </div>
        </>
      )}
    </div>
  );
}
