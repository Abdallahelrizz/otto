import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { getNodeDef } from '../nodes/nodeConfig';
import type { Node, Edge } from 'reactflow';

const AMBER = '#A13C3F';
const OTTOBOT_KEY_STORAGE = 'otto_ottobot_openai_key';

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  role: 'user' | 'assistant';
  content: string;
  id: string;
};

type Insight = {
  type: 'parallel' | 'composition' | 'pattern';
  text: string;
  highlight?: string;
};

// ─── DAG analysis helpers ─────────────────────────────────────────────────────

function buildAdjacency(nodes: Node[], edges: Edge[]) {
  const parents: Record<string, Set<string>> = {};
  const children: Record<string, Set<string>> = {};
  for (const n of nodes) {
    parents[n.id] = new Set();
    children[n.id] = new Set();
  }
  for (const e of edges) {
    if (parents[e.target]) parents[e.target].add(e.source);
    if (children[e.source]) children[e.source].add(e.target);
  }
  return { parents, children };
}

/** Get all ancestors (transitive) of a node */
function getAncestors(nodeId: string, parents: Record<string, Set<string>>): Set<string> {
  const visited = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const p of (parents[cur] ?? new Set())) {
      if (!visited.has(p)) {
        visited.add(p);
        stack.push(p);
      }
    }
  }
  return visited;
}

function analyzeWorkflow(nodes: Node[], edges: Edge[]): Insight[] {
  const insights: Insight[] = [];

  if (nodes.length === 0) {
    return [{ type: 'composition', text: 'Canvas is empty — drag nodes in from the sidebar to get started.' }];
  }

  const { parents, children } = buildAdjacency(nodes, edges);

  // ── 1. Composition stats ──────────────────────────────────────────────────
  const categoryCounts: Record<string, number> = {};
  for (const n of nodes) {
    const nodeType = (n.data?.nodeType as string) ?? '';
    const def = getNodeDef(nodeType);
    const cat = def?.category ?? 'core';
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  const catParts: string[] = [];
  if (categoryCounts.triggers) catParts.push(`${categoryCounts.triggers} trigger${categoryCounts.triggers > 1 ? 's' : ''}`);
  if (categoryCounts.ai)       catParts.push(`${categoryCounts.ai} AI node${categoryCounts.ai > 1 ? 's' : ''}`);
  if (categoryCounts.core)     catParts.push(`${categoryCounts.core} core node${categoryCounts.core > 1 ? 's' : ''}`);
  if (categoryCounts.data)     catParts.push(`${categoryCounts.data} data node${categoryCounts.data > 1 ? 's' : ''}`);

  insights.push({
    type: 'composition',
    text: `This workflow has ${nodes.length} node${nodes.length > 1 ? 's' : ''}: ${catParts.join(', ')}.`,
  });

  // ── 2. Isolated nodes ─────────────────────────────────────────────────────
  const isolated = nodes.filter(
    (n) => (parents[n.id]?.size ?? 0) === 0 && (children[n.id]?.size ?? 0) === 0
  );
  if (isolated.length > 0) {
    const names = isolated.slice(0, 3).map((n) => `"${(n.data?.label as string) ?? n.id}"`).join(', ');
    insights.push({
      type: 'pattern',
      text: `${isolated.length} node${isolated.length > 1 ? 's are' : ' is'} isolated (no connections): ${names}. Connect them or remove them.`,
    });
  }

  // ── 3. Parallelization analysis ───────────────────────────────────────────
  if (nodes.length >= 2) {
    const ancestorMap = new Map<string, Set<string>>();
    for (const n of nodes) {
      ancestorMap.set(n.id, getAncestors(n.id, parents));
    }

    // Find pairs with no path between them (neither is ancestor of the other)
    const parallelPairs: [Node, Node][] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const aAnc = ancestorMap.get(a.id)!;
        const bAnc = ancestorMap.get(b.id)!;
        if (!aAnc.has(b.id) && !bAnc.has(a.id)) {
          parallelPairs.push([a, b]);
        }
      }
    }

    // Count unique nodes involved in parallel relationships
    const parallelNodeIds = new Set<string>();
    for (const [a, b] of parallelPairs) {
      parallelNodeIds.add(a.id);
      parallelNodeIds.add(b.id);
    }

    if (parallelNodeIds.size === 0) {
      insights.push({
        type: 'parallel',
        text: `All ${nodes.length} nodes are fully sequential. If any steps are independent, connecting them in parallel will speed up execution.`,
      });
    } else {
      // How many distinct "parallel groups" are there?
      const numParallelNodes = parallelNodeIds.size;
      insights.push({
        type: 'parallel',
        highlight: `${numParallelNodes} nodes run in parallel`,
        text: `${numParallelNodes} of ${nodes.length} nodes can run in parallel — Otto executes them concurrently with Promise.all() for maximum throughput.`,
      });
    }
  }

  // ── 4. LLM chaining anti-pattern ─────────────────────────────────────────
  const llmTypes = new Set(['llm_call', 'ai_agent']);
  const llmNodes = nodes.filter((n) => llmTypes.has((n.data?.nodeType as string) ?? ''));

  if (llmNodes.length >= 2) {
    const llmIds = new Set(llmNodes.map((n) => n.id));
    const chainPairs: [string, string][] = [];
    for (const e of edges) {
      if (llmIds.has(e.source) && llmIds.has(e.target)) {
        const srcLabel = nodes.find((n) => n.id === e.source)?.data?.label as string ?? e.source;
        const tgtLabel = nodes.find((n) => n.id === e.target)?.data?.label as string ?? e.target;
        chainPairs.push([srcLabel, tgtLabel]);
      }
    }
    if (chainPairs.length > 0) {
      const example = chainPairs[0];
      insights.push({
        type: 'pattern',
        text: `LLM chaining detected: "${example[0]}" feeds directly into "${example[1]}". Each chained LLM call adds latency — consider whether the second prompt could incorporate the first as context instead.`,
      });
    }
  }

  return insights;
}

// ─── Credential helpers ───────────────────────────────────────────────────────

function loadStoredApiKey(): string {
  try { return localStorage.getItem(OTTOBOT_KEY_STORAGE) ?? ''; }
  catch { return ''; }
}

function saveStoredApiKey(key: string) {
  try { localStorage.setItem(OTTOBOT_KEY_STORAGE, key); }
  catch { /* ignore */ }
}

// ─── Streaming LLM call ───────────────────────────────────────────────────────

async function streamOpenAI(
  apiKey: string,
  systemPrompt: string,
  messages: Message[],
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (err: string) => void
) {
  const body = {
    model: 'gpt-4o-mini',
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      onError(`OpenAI error ${res.status}: ${errText}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) { onError('No response body'); return; }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const json = JSON.parse(trimmed.slice(6));
            const delta = json.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) onToken(delta);
          } catch { /* skip malformed chunk */ }
        }
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  id: 'welcome',
  content:
    'Your agent runs **CRM lookup** and **Chat history** sequentially. They have no shared deps — running them in parallel cuts agent latency by **~2.3×**.',
};

export function OttoBotPanel() {
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const workflowName = useStore((s) => s.workflowName);

  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [apiKey, setApiKey] = useState<string>(loadStoredApiKey);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [analyzed, setAnalyzed] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<boolean>(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-analyze when panel mounts or workflow changes
  useEffect(() => {
    const newInsights = analyzeWorkflow(nodes, edges);
    setInsights(newInsights);

    if (!analyzed && nodes.length > 0) {
      setAnalyzed(true);
      const analysisMsg: Message = {
        role: 'assistant',
        id: genId(),
        content: newInsights.map((ins) => ins.text).join('\n\n'),
      };
      setMessages((prev) => {
        // Don't duplicate if already have analysis
        const hasAnalysis = prev.some((m) => m.id !== 'welcome' && m.role === 'assistant');
        if (hasAnalysis) return prev;
        return [...prev, analysisMsg];
      });
    }
  }, [nodes, edges, analyzed]);

  const buildSystemPrompt = useCallback(() => {
    const nodeSummary = nodes.map((n) => ({
      id: n.id,
      label: n.data?.label,
      type: n.data?.nodeType,
    }));
    const edgeSummary = edges.map((e) => ({ from: e.source, to: e.target }));
    const insightTexts = insights.map((i) => i.text).join('\n');

    return `You are OttoBot, the workflow assistant built into Otto — an AI-era workflow orchestrator.
You are helping a user optimize the workflow named "${workflowName}".

CURRENT WORKFLOW SUMMARY:
- ${nodes.length} nodes, ${edges.length} edges
- Nodes: ${JSON.stringify(nodeSummary)}
- Edges: ${JSON.stringify(edgeSummary)}

ANALYSIS INSIGHTS:
${insightTexts}

Your job:
- Answer questions about this workflow concisely
- Suggest parallelization opportunities (Otto runs nodes with Promise.all() when they have no shared deps)
- Identify anti-patterns: sequential LLM chains, isolated nodes, over-complicated branches
- Suggest node type improvements when relevant
- Be brief, practical, and specific to this workflow — not generic

Formatting: use **bold** for node names. Keep responses under 150 words unless the user asks for detail.`;
  }, [nodes, edges, workflowName, insights]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const effectiveKey = apiKey.trim();
    if (!effectiveKey) {
      setShowKeyInput(true);
      return;
    }

    const userMsg: Message = { role: 'user', content: text, id: genId() };
    const assistantId = genId();
    const assistantMsg: Message = { role: 'assistant', content: '', id: assistantId };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsStreaming(true);
    abortRef.current = false;

    const history = [...messages, userMsg];

    await streamOpenAI(
      effectiveKey,
      buildSystemPrompt(),
      history,
      (token) => {
        if (abortRef.current) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + token } : m
          )
        );
      },
      () => {
        setIsStreaming(false);
      },
      (err) => {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${err}` } : m
          )
        );
      }
    );
  }, [input, isStreaming, apiKey, messages, buildSystemPrompt]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveKey = () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    setApiKey(trimmed);
    saveStoredApiKey(trimmed);
    setShowKeyInput(false);
    setKeyDraft('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const hasKey = apiKey.trim().length > 0;

  // ── Render helper: format message content (basic **bold** support) ───────
  function renderContent(content: string) {
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
      }
      // Handle newlines
      return part.split('\n').map((line, j, arr) => (
        <span key={`${i}-${j}`}>{line}{j < arr.length - 1 ? <br /> : null}</span>
      ));
    });
  }

  return (
    <div style={{
      flex: 1,
      background: 'var(--bg-panel)',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid var(--border)',
      minWidth: 0,
    }}>
      {/* Header */}
      <div style={{
        height: 36,
        padding: '0 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{
          width: 18,
          height: 18,
          borderRadius: '4px',
          background: 'var(--brand-soft)',
          border: '1px solid var(--brand-ring)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        </span>
        <span style={{
          fontSize: '12.5px',
          fontWeight: 600,
          color: 'var(--text-primary)',
          letterSpacing: '-0.008em',
          fontFamily: "'Inter'",
        }}>
          otto bot
        </span>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9.5px',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          fontWeight: 500,
        }}>
          workflow assistant
        </span>
        <div style={{ flex: 1 }} />
        {/* API key indicator */}
        <button
          onClick={() => { setShowKeyInput((v) => !v); setKeyDraft(''); }}
          title={hasKey ? 'OpenAI key set — click to change' : 'Add OpenAI key'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 6px',
            fontSize: '10px',
            fontWeight: 500,
            color: hasKey ? 'var(--node-success)' : 'var(--text-muted)',
            background: 'transparent',
            border: `1px solid ${hasKey ? 'var(--brand-ring)' : 'var(--border)'}`,
            borderRadius: '3px',
            cursor: 'pointer',
            fontFamily: "'Inter'",
          }}
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          {hasKey ? 'key set' : 'add key'}
        </button>
      </div>

      {/* Key input drawer */}
      {showKeyInput && (
        <div style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-input)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: "'Inter'" }}>
            Paste your OpenAI API key. It's stored only in this browser.
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveKey(); }}
              placeholder="sk-..."
              autoFocus
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-input)',
                borderRadius: '4px',
                outline: 'none',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <button
              onClick={handleSaveKey}
              style={{
                padding: '5px 10px',
                background: AMBER,
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Inter'",
              }}
            >
              Save
            </button>
            {hasKey && (
              <button
                onClick={() => { setApiKey(''); saveStoredApiKey(''); setShowKeyInput(false); }}
                style={{
                  padding: '5px 10px',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  fontFamily: "'Inter'",
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{
        flex: 1,
        padding: '12px 14px',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {messages.map((msg) => (
          msg.role === 'assistant' ? (
            <div key={msg.id} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
              <span style={{
                width: 22,
                height: 22,
                borderRadius: '5px',
                background: 'var(--brand-soft)',
                border: '1px solid var(--brand-ring)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '1px',
              }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              </span>
              <p style={{
                fontSize: '12.5px',
                color: msg.content ? 'var(--text-primary)' : 'var(--text-muted)',
                lineHeight: 1.55,
                letterSpacing: '-0.003em',
                margin: 0,
                fontFamily: "'Inter'",
                flex: 1,
                wordBreak: 'break-word',
              }}>
                {msg.content
                  ? renderContent(msg.content)
                  : <span style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
                      <span style={{ animation: 'otto-dot 1.2s 0s infinite both', display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: AMBER }} />
                      <span style={{ animation: 'otto-dot 1.2s 0.2s infinite both', display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: AMBER }} />
                      <span style={{ animation: 'otto-dot 1.2s 0.4s infinite both', display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: AMBER }} />
                    </span>
                }
              </p>
            </div>
          ) : (
            <div key={msg.id} style={{
              alignSelf: 'flex-end',
              maxWidth: '85%',
              padding: '7px 10px',
              background: 'rgba(255,111,26,0.12)',
              border: '1px solid rgba(255,111,26,0.2)',
              borderRadius: '8px 8px 2px 8px',
              fontSize: '12.5px',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
              letterSpacing: '-0.003em',
              fontFamily: "'Inter'",
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </div>
          )
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {!hasKey && !showKeyInput ? (
          <div style={{
            padding: '8px 10px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: '5px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            fontFamily: "'Inter'",
            lineHeight: 1.5,
          }}>
            <button
              onClick={() => setShowKeyInput(true)}
              style={{
                color: AMBER,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
                padding: 0,
                fontFamily: "'Inter'",
              }}
            >
              Add an OpenAI API key
            </button>
            {' '}to enable AI suggestions.
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 10px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: '5px',
            opacity: isStreaming ? 0.7 : 1,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask otto bot to improve this workflow…"
              disabled={isStreaming}
              style={{
                flex: 1,
                fontSize: '12.5px',
                color: 'var(--text-primary)',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                letterSpacing: '-0.005em',
                fontWeight: 400,
                fontFamily: "'Inter'",
              }}
            />
            <button
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              style={{
                background: 'none',
                border: 'none',
                cursor: isStreaming || !input.trim() ? 'default' : 'pointer',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                opacity: isStreaming || !input.trim() ? 0.4 : 1,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={AMBER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Keyframe style for loading dots */}
      <style>{`
        @keyframes otto-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
