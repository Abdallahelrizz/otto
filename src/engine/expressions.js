import vm from 'vm';
import { normalizeItems, toJson } from '../utils/items.js';

const FULL_EXPRESSION_RE = /^=?\s*\{\{\s*([\s\S]*?)\s*\}\}\s*$/;
const INLINE_EXPRESSION_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g;
const BLOCKED_TOKENS = /\b(?:constructor|__proto__|prototype|process|global|globalThis|require|module|import|Function|eval)\b/;
const EXPRESSION_TIMEOUT_MS = 50;

export function resolveValue(value, context = {}) {
  if (typeof value !== 'string') return value;

  const fullMatch = value.match(FULL_EXPRESSION_RE);
  if (fullMatch) {
    const resolved = evaluateExpression(fullMatch[1], context);
    return resolved === undefined ? '' : resolved;
  }

  return value.replace(INLINE_EXPRESSION_RE, (_, expression) => {
    const resolved = evaluateExpression(expression, context);
    if (resolved === undefined || resolved === null) return '';
    if (typeof resolved === 'object') return JSON.stringify(resolved);
    return String(resolved);
  });
}

export function resolveConfig(config, context = {}) {
  if (!config || typeof config !== 'object') return config;
  if (Array.isArray(config)) {
    return config.map((value) => (
      value && typeof value === 'object' ? resolveConfig(value, context) : resolveValue(value, context)
    ));
  }

  const out = {};
  for (const [key, val] of Object.entries(config)) {
    if (key === '_ottoImport') {
      out[key] = val;
    } else if (typeof val === 'object' && val !== null) {
      out[key] = resolveConfig(val, context);
    } else {
      out[key] = resolveValue(val, context);
    }
  }
  return out;
}

export function evaluateExpression(rawExpression, context = {}) {
  const expression = String(rawExpression ?? '').trim();
  if (!expression) return '';
  assertSafeExpression(expression);

  const sandbox = createExpressionSandbox(context);
  const script = new vm.Script(`(${expression})`, {
    filename: 'otto-expression.vm',
    displayErrors: true,
  });

  try {
    return script.runInNewContext(sandbox, { timeout: EXPRESSION_TIMEOUT_MS });
  } catch (err) {
    throw new Error(`Expression failed "${expression}": ${err.message}`);
  }
}

function assertSafeExpression(expression) {
  if (BLOCKED_TOKENS.test(expression)) {
    throw new Error('Expression contains a blocked identifier');
  }
}

function createExpressionSandbox(context) {
  const input = context.input ?? {};
  const inputItems = normalizeItems(input);
  const nodeOutputs = normalizeNodeOutputs(context.nodes ?? {});
  const nodeProxy = createNodeProxy(nodeOutputs);

  const sandbox = Object.create(null);
  Object.assign(sandbox, {
    input,
    nodes: context.nodes ?? {},
    $json: toJson(input),
    $binary: input?.binary ?? inputItems[0]?.binary ?? {},
    $input: {
      item: inputItems[0] ?? { json: {}, binary: {} },
      all: () => inputItems,
      first: () => inputItems[0] ?? null,
      last: () => inputItems[inputItems.length - 1] ?? null,
    },
    $items: (nodeName) => {
      if (!nodeName) return inputItems;
      const node = nodeOutputs[nodeName];
      return node?.items ?? [];
    },
    $node: nodeProxy,
    $nodes: nodeProxy,
    $vars: context.vars ?? {},
    $now: new Date(),
    $today: startOfToday(),
    $if: (condition, whenTrue, whenFalse) => condition ? whenTrue : whenFalse,
    $jsonParse: (value) => JSON.parse(String(value)),
    $jsonStringify: (value) => JSON.stringify(value),
    $length: (value) => value == null ? 0 : (Array.isArray(value) || typeof value === 'string' ? value.length : Object.keys(value).length),
    $keys: (value) => Object.keys(value ?? {}),
    $values: (value) => Object.values(value ?? {}),
    $contains: (value, search) => Array.isArray(value) ? value.includes(search) : String(value ?? '').includes(String(search)),
    $pick,
    $omit,
    $lowercase: (value) => String(value ?? '').toLowerCase(),
    $uppercase: (value) => String(value ?? '').toUpperCase(),
    $trim: (value) => String(value ?? '').trim(),
    $number: (value) => Number(value),
    $string: (value) => String(value ?? ''),
    $boolean: (value) => Boolean(value),
    Math,
    Date,
    JSON,
    Array,
    Object,
    Number,
    String,
    Boolean,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
  });

  return sandbox;
}

function normalizeNodeOutputs(nodes) {
  const out = {};
  for (const [key, value] of Object.entries(nodes ?? {})) {
    out[key] = makeNodeExpressionValue(value);
  }
  return out;
}

function createNodeProxy(nodeOutputs) {
  return new Proxy(Object.create(null), {
    get(_target, key) {
      if (typeof key === 'symbol') return undefined;
      return nodeOutputs[key];
    },
    has(_target, key) {
      return Object.prototype.hasOwnProperty.call(nodeOutputs, key);
    },
    ownKeys() {
      return Reflect.ownKeys(nodeOutputs);
    },
    getOwnPropertyDescriptor(_target, key) {
      if (!Object.prototype.hasOwnProperty.call(nodeOutputs, key)) return undefined;
      return { enumerable: true, configurable: true };
    },
  });
}

function makeNodeExpressionValue(output) {
  const items = normalizeItems(output);
  return {
    json: items[0]?.json ?? {},
    binary: items[0]?.binary ?? {},
    item: items[0] ?? { json: {}, binary: {} },
    items,
    all: () => items,
    first: () => items[0] ?? null,
    last: () => items[items.length - 1] ?? null,
    data: output,
  };
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function $pick(value, keys) {
  const source = value ?? {};
  const wanted = Array.isArray(keys) ? keys : String(keys ?? '').split(',').map((key) => key.trim()).filter(Boolean);
  return Object.fromEntries(wanted.filter((key) => key in source).map((key) => [key, source[key]]));
}

function $omit(value, keys) {
  const blocked = new Set(Array.isArray(keys) ? keys : String(keys ?? '').split(',').map((key) => key.trim()).filter(Boolean));
  return Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => !blocked.has(key)));
}
