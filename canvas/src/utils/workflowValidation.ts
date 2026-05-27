import type { Edge, Node } from 'reactflow';
import { NODE_TYPE_MAP } from '../components/nodes/nodeConfig';
import type { WorkflowValidationIssue } from '../types';

const TRIGGER_TYPES = new Set(['webhook_trigger', 'manual_trigger', 'schedule_trigger', 'form_trigger', 'chat_trigger']);
const BLOCKED_EXPRESSION_TOKENS = /\b(?:constructor|__proto__|prototype|process|global|globalThis|require|module|import|Function|eval)\b/;
const EXPRESSION_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;

type Schema = {
  required?: string[];
  requiredWhen?: Array<{ when: (config: Record<string, unknown>) => boolean; fields: string[] }>;
  credentialAny?: string[];
  jsonFields?: Array<string | { field: string; expected?: 'array' }>;
  warningWhenEmpty?: string[];
};

const NODE_SCHEMAS: Record<string, Schema> = {
  webhook_trigger: { required: ['path', 'method'] },
  form_trigger: { required: ['path', 'title', 'fieldsJson'], jsonFields: [{ field: 'fieldsJson', expected: 'array' }] },
  chat_trigger: { required: ['path', 'sessionField', 'messageField'] },
  http_request: { required: ['url'], jsonFields: ['headers'] },
  llm_call: { required: ['provider', 'model'] },
  parallel_ai: { required: ['targetsJson'], jsonFields: [{ field: 'targetsJson', expected: 'array' }] },
  ai_agent: { required: ['model'], jsonFields: ['tools'] },
  if: { warningWhenEmpty: ['conditions'] },
  filter: { warningWhenEmpty: ['conditions'] },
  merge: {},
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
      { when: (config) => String(config.source ?? 'input') === 'input', fields: ['binaryProperty'] },
      { when: (config) => String(config.source ?? '') === 'id', fields: ['binaryId'] },
    ],
  },
  s3_object: {
    required: ['operation', 'bucket'],
    requiredWhen: [
      { when: (config) => ['get', 'put', 'delete', 'head'].includes(String(config.operation ?? '')), fields: ['key'] },
      { when: (config) => String(config.operation ?? '') === 'put' && String(config.sourceMode ?? '') === 'binary', fields: ['binaryProperty'] },
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
      { when: (config) => String(config.operation ?? '') === 'set', fields: ['path'] },
      { when: (config) => ['pick', 'omit'].includes(String(config.operation ?? '')), fields: ['paths'] },
      { when: (config) => ['set', 'merge'].includes(String(config.operation ?? '')), fields: ['setValue'] },
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
    requiredWhen: [{ when: (config) => ['update', 'delete'].includes(String(config.operation ?? '')), fields: ['recordId'] }],
    credentialAny: ['credentialId', 'token'],
    jsonFields: ['fieldsJson'],
  },
  graphql_request: { required: ['endpoint', 'query'], jsonFields: ['variablesJson'] },
};

export function validateCanvasWorkflow(
  nodes: Node[],
  edges: Edge[],
  options: { mode?: string; nodeId?: string | null } = {}
): WorkflowValidationIssue[] {
  const scoped = scopeCanvasGraph(nodes, edges, options);
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const incoming = new Map<string, Edge[]>();

  for (const node of scoped.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push(makeIssue(node, 'duplicate_node_id', `Duplicate node id "${node.id}".`));
    }
    nodeIds.add(node.id);
    incoming.set(node.id, []);
  }

  for (const edge of scoped.edges) {
    if (!edge.source || !edge.target || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({
        severity: 'error',
        code: 'edge_node_missing',
        message: 'An edge references a missing source or target node.',
        nodeId: null,
        nodeName: null,
        nodeType: null,
        field: edge.id,
      });
      continue;
    }
    incoming.get(edge.target)?.push(edge);
  }

  for (const node of scoped.nodes) {
    validateNode(node, incoming.get(node.id) ?? [], issues);
  }

  return issues;
}

export function hasBlockingValidationIssues(issues: WorkflowValidationIssue[]) {
  return issues.some((issue) => issue.severity === 'error');
}

function validateNode(node: Node, incomingEdges: Edge[], issues: WorkflowValidationIssue[]) {
  const nodeType = String(node.data?.nodeType ?? '');
  const config = (node.data?.config ?? {}) as Record<string, unknown>;
  const nodeName = String(node.data?.label ?? node.id);

  if (!nodeType) {
    issues.push(makeIssue(node, 'node_type_missing', 'Node is missing a type.'));
    return;
  }

  if (node.data?.disabled) return;

  if (!NODE_TYPE_MAP[nodeType] && nodeType !== 'placeholder') {
    issues.push(makeIssue(node, 'unknown_node_type', `Unknown node type "${nodeType}".`));
    return;
  }

  const importStatus = (config._ottoImport as { status?: string } | undefined)?.status;
  if (nodeType === 'placeholder' || importStatus === 'placeholder' || importStatus === 'unsupported') {
    issues.push(makeIssue(node, 'unsupported_import_node', 'Imported n8n node has no executable Otto equivalent yet.'));
  } else if (importStatus === 'partial') {
    issues.push(makeIssue(node, 'partial_import_node', 'Imported n8n node is partially mapped; review its configuration before production use.', 'warning'));
  }

  const schema = NODE_SCHEMAS[nodeType] ?? {};
  for (const field of schema.required ?? []) requireField(node, config, field, issues);
  for (const condition of schema.requiredWhen ?? []) {
    if (condition.when(config)) {
      for (const field of condition.fields) requireField(node, config, field, issues);
    }
  }
  for (const field of schema.warningWhenEmpty ?? []) {
    if (isEmptyValue(config[field])) {
      issues.push(makeFieldIssue(node, field, 'empty_condition_set', `${field} is empty, so this node may pass no useful logic.`, 'warning'));
    }
  }
  if (schema.credentialAny && !schema.credentialAny.some((field) => !isEmptyValue(config[field]))) {
    issues.push(makeFieldIssue(node, schema.credentialAny.join('|'), 'missing_credential', `Configure one of: ${schema.credentialAny.join(', ')}.`));
  }
  for (const jsonField of schema.jsonFields ?? []) validateJsonField(node, config, jsonField, issues);
  validateExpressions(node, config, issues);

  if (!TRIGGER_TYPES.has(nodeType) && incomingEdges.length === 0) {
    issues.push(makeIssue(node, 'disconnected_input', 'Node has no incoming edge. It can run with manual input, but full workflow data may be missing.', 'warning'));
  }
  if (nodeType === 'merge' && incomingEdges.length < 2) {
    issues.push(makeIssue(node, 'merge_requires_inputs', 'Merge nodes need at least two incoming branches.'));
  }

  if (!nodeName.trim()) {
    issues.push(makeIssue(node, 'node_name_missing', 'Node label is empty.', 'warning'));
  }
}

function requireField(node: Node, config: Record<string, unknown>, field: string, issues: WorkflowValidationIssue[]) {
  if (!isEmptyValue(config[field])) return;
  issues.push(makeFieldIssue(node, field, 'required_field_missing', `${field} is required.`));
}

function validateJsonField(
  node: Node,
  config: Record<string, unknown>,
  jsonField: string | { field: string; expected?: 'array' },
  issues: WorkflowValidationIssue[]
) {
  const spec = typeof jsonField === 'string' ? { field: jsonField } : jsonField;
  const value = config[spec.field];
  if (isEmptyValue(value)) return;
  if (typeof value !== 'string') {
    if (spec.expected === 'array' && !Array.isArray(value)) {
      issues.push(makeFieldIssue(node, spec.field, 'invalid_json_array', `${spec.field} must be a JSON array.`));
    }
    return;
  }
  if (value.includes('{{')) return;
  try {
    const parsed = JSON.parse(value);
    if (spec.expected === 'array' && !Array.isArray(parsed)) {
      issues.push(makeFieldIssue(node, spec.field, 'invalid_json_array', `${spec.field} must be a JSON array.`));
    }
  } catch {
    issues.push(makeFieldIssue(node, spec.field, 'invalid_json', `${spec.field} must contain valid JSON.`));
  }
}

function validateExpressions(node: Node, config: Record<string, unknown>, issues: WorkflowValidationIssue[]) {
  walkConfig(config, (path, value) => {
    if (typeof value !== 'string' || !value.includes('{{')) return;
    const openCount = (value.match(/\{\{/g) ?? []).length;
    const closeCount = (value.match(/\}\}/g) ?? []).length;
    if (openCount !== closeCount) {
      issues.push(makeFieldIssue(node, path, 'invalid_expression', `${path} has unmatched expression braces.`));
      return;
    }
    for (const match of value.matchAll(EXPRESSION_RE)) {
      const expression = String(match[1] ?? '').trim();
      if (!expression) {
        issues.push(makeFieldIssue(node, path, 'invalid_expression', `${path} contains an empty expression.`));
      } else if (BLOCKED_EXPRESSION_TOKENS.test(expression)) {
        issues.push(makeFieldIssue(node, path, 'blocked_expression_identifier', `${path} contains a blocked expression identifier.`));
      }
    }
  });
}

function scopeCanvasGraph(nodes: Node[], edges: Edge[], options: { mode?: string; nodeId?: string | null }) {
  if (!options.mode || options.mode === 'full' || !options.nodeId) return { nodes, edges };
  const allNodeIds = new Set(nodes.map((node) => node.id));
  if (!allNodeIds.has(options.nodeId)) return { nodes, edges };

  const incoming = new Map([...allNodeIds].map((id) => [id, [] as string[]]));
  const outgoing = new Map([...allNodeIds].map((id) => [id, [] as string[]]));
  for (const edge of edges) {
    if (!allNodeIds.has(edge.source) || !allNodeIds.has(edge.target)) continue;
    incoming.get(edge.target)?.push(edge.source);
    outgoing.get(edge.source)?.push(edge.target);
  }

  const selected = new Set([options.nodeId]);
  const visit = (id: string, direction: 'incoming' | 'outgoing') => {
    const nextIds = direction === 'incoming' ? incoming.get(id) : outgoing.get(id);
    for (const nextId of nextIds ?? []) {
      if (selected.has(nextId)) continue;
      selected.add(nextId);
      visit(nextId, direction);
    }
  };

  if (options.mode === 'to_node') visit(options.nodeId, 'incoming');
  if (options.mode === 'from_node') visit(options.nodeId, 'outgoing');

  return {
    nodes: nodes.filter((node) => selected.has(node.id)),
    edges: options.mode === 'single_node'
      ? []
      : edges.filter((edge) => selected.has(edge.source) && selected.has(edge.target)),
  };
}

function makeFieldIssue(
  node: Node,
  field: string,
  code: string,
  message: string,
  severity: WorkflowValidationIssue['severity'] = 'error'
): WorkflowValidationIssue {
  return { ...makeIssue(node, code, message, severity), field };
}

function makeIssue(
  node: Node,
  code: string,
  message: string,
  severity: WorkflowValidationIssue['severity'] = 'error'
): WorkflowValidationIssue {
  return {
    severity,
    code,
    message,
    nodeId: node.id,
    nodeName: String(node.data?.label ?? node.id),
    nodeType: String(node.data?.nodeType ?? ''),
    field: null,
  };
}

function isEmptyValue(value: unknown) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function walkConfig(value: unknown, visitor: (path: string, value: unknown) => void, path = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkConfig(item, visitor, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === '_ottoImport' || key === 'originalNode') continue;
      walkConfig(child, visitor, path ? `${path}.${key}` : key);
    }
    return;
  }
  visitor(path, value);
}
