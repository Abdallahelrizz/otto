export interface HandleDef {
  id: string;
  label?: string;
  color?: string;
  side?: 'left' | 'right' | 'bottom';
}

export interface NodeTypeDef {
  type: string;
  category: 'triggers' | 'core' | 'ai' | 'data';
  label: string;
  description: string;
  color: string;
  complex?: boolean;
  slug?: string;
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

export const CATEGORY_COLORS: Record<string, string> = {
  triggers: '#f59e0b',
  core:     '#64748b',
  ai:       '#8b5cf6',
  data:     '#06b6d4',
};

export const CATEGORY_EDGE_COLOR: Record<string, string> = {
  triggers: '#f59e0b',
  core:     'rgba(255,255,255,0.2)',
  ai:       '#8b5cf6',
  data:     '#06b6d4',
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
    color: '#f59e0b',
    slug: 'WEBHK',
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
    color: '#64748b',
    slug: 'HTTP',
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
    color: '#64748b',
    slug: 'IF',
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
    color: '#64748b',
    slug: 'MERGE',
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
    color: '#64748b',
    slug: 'SET',
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
    color: '#64748b',
    slug: 'CODE',
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
    color: '#64748b',
    slug: 'DELAY',
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
    color: '#64748b',
    slug: 'FLTR',
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
    color: '#64748b',
    slug: 'LOOP',
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
    color: '#64748b',
    slug: 'SUBFL',
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
    color: '#64748b',
    slug: 'EMAIL',
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
    color: '#8b5cf6',
    slug: 'LLM',
    complex: true,
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
      extras: [{ id: 'model', label: 'model', side: 'bottom' }],
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
    color: '#8b5cf6',
    slug: 'AGENT',
    complex: true,
    handles: {
      in: [{ id: 'input' }],
      out: [{ id: 'output' }],
      extras: [
        { id: 't1', label: '1', side: 'bottom' },
        { id: 't2', label: '2', side: 'bottom' },
        { id: 't3', label: '3', side: 'bottom' },
        { id: 't4', label: '4', side: 'bottom' },
        { id: 't5', label: '5', side: 'bottom' },
      ],
    },
    defaultConfig: { model: 'gpt-4o', systemPrompt: 'You are a helpful assistant.', tools: '[]', maxSteps: 10 },
    fields: [
      { key: 'model', label: 'Model', type: 'text' },
      { key: 'systemPrompt', label: 'System Prompt', type: 'textarea' },
      { key: 'tools', label: 'Tools (JSON array)', type: 'code' },
      { key: 'maxSteps', label: 'Max steps', type: 'number' },
    ],
  },
  {
    type: 'vector_search',
    category: 'ai',
    label: 'Vector Search',
    description: 'Semantic similarity search',
    color: '#8b5cf6',
    slug: 'VEC',
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
    color: '#06b6d4',
    slug: 'PG',
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
    color: '#06b6d4',
    slug: 'GET',
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
    color: '#06b6d4',
    slug: 'SET',
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
