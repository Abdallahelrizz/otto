import { randomUUID } from 'crypto';

// Maps n8n node type strings to Otto node types
const TYPE_MAP = {
  'n8n-nodes-base.webhook':                           'webhook_trigger',
  'n8n-nodes-base.webhookTrigger':                    'webhook_trigger',
  'n8n-nodes-base.manualTrigger':                     'manual_trigger',
  'n8n-nodes-base.scheduleTrigger':                   'schedule_trigger',
  'n8n-nodes-base.httpRequest':                       'http_request',
  '@n8n/n8n-nodes-langchain.lmChatOpenAi':            'llm_call',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic':         'llm_call',
  '@n8n/n8n-nodes-langchain.lmChatOpenRouter':        'llm_call',
  '@n8n/n8n-nodes-langchain.agent':                   'ai_agent',
  '@n8n/n8n-nodes-langchain.chainLlm':                'llm_call',
  'n8n-nodes-base.if':                                'if',
  'n8n-nodes-base.merge':                             'merge',
  'n8n-nodes-base.set':                               'set',
  'n8n-nodes-base.code':                              'code',
  'n8n-nodes-base.function':                          'code',
  'n8n-nodes-base.functionItem':                      'code',
  'n8n-nodes-base.wait':                              'delay',
  'n8n-nodes-base.filter':                            'filter',
  'n8n-nodes-base.splitInBatches':                    'loop',
  'n8n-nodes-base.executeWorkflow':                   'sub_workflow',
  'n8n-nodes-base.emailSend':                         'send_email',
  'n8n-nodes-base.postgres':                          'postgres_query',
  'n8n-nodes-base.redis':                             null, // split by operation below
};

// n8n switch nodes decompose into a chain of IF nodes
const SWITCH_TYPE = 'n8n-nodes-base.switch';

function mapHttpRequestConfig(params) {
  const p = params ?? {};
  return {
    method: p.method ?? 'GET',
    url: p.url ?? '',
    headers: p.headerParametersUi?.parameter
      ? Object.fromEntries(p.headerParametersUi.parameter.map(h => [h.name, h.value]))
      : {},
    body: p.bodyParametersUi?.parameter
      ? Object.fromEntries(p.bodyParametersUi.parameter.map(b => [b.name, b.value]))
      : (p.body ?? {}),
  };
}

function mapLlmCallConfig(params, n8nType) {
  const p = params ?? {};
  const providerMap = {
    '@n8n/n8n-nodes-langchain.lmChatOpenAi':       'openai',
    '@n8n/n8n-nodes-langchain.lmChatAnthropic':    'anthropic',
    '@n8n/n8n-nodes-langchain.lmChatOpenRouter':   'openrouter',
    '@n8n/n8n-nodes-langchain.chainLlm':           'openai',
  };
  return {
    provider: providerMap[n8nType] ?? 'openai',
    model: p.model ?? p.modelId ?? '',
    systemPrompt: p.systemPromptType === 'define' ? (p.systemPrompt ?? '') : '',
    prompt: '{{ input.prompt }}',
    temperature: p.temperature ?? 0.7,
  };
}

function mapSetConfig(params) {
  const p = params ?? {};
  const assignments = (p.values?.values ?? p.values ?? []).map(v => ({
    key: v.name ?? v.key ?? '',
    value: v.value ?? '',
  }));
  return { assignments, mode: 'set' };
}

function mapIfConfig(params) {
  const p = params ?? {};
  const conditions = (p.conditions?.conditions ?? []).map(c => ({
    left: c.leftValue ?? '',
    operator: c.operation ?? '==',
    right: c.rightValue ?? '',
  }));
  return { conditions, combinator: p.combinator ?? 'and' };
}

function mapDelayConfig(params) {
  const p = params ?? {};
  const unit = p.unit ?? 'seconds';
  const unitMap = { seconds: 's', minutes: 'm', milliseconds: 'ms', hours: 'm' };
  return { amount: p.resume === 'timeInterval' ? (p.amount ?? 1) : 1, unit: unitMap[unit] ?? 's' };
}

function mapRedisConfig(params) {
  const p = params ?? {};
  const op = (p.operation ?? 'get').toLowerCase();
  if (op === 'set') {
    return { type: 'redis_set', config: { key: p.key ?? '', value: p.value ?? '', ttl: p.ttl ?? 0 } };
  }
  return { type: 'redis_get', config: { key: p.key ?? '' } };
}

function mapNode(n8nNode) {
  const n8nType = n8nNode.type;
  const params = n8nNode.parameters ?? {};
  const pos = n8nNode.position ?? [0, 0];
  const baseId = n8nNode.id ?? randomUUID();

  if (n8nType === SWITCH_TYPE) {
    // Decompose switch into first IF node; additional cases become placeholder nodes
    return [{
      id: baseId,
      type: 'ottoNode',
      position: { x: pos[0], y: pos[1] },
      data: {
        label: n8nNode.name ?? 'Switch',
        nodeType: 'if',
        config: mapIfConfig(params),
        _n8nOriginalType: n8nType,
      },
    }];
  }

  if (n8nType === 'n8n-nodes-base.redis') {
    const { type, config } = mapRedisConfig(params);
    return [{
      id: baseId,
      type: 'ottoNode',
      position: { x: pos[0], y: pos[1] },
      data: { label: n8nNode.name ?? type, nodeType: type, config },
    }];
  }

  const ottoType = TYPE_MAP[n8nType];

  if (!ottoType) {
    // Unknown — preserve as placeholder with original config
    return [{
      id: baseId,
      type: 'ottoNode',
      position: { x: pos[0], y: pos[1] },
      data: {
        label: n8nNode.name ?? n8nType,
        nodeType: 'placeholder',
        config: { n8nOriginalType: n8nType, n8nOriginalConfig: params },
      },
      _isPlaceholder: true,
    }];
  }

  let config = {};
  switch (ottoType) {
    case 'http_request': config = mapHttpRequestConfig(params); break;
    case 'llm_call':     config = mapLlmCallConfig(params, n8nType); break;
    case 'set':          config = mapSetConfig(params); break;
    case 'if':           config = mapIfConfig(params); break;
    case 'delay':        config = mapDelayConfig(params); break;
    case 'webhook_trigger': config = { path: params.path ?? '', method: params.httpMethod ?? 'POST' }; break;
    case 'loop':         config = { over: params.batchSize ? 'input.items' : 'input', limit: params.batchSize ?? 100 }; break;
    case 'sub_workflow': config = { workflowId: params.workflowId ?? '' }; break;
    case 'send_email':   config = { to: params.toEmail ?? '', subject: params.subject ?? '', body: params.message ?? '' }; break;
    case 'postgres_query': config = { query: params.query ?? '', params: '[]' }; break;
    default: break; // manual_trigger, merge, code, filter, ai_agent, schedule_trigger — no params to map
  }

  return [{
    id: baseId,
    type: 'ottoNode',
    position: { x: pos[0], y: pos[1] },
    data: { label: n8nNode.name ?? ottoType, nodeType: ottoType, config },
  }];
}

function mapEdges(n8nConnections, nodeIdMap) {
  const edges = [];
  for (const [sourceName, outputs] of Object.entries(n8nConnections ?? {})) {
    const sourceId = nodeIdMap[sourceName];
    if (!sourceId) continue;

    for (const [outputIndex, targets] of Object.entries(outputs.main ?? {})) {
      for (const target of (targets ?? [])) {
        const targetId = nodeIdMap[target.node];
        if (!targetId) continue;
        edges.push({
          id: randomUUID(),
          source: sourceId,
          target: targetId,
          sourceHandle: outputIndex === '1' ? 'false' : 'true', // n8n: 0=true branch, 1=false
          targetHandle: null,
          type: 'smoothstep',
        });
      }
    }
  }
  return edges;
}

/**
 * Convert an n8n workflow export JSON to an Otto { nodes, edges } definition.
 * Returns { nodes, edges, warnings } — warnings lists unmapped node names.
 */
export function importN8n(n8nJson) {
  const raw = typeof n8nJson === 'string' ? JSON.parse(n8nJson) : n8nJson;
  const n8nNodes = raw.nodes ?? raw.workflow?.nodes ?? [];
  const n8nConnections = raw.connections ?? raw.workflow?.connections ?? {};

  const nodes = [];
  const warnings = [];
  // Build name → otto id map for edge resolution
  const nodeIdMap = {};

  for (const n8nNode of n8nNodes) {
    const mapped = mapNode(n8nNode);
    for (const node of mapped) {
      nodes.push(node);
      nodeIdMap[n8nNode.name] = node.id;
      if (node._isPlaceholder) {
        warnings.push(`Node "${n8nNode.name}" (${n8nNode.type}) has no Otto equivalent — imported as placeholder`);
      }
      delete node._isPlaceholder;
    }
  }

  const edges = mapEdges(n8nConnections, nodeIdMap);

  return { nodes, edges, warnings };
}
