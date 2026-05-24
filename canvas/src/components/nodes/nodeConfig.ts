export interface HandleDef {
  id: string;
  label?: string;
  color?: string;
  side?: 'left' | 'right' | 'bottom';
}

export interface AgentTool {
  id: string;
  name: string;
  type: string;
}

export interface NodeTypeDef {
  type: string;
  category: 'triggers' | 'core' | 'ai' | 'data';
  label: string;
  description: string;
  color: string;
  tint: NodeTint;
  serviceColor?: string;
  complex?: boolean;
  slug?: string;
  tag?: string;
  subtitle?: (config: Record<string, unknown>) => string;
  handles: {
    in: HandleDef[];
    out: HandleDef[];
    extras?: HandleDef[];
  };
  defaultConfig: Record<string, unknown>;
  fields: FieldDef[];
}

export type FieldDef =
  | { key: string; label: string; type: 'text' | 'textarea' | 'number' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'assignments' }
  | { key: string; label: string; type: 'conditions' }
  | { key: string; label: string; type: 'code' };

// ─── v5 amber brand system ────────────────────────────────────────────────────

export const OTTO_AMBER       = '#FF6F1A';
export const OTTO_AMBER_HOVER = '#FF8A47';

// Shape encodes what a node DOES — driven by category
export const CATEGORY_SHAPE: Record<string, 'rounded' | 'circle' | 'square-soft' | 'square-tight'> = {
  triggers: 'rounded',
  ai:       'circle',
  core:     'square-soft',
  data:     'square-tight',
};

// Color encodes WHAT a node IS — per-node tint
export type NodeTint = 'amber' | 'service' | 'neutral';

// Real service brand colors — only used when tint === 'service'
export const SERVICE = {
  postgres:  '#336791',
  openai:    '#10A37F',
  anthropic: '#D97757',
  slack:     '#611F69',
  twilio:    '#F22F46',
  github:    '#1F2328',
  stripe:    '#635BFF',
  redis:     '#DC382D',
} as const;

// Edge colors — neutral, not category-tinted
export const EDGE_COLOR_DARK  = 'rgba(255,255,255,0.16)';
export const EDGE_COLOR_LIGHT = 'rgba(15,15,10,0.18)';

// Resolve the display color for a node, theme-aware
export function nodeColor(def: NodeTypeDef, theme: 'dark' | 'light'): string {
  if (def.tint === 'amber')   return OTTO_AMBER;
  if (def.tint === 'service') return def.serviceColor ?? '#94A3B8';
  return theme === 'dark' ? '#A1A1AA' : '#52525B';
}

// Resolve the icon-container border-radius for a node
export function nodeRadius(def: NodeTypeDef): string {
  const shape = CATEGORY_SHAPE[def.category];
  if (shape === 'circle')        return '50%';
  if (shape === 'rounded')       return '7px';
  if (shape === 'square-tight')  return '2px';
  return '4px';
}

// ─── Legacy exports — kept for backwards compatibility ────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  triggers: OTTO_AMBER,
  core:     '#A1A1AA',
  ai:       OTTO_AMBER,
  data:     '#A1A1AA',
};

export const CATEGORY_EDGE_COLOR: Record<string, string> = {
  triggers: EDGE_COLOR_DARK,
  core:     EDGE_COLOR_DARK,
  ai:       EDGE_COLOR_DARK,
  data:     EDGE_COLOR_DARK,
};

export const CATEGORY_ICON_WEIGHT: Record<string, string> = {
  triggers: 'bold',
  core:     'bold',
  ai:       'bold',
  data:     'bold',
};

export const NODE_CATEGORIES = [
  { id: 'triggers',    label: 'TRIGGERS' },
  { id: 'core',        label: 'CORE' },
  { id: 'ai',          label: 'AI' },
  { id: 'data',        label: 'DATA' },
] as const;

export const NODE_TYPE_DEFS: NodeTypeDef[] = [

  // ─── TRIGGERS ──────────────────────────────────────────────
  {
    type: 'webhook_trigger',
    category: 'triggers',
    label: 'Webhook',
    description: 'Receive HTTP requests',
    color: OTTO_AMBER,
    tint: 'amber',
    slug: 'TRIGGER',
    tag: 'TRIGGER',
    subtitle: (c) => `POST /${(c.path as string) || 'my-webhook'}`,
    handles: {
      in: [],
      out: [{ id: 'output' }],
    },
    defaultConfig: { path: 'my-webhook' },
    fields: [{ key: 'path', label: 'Path', type: 'text' }],
  },

  // ─── CORE ──────────────────────────────────────────────────
  {
    type: 'http_request',
    category: 'core',
    label: 'HTTP Request',
    description: 'Call any REST API',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'HTTP',
    tag: 'ACTION',
    subtitle: (c) => `${(c.method as string) || 'GET'} · ${(c.url as string) || 'no url set'}`,
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: {
      url: '',
      method: 'GET',
      headers: [],
      body: '',
      authType: 'none',
      authKey: '',
      authValue: '',
      authUsername: '',
      authPassword: '',
    },
    fields: [],
  },
  {
    type: 'if',
    category: 'core',
    label: 'IF Condition',
    description: 'Branch on conditions',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'IF',
    tag: 'BRANCH',
    subtitle: (c) => {
      const conds = (c.conditions as unknown[]) || [];
      return `${conds.length} condition${conds.length !== 1 ? 's' : ''}`;
    },
    complex: true,
    handles: {
      in: [{ id: 'input' }],
      out: [
        { id: 'true',  label: 'true',  color: '#22c55e' },
        { id: 'false', label: 'false', color: '#ef4444' },
      ],
    },
    defaultConfig: { conditions: [{ left: 'confidence', operator: '>=', right: '0.75' }], combinator: 'and' },
    fields: [{ key: 'conditions', label: 'Conditions', type: 'conditions' }],
  },
  {
    type: 'merge',
    category: 'core',
    label: 'Merge',
    description: 'Combine parallel branches',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'MERGE',
    tag: 'MERGE',
    subtitle: (c) => (c.mode as string) || 'merge-object',
    complex: true,
    handles: {
      in: [
        { id: 'in1', label: 'input 1' },
        { id: 'in2', label: 'input 2' },
        { id: 'in3', label: 'input 3' },
      ],
      out: [{ id: 'output' }],
    },
    defaultConfig: { mode: 'merge-object' },
    fields: [
      { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'merge-object', label: 'Merge Object' }, { value: 'collect-array', label: 'Collect Array' }] },
    ],
  },
  {
    type: 'set',
    category: 'core',
    label: 'Set / Transform',
    description: 'Shape and rename fields',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'SET',
    tag: 'ACTION',
    subtitle: (c) => {
      const a = (c.assignments as unknown[]) || [];
      return `${a.length} field${a.length !== 1 ? 's' : ''}`;
    },
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { mode: 'set', assignments: [] },
    fields: [
      { key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'set', label: 'Set only' }, { value: 'merge', label: 'Merge with input' }] },
      { key: 'assignments', label: 'Assignments', type: 'assignments' },
    ],
  },
  {
    type: 'code',
    category: 'core',
    label: 'Code (JS)',
    description: 'Run arbitrary JavaScript',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'CODE',
    tag: 'CODE',
    subtitle: () => 'JavaScript',
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { code: 'return input;' },
    fields: [{ key: 'code', label: 'JavaScript', type: 'code' }],
  },
  {
    type: 'delay',
    category: 'core',
    label: 'Delay',
    description: 'Wait before continuing',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'DELAY',
    tag: 'DELAY',
    subtitle: (c) => `${c.amount || 1000} ${c.unit || 'ms'}`,
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { amount: 1000, unit: 'ms' },
    fields: [
      { key: 'amount', label: 'Amount', type: 'number' },
      { key: 'unit', label: 'Unit', type: 'select', options: [{ value: 'ms', label: 'Milliseconds' }, { value: 's', label: 'Seconds' }, { value: 'm', label: 'Minutes' }] },
    ],
  },
  {
    type: 'filter',
    category: 'core',
    label: 'Filter',
    description: 'Drop items that don\'t match',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'FILTER',
    tag: 'FILTER',
    subtitle: (c) => {
      const conds = (c.conditions as unknown[]) || [];
      return `${conds.length} condition${conds.length !== 1 ? 's' : ''}`;
    },
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { conditions: [] },
    fields: [{ key: 'conditions', label: 'Keep when', type: 'conditions' }],
  },
  {
    type: 'loop',
    category: 'core',
    label: 'Loop',
    description: 'Iterate over an array',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'LOOP',
    tag: 'LOOP',
    subtitle: (c) => `over ${(c.over as string) || 'items'}`,
    complex: true,
    handles: {
      in: [{ id: 'input' }],
      out: [
        { id: 'loop', label: 'loop' },
        { id: 'done', label: 'done' },
      ],
    },
    defaultConfig: { over: 'input.items', limit: 100 },
    fields: [
      { key: 'over', label: 'Array path', type: 'text' },
      { key: 'limit', label: 'Max iterations', type: 'number' },
    ],
  },
  {
    type: 'sub_workflow',
    category: 'core',
    label: 'Sub-workflow',
    description: 'Call another workflow',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'SUB',
    tag: 'SUB',
    subtitle: (c) => (c.workflowId as string) || 'not configured',
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { workflowId: '' },
    fields: [{ key: 'workflowId', label: 'Workflow ID', type: 'text' }],
  },
  {
    type: 'send_email',
    category: 'core',
    label: 'Send Email',
    description: 'Send an email via SMTP',
    color: '#A1A1AA',
    tint: 'neutral',
    slug: 'EMAIL',
    tag: 'ACTION',
    subtitle: (c) => `to ${(c.to as string) || 'not set'}`,
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { to: '', subject: '', body: '' },
    fields: [
      { key: 'to', label: 'To', type: 'text' },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'body', label: 'Body', type: 'textarea' },
    ],
  },

  // ─── AI ────────────────────────────────────────────────────
  {
    type: 'llm_call',
    category: 'ai',
    label: 'LLM Call',
    description: 'Call any language model',
    color: OTTO_AMBER,
    tint: 'amber',
    slug: 'LLM',
    tag: 'LLM',
    subtitle: (c) => `${(c.provider as string) || 'openai'} · ${(c.model as string) || 'gpt-4o-mini'}`,
    complex: true,
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { provider: 'openai', model: 'gpt-4o-mini', apiKey: '', systemPrompt: '', userPrompt: '{{ input.message }}', temperature: 0.7, maxTokens: 1000 },
    fields: [
      { key: 'provider', label: 'Provider', type: 'select', options: [{ value: 'openai', label: 'OpenAI' }, { value: 'anthropic', label: 'Anthropic' }, { value: 'openrouter', label: 'OpenRouter' }] },
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
      { key: 'userPrompt', label: 'User Prompt', type: 'textarea' },
      { key: 'temperature', label: 'Temperature (0–1)', type: 'number' },
      { key: 'maxTokens', label: 'Max Tokens', type: 'number' },
    ],
  },
  {
    type: 'ai_agent',
    category: 'ai',
    label: 'AI Agent',
    description: 'Autonomous LLM agent with tools',
    color: OTTO_AMBER,
    tint: 'amber',
    slug: 'AGENT',
    tag: 'MAIN',
    subtitle: (c) => `Autonomous · ${(c.model as string) || 'gpt-4o'}`,
    complex: true,
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: {
      model: 'gpt-4o',
      systemPrompt: 'You are a helpful assistant.',
      tools: [
        { id: 't1', name: 'CRM lookup',         type: 'http_request'   },
        { id: 't2', name: 'Customer DB',         type: 'postgres_query' },
        { id: 't3', name: 'Past conversations',  type: 'memory_read'    },
        { id: 't4', name: 'Calculator',          type: 'code_js'        },
      ],
      maxSteps: 10,
    },
    fields: [
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
      { key: 'maxSteps', label: 'Max steps', type: 'number' },
    ],
  },
  {
    type: 'vector_search',
    category: 'ai',
    label: 'Vector Search',
    description: 'Semantic similarity search',
    color: OTTO_AMBER,
    tint: 'amber',
    slug: 'VEC',
    tag: 'VEC',
    subtitle: (c) => (c.collection as string) || 'memory',
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { query: '{{ input.text }}', collection: 'memory', topK: 5 },
    fields: [
      { key: 'query', label: 'Query', type: 'text' },
      { key: 'collection', label: 'Collection', type: 'text' },
      { key: 'topK', label: 'Top K', type: 'number' },
    ],
  },

  // ─── DATA ──────────────────────────────────────────────────
  {
    type: 'postgres_query',
    category: 'data',
    label: 'Postgres Query',
    description: 'Run a SQL query',
    color: SERVICE.postgres,
    tint: 'service',
    serviceColor: SERVICE.postgres,
    slug: 'PG',
    tag: 'ACTION',
    subtitle: (c) => {
      const q = (c.query as string) || '';
      const preview = q.replace(/\s+/g, ' ').trim().slice(0, 22);
      return preview.length < q.trim().length ? preview + '…' : preview || 'no query';
    },
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { query: 'SELECT * FROM table WHERE id = $1', params: '[]' },
    fields: [
      { key: 'query', label: 'SQL Query', type: 'code' },
      { key: 'params', label: 'Parameters (JSON array)', type: 'code' },
    ],
  },
  {
    type: 'redis_get',
    category: 'data',
    label: 'Redis Get',
    description: 'Read a value from Redis',
    color: SERVICE.redis,
    tint: 'service',
    serviceColor: SERVICE.redis,
    slug: 'R-GET',
    tag: 'ACTION',
    subtitle: (c) => (c.key as string) || '{{ input.key }}',
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { key: '{{ input.key }}' },
    fields: [{ key: 'key', label: 'Key', type: 'text' }],
  },
  {
    type: 'redis_set',
    category: 'data',
    label: 'Redis Set',
    description: 'Write a value to Redis',
    color: SERVICE.redis,
    tint: 'service',
    serviceColor: SERVICE.redis,
    slug: 'R-SET',
    tag: 'ACTION',
    subtitle: (c) => `${(c.key as string) || 'key'} · ${(c.ttl as number) || 3600}s`,
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: { key: '{{ input.key }}', value: '{{ input.value }}', ttl: 3600 },
    fields: [
      { key: 'key', label: 'Key', type: 'text' },
      { key: 'value', label: 'Value', type: 'text' },
      { key: 'ttl', label: 'TTL (seconds)', type: 'number' },
    ],
  },
];

export const NODE_TYPE_MAP = Object.fromEntries(NODE_TYPE_DEFS.map(d => [d.type, d]));

export function getNodeDef(type: string): NodeTypeDef {
  return NODE_TYPE_MAP[type] ?? {
    type,
    category: 'core' as const,
    label: type,
    description: '',
    color: '#64748b',
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
    },
    defaultConfig: {},
    fields: [],
  };
}
