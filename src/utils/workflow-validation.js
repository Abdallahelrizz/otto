import vm from 'vm';
import { getNodeHandler } from '../nodes/index.js';

const TRIGGER_TYPES = new Set(['webhook_trigger', 'manual_trigger', 'schedule_trigger', 'form_trigger', 'chat_trigger']);
const BLOCKED_EXPRESSION_TOKENS = /\b(?:constructor|__proto__|prototype|process|global|globalThis|require|module|import|Function|eval)\b/;
const EXPRESSION_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;

const NODE_SCHEMAS = {
  webhook_trigger: { required: ['path', 'method'] },
  form_trigger: { required: ['path', 'title', 'fieldsJson'], jsonFields: [{ field: 'fieldsJson', expected: 'array' }] },
  chat_trigger: { required: ['path', 'sessionField', 'messageField'] },
  schedule_trigger: {
    requiredWhen: [
      { when: (config) => config.mode === 'cron', fields: ['cron'] },
      { when: (config) => config.mode !== 'cron', fields: ['every', 'unit'] },
    ],
  },
  http_request: { required: ['url'], jsonFields: ['headers'] },
  llm_call: { required: ['provider', 'model'] },
  parallel_ai: { required: ['targetsJson'], jsonFields: [{ field: 'targetsJson', expected: 'array' }] },
  ai_agent: { required: ['model'], jsonFields: ['tools'] },
  if: { warningWhenEmpty: ['conditions'] },
  filter: { warningWhenEmpty: ['conditions'] },
  loop: { required: ['over'] },
  sub_workflow: { required: ['workflowId'] },
  send_email: { required: ['to', 'subject'], credentialAny: ['credentialId'] },
  postgres_query: { required: ['query'], jsonFields: [{ field: 'params', expected: 'array' }] },
  redis_get: { required: ['key'] },
  redis_set: { required: ['key'] },
  vector_search: { required: ['query'] },
  memory_read: { required: ['mode'] },
  memory_write: { required: ['mode'] },
  read_file: { required: ['path', 'binaryProperty'] },
  write_file: { required: ['path', 'binaryProperty'] },
  move_binary_data: { required: ['mode', 'sourceField', 'targetField', 'binaryProperty'] },
  list_files: { required: ['path'] },
  binary_metadata: {
    required: ['source'],
    requiredWhen: [
      { when: (config) => (config.source ?? 'input') === 'input', fields: ['binaryProperty'] },
      { when: (config) => config.source === 'id', fields: ['binaryId'] },
    ],
  },
  s3_object: {
    required: ['operation', 'bucket'],
    requiredWhen: [
      { when: (config) => ['get', 'put', 'delete', 'head'].includes(config.operation), fields: ['key'] },
      { when: (config) => config.operation === 'put' && config.sourceMode === 'binary', fields: ['binaryProperty'] },
    ],
  },
  csv_parse: { required: ['delimiter', 'hasHeader'] },
  csv_stringify: { required: ['delimiter', 'includeHeader'] },
  xml_parse: {},
  xml_stringify: { required: ['rootName'] },
  html_extract: { required: ['selector', 'attribute'] },
  json_transform: {
    required: ['operation'],
    requiredWhen: [
      { when: (config) => config.operation === 'set', fields: ['path'] },
      { when: (config) => ['pick', 'omit'].includes(config.operation), fields: ['paths'] },
      { when: (config) => ['set', 'merge'].includes(config.operation), fields: ['setValue'] },
    ],
  },
  compression: { required: ['operation'] },
  code: { required: ['language', 'code'] },
  crypto: { required: ['operation'], requiredWhen: [{ when: (config) => String(config.operation ?? '').startsWith('hmac-'), fields: ['secret'] }] },
  datetime: { required: ['operation'] },
  jwt: {
    required: ['operation'],
    requiredWhen: [
      { when: (config) => config.operation === 'sign', fields: ['payload', 'secret', 'algorithm'] },
      { when: (config) => config.operation === 'verify', fields: ['token', 'secret', 'algorithm'] },
      { when: (config) => config.operation === 'decode', fields: ['token'] },
    ],
    jsonFields: ['payload'],
  },
  slack_send_message: { required: ['channel', 'text'], credentialAny: ['credentialId', 'token'], jsonFields: ['blocksJson'] },
  discord_send_message: { required: ['content'], credentialAny: ['credentialId', 'webhookUrl'], jsonFields: ['embedsJson'] },
  telegram_send_message: { required: ['chatId', 'text'], credentialAny: ['credentialId', 'botToken'] },
  github_api: { required: ['method', 'path'], jsonFields: ['body'] },
  notion_api: { required: ['method', 'path', 'notionVersion'], credentialAny: ['credentialId', 'token'], jsonFields: ['body'] },
  airtable_records: {
    required: ['operation', 'baseId', 'tableName'],
    requiredWhen: [{ when: (config) => ['update', 'delete'].includes(config.operation), fields: ['recordId'] }],
    credentialAny: ['credentialId', 'token'],
    jsonFields: ['fieldsJson'],
  },
  graphql_request: { required: ['endpoint', 'query'], jsonFields: ['variablesJson'] },
};

const SAVE_BLOCKING_CODES = new Set([
  'definition_shape',
  'node_id_missing',
  'duplicate_node_id',
  'node_type_missing',
  'edge_endpoint_missing',
  'edge_node_missing',
  'cycle',
]);

export function validateWorkflowDefinition(definition, options = {}) {
  const issues = [];
  const normalized = normalizeDefinition(definition);
  const nodes = normalized.nodes;
  const edges = normalized.edges;

  if (!normalized.validShape) {
    issues.push(makeIssue({
      code: 'definition_shape',
      message: 'Workflow definition must contain nodes and edges arrays.',
    }));
    return buildResult(issues, options);
  }

  const nodeIds = new Set();
  const nodeById = new Map();
  for (const node of nodes) {
    if (!node.id) {
      issues.push(makeIssue({ node, code: 'node_id_missing', message: 'Node is missing an id.' }));
      continue;
    }
    if (nodeIds.has(node.id)) {
      issues.push(makeIssue({ node, code: 'duplicate_node_id', message: `Duplicate node id "${node.id}".` }));
    }
    nodeIds.add(node.id);
    nodeById.set(node.id, node);
  }

  const incoming = new Map([...nodeIds].map((id) => [id, []]));
  const outgoing = new Map([...nodeIds].map((id) => [id, []]));

  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      issues.push(makeIssue({
        code: 'edge_endpoint_missing',
        field: edge.id ?? null,
        message: 'Edge is missing a source or target node.',
      }));
      continue;
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push(makeIssue({
        code: 'edge_node_missing',
        field: edge.id ?? null,
        message: `Edge "${edge.id ?? `${edge.source}->${edge.target}`}" references a missing node.`,
      }));
      continue;
    }
    incoming.get(edge.target).push(edge);
    outgoing.get(edge.source).push(edge);
  }

  addCycleIssues(nodes, incoming, issues);

  for (const node of nodes) {
    validateNode(node, incoming.get(node.id) ?? [], issues, options);
  }

  return buildResult(issues, options);
}

export function hasBlockingIssues(validation) {
  const issues = Array.isArray(validation) ? validation : validation?.issues;
  return (issues ?? []).some((issue) => issue.severity === 'error');
}

export function hasSaveBlockingIssues(validation) {
  const issues = Array.isArray(validation) ? validation : validation?.issues;
  return (issues ?? []).some((issue) => issue.severity === 'error' && SAVE_BLOCKING_CODES.has(issue.code));
}

export function scopeDefinitionForValidation(definition, { mode = 'full', nodeId = null } = {}) {
  const normalized = normalizeDefinition(definition);
  if (!normalized.validShape || mode === 'full') return definition;
  if (!nodeId) return definition;

  const nodeIds = new Set(normalized.nodes.map((node) => node.id).filter(Boolean));
  if (!nodeIds.has(nodeId)) return definition;

  const incoming = new Map([...nodeIds].map((id) => [id, []]));
  const outgoing = new Map([...nodeIds].map((id) => [id, []]));
  for (const edge of normalized.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    incoming.get(edge.target).push(edge.source);
    outgoing.get(edge.source).push(edge.target);
  }

  const selected = new Set([nodeId]);
  const visit = (id, direction) => {
    const nextIds = direction === 'incoming' ? incoming.get(id) : outgoing.get(id);
    for (const nextId of nextIds ?? []) {
      if (selected.has(nextId)) continue;
      selected.add(nextId);
      visit(nextId, direction);
    }
  };

  if (mode === 'to_node') visit(nodeId, 'incoming');
  if (mode === 'from_node') visit(nodeId, 'outgoing');

  return {
    ...definition,
    nodes: normalized.nodes.filter((node) => selected.has(node.id)),
    edges: mode === 'single_node'
      ? []
      : normalized.edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)),
  };
}

function validateNode(node, incomingEdges, issues, options) {
  if (!node.type) {
    issues.push(makeIssue({ node, code: 'node_type_missing', message: 'Node is missing a type.' }));
    return;
  }

  if (node.disabled) return;

  try {
    getNodeHandler(node.type);
  } catch {
    issues.push(makeIssue({
      node,
      code: 'unknown_node_type',
      message: `Unknown node type "${node.type}".`,
    }));
    return;
  }

  const importStatus = node.config?._ottoImport?.status;
  if (node.type === 'placeholder' || importStatus === 'placeholder' || importStatus === 'unsupported') {
    issues.push(makeIssue({
      node,
      code: 'unsupported_import_node',
      message: 'Imported n8n node has no executable Otto equivalent yet.',
    }));
  } else if (importStatus === 'partial') {
    issues.push(makeIssue({
      node,
      severity: 'warning',
      code: 'partial_import_node',
      message: 'Imported n8n node is partially mapped; review its configuration before production use.',
    }));
  }

  const schema = NODE_SCHEMAS[node.type] ?? {};
  for (const field of schema.required ?? []) {
    requireField(node, field, issues);
  }
  for (const condition of schema.requiredWhen ?? []) {
    if (condition.when(node.config ?? {})) {
      for (const field of condition.fields) requireField(node, field, issues);
    }
  }
  for (const field of schema.warningWhenEmpty ?? []) {
    if (isEmptyValue(node.config?.[field])) {
      issues.push(makeIssue({
        node,
        field,
        severity: 'warning',
        code: 'empty_condition_set',
        message: `${field} is empty, so this node may pass no useful logic.`,
      }));
    }
  }
  if (schema.credentialAny && !schema.credentialAny.some((field) => !isEmptyValue(node.config?.[field]))) {
    issues.push(makeIssue({
      node,
      field: schema.credentialAny.join('|'),
      code: 'missing_credential',
      message: `Configure one of: ${schema.credentialAny.join(', ')}.`,
    }));
  }
  for (const jsonField of schema.jsonFields ?? []) {
    validateJsonField(node, jsonField, issues);
  }
  validateExpressions(node, issues);

  if (!TRIGGER_TYPES.has(node.type) && incomingEdges.length === 0 && options.requireIncoming !== false) {
    issues.push(makeIssue({
      node,
      severity: 'warning',
      code: 'disconnected_input',
      message: 'Node has no incoming edge. It can run with manual input, but full workflow data may be missing.',
    }));
  }
  if (node.type === 'merge' && incomingEdges.length < 2) {
    issues.push(makeIssue({
      node,
      code: 'merge_requires_inputs',
      message: 'Merge nodes need at least two incoming branches.',
    }));
  }
}

function requireField(node, field, issues) {
  if (!isEmptyValue(node.config?.[field])) return;
  issues.push(makeIssue({
    node,
    field,
    code: 'required_field_missing',
    message: `${field} is required.`,
  }));
}

function validateJsonField(node, jsonField, issues) {
  const spec = typeof jsonField === 'string' ? { field: jsonField } : jsonField;
  const value = node.config?.[spec.field];
  if (isEmptyValue(value)) return;
  if (typeof value !== 'string') {
    if (spec.expected === 'array' && !Array.isArray(value)) {
      issues.push(makeIssue({ node, field: spec.field, code: 'invalid_json_array', message: `${spec.field} must be a JSON array.` }));
    }
    return;
  }
  if (value.includes('{{')) return;
  try {
    const parsed = JSON.parse(value);
    if (spec.expected === 'array' && !Array.isArray(parsed)) {
      issues.push(makeIssue({ node, field: spec.field, code: 'invalid_json_array', message: `${spec.field} must be a JSON array.` }));
    }
  } catch {
    issues.push(makeIssue({
      node,
      field: spec.field,
      code: 'invalid_json',
      message: `${spec.field} must contain valid JSON.`,
    }));
  }
}

function validateExpressions(node, issues) {
  walkConfig(node.config ?? {}, (path, value) => {
    if (typeof value !== 'string' || !value.includes('{{')) return;
    const openCount = (value.match(/\{\{/g) ?? []).length;
    const closeCount = (value.match(/\}\}/g) ?? []).length;
    if (openCount !== closeCount) {
      issues.push(makeIssue({
        node,
        field: path,
        code: 'invalid_expression',
        message: `${path} has unmatched expression braces.`,
      }));
      return;
    }

    for (const match of value.matchAll(EXPRESSION_RE)) {
      const expression = String(match[1] ?? '').trim();
      if (!expression) {
        issues.push(makeIssue({ node, field: path, code: 'invalid_expression', message: `${path} contains an empty expression.` }));
        continue;
      }
      if (BLOCKED_EXPRESSION_TOKENS.test(expression)) {
        issues.push(makeIssue({
          node,
          field: path,
          code: 'blocked_expression_identifier',
          message: `${path} contains a blocked expression identifier.`,
        }));
        continue;
      }
      try {
        new vm.Script(`(${expression})`, { filename: 'otto-validation-expression.vm' });
      } catch (err) {
        issues.push(makeIssue({
          node,
          field: path,
          code: 'invalid_expression',
          message: `${path} contains invalid expression syntax: ${err.message}`,
        }));
      }
    }
  });
}

function addCycleIssues(nodes, incoming, issues) {
  const color = new Map(nodes.map((node) => [node.id, 0]));
  const stack = [];

  function dfs(id) {
    color.set(id, 1);
    stack.push(id);
    for (const edge of incoming.get(id) ?? []) {
      const source = edge.source;
      if (color.get(source) === 1) {
        const node = nodes.find((item) => item.id === source);
        issues.push(makeIssue({ node, code: 'cycle', message: `Cycle detected involving node "${source}".` }));
      } else if (color.get(source) === 0) {
        dfs(source);
      }
    }
    stack.pop();
    color.set(id, 2);
  }

  for (const node of nodes) {
    if (node.id && color.get(node.id) === 0) dfs(node.id);
  }
}

function normalizeDefinition(definition) {
  if (!definition || typeof definition !== 'object') {
    return { validShape: false, nodes: [], edges: [] };
  }
  if (!Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
    return { validShape: false, nodes: [], edges: [] };
  }
  return {
    validShape: true,
    nodes: definition.nodes.map((node) => ({
      id: node.id,
      type: node.type === 'ottoNode' || node.type === 'agentNode' ? node.data?.nodeType : node.type,
      name: node.name ?? node.data?.label ?? node.id ?? 'Unnamed node',
      config: node.config ?? node.data?.config ?? {},
      position: node.position,
      disabled: Boolean(node.disabled ?? node.data?.disabled),
      notes: node.notes ?? node.data?.notes ?? '',
      displayNote: Boolean(node.displayNote ?? node.data?.displayNote),
      continueOnError: Boolean(node.continueOnError ?? node.data?.continueOnError),
      retryOnFail: Boolean(node.retryOnFail ?? node.data?.retryOnFail),
      maxTries: node.maxTries ?? node.data?.maxTries,
      retryDelayMs: node.retryDelayMs ?? node.data?.retryDelayMs,
      alwaysOutputData: Boolean(node.alwaysOutputData ?? node.data?.alwaysOutputData),
    })),
    edges: definition.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}

function buildResult(issues, options) {
  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');
  return {
    ok: errors.length === 0,
    mode: options.mode ?? 'full',
    issueCount: issues.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    issues,
    errors,
    warnings,
  };
}

function makeIssue({ node = null, field = null, severity = 'error', code, message }) {
  return {
    severity,
    code,
    message,
    nodeId: node?.id ?? null,
    nodeName: node?.name ?? null,
    nodeType: node?.type ?? null,
    field,
  };
}

function isEmptyValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function walkConfig(value, visitor, path = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkConfig(item, visitor, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key === '_ottoImport' || key === 'originalNode') continue;
      walkConfig(child, visitor, path ? `${path}.${key}` : key);
    }
    return;
  }
  visitor(path, value);
}
