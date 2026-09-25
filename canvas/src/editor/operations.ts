import type { Edge, Node } from 'reactflow';
import type { OttoNodeData } from '../types';
import type { GraphDoc } from './history';

/**
 * Editor operations: the vocabulary for changing a workflow graph programmatically.
 * Every operation maps to something a user can do by hand, so OttoBot (or any other
 * client) edits the canvas through the same rules the UI enforces.
 *
 * Nodes are referenced by id, by the `ref` given to a node added earlier in the same
 * batch, or by label. Labels are what expressions use, so they are kept unique.
 */
export type NodeRef = string;

export type EditorOperation =
  | { op: 'add_node'; type: string; ref?: string; label?: string; position?: { x: number; y: number }; config?: Record<string, unknown> }
  | { op: 'remove_node'; node: NodeRef }
  | { op: 'move_node'; node: NodeRef; position: { x: number; y: number } }
  | { op: 'rename_node'; node: NodeRef; label: string }
  | { op: 'connect'; source: NodeRef; target: NodeRef; sourceHandle?: string; targetHandle?: string }
  | { op: 'disconnect'; source: NodeRef; target: NodeRef; sourceHandle?: string }
  | { op: 'update_config'; node: NodeRef; config: Record<string, unknown>; replace?: boolean }
  | { op: 'set_node_controls'; node: NodeRef; controls: NodeControls };

export type NodeControls = Partial<Pick<OttoNodeData,
  'disabled' | 'continueOnError' | 'retryOnFail' | 'maxTries' | 'retryDelayMs' | 'alwaysOutputData' | 'notes' | 'displayNote'>>;

const CONTROL_KEYS: ReadonlyArray<keyof NodeControls> = [
  'disabled', 'continueOnError', 'retryOnFail', 'maxTries', 'retryDelayMs', 'alwaysOutputData', 'notes', 'displayNote',
];

/** What the operations need to know about a node type. */
export interface NodeTypeInfo {
  label: string;
  defaultConfig: Record<string, unknown>;
  handles: { in: Array<{ id: string }>; out: Array<{ id: string }> };
}

export interface OperationContext {
  getNodeType: (type: string) => NodeTypeInfo | undefined;
  newId: () => string;
}

export interface OperationResult {
  op: EditorOperation['op'];
  ok: boolean;
  error?: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ApplyResult {
  ok: boolean;
  graph: GraphDoc;
  results: OperationResult[];
}

class OperationError extends Error {}

const NODE_GAP_X = 260;

function nodeLabel(node: Node): string {
  return String((node.data as OttoNodeData | undefined)?.label ?? '');
}

function wouldCreateCycle(edges: Edge[], source: string, target: string): boolean {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(outgoing.get(id) ?? []));
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quoteName(name: string, quote: string): string {
  if (!name.includes(quote) && !name.includes('\\')) return `${quote}${name}${quote}`;
  return JSON.stringify(name);
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Rewrite expression references to a renamed node inside any string in `value`.
 * Covers $node["X"], $nodes["X"], nodes["X"], $node.X, $items("X") and $("X").
 */
export function rewriteNodeReferences<T>(value: T, oldName: string, newName: string): T {
  if (!oldName || oldName === newName) return value;
  const name = escapeRegExp(oldName);
  const bracket = new RegExp(`(\\$nodes?|\\bnodes)\\[\\s*(["'])${name}\\2\\s*\\]`, 'g');
  const call = new RegExp(`(\\$items|\\$)\\(\\s*(["'])${name}\\2`, 'g');
  const dotted = IDENTIFIER.test(oldName) ? new RegExp(`(\\$nodes?|\\bnodes)\\.${name}(?![\\w$])`, 'g') : null;

  const rewrite = (text: string): string => {
    let next = text
      .replace(bracket, (_m, prefix: string, quote: string) => `${prefix}[${quoteName(newName, quote)}]`)
      .replace(call, (_m, prefix: string, quote: string) => `${prefix}(${quoteName(newName, quote)}`);
    if (dotted) {
      next = next.replace(dotted, (_m, prefix: string) => (
        IDENTIFIER.test(newName) ? `${prefix}.${newName}` : `${prefix}[${JSON.stringify(newName)}]`
      ));
    }
    return next;
  };

  // Returns the same reference when nothing inside changed, so untouched nodes stay untouched.
  const walk = (input: unknown): unknown => {
    if (typeof input === 'string') return rewrite(input);
    if (Array.isArray(input)) {
      const next = input.map(walk);
      return next.some((v, i) => v !== input[i]) ? next : input;
    }
    if (input && typeof input === 'object') {
      const entries = Object.entries(input as Record<string, unknown>);
      const next = entries.map(([k, v]) => [k, walk(v)] as const);
      return next.some(([, v], i) => v !== entries[i][1]) ? Object.fromEntries(next) : input;
    }
    return input;
  };
  return walk(value) as T;
}

/** Rename a node and update every expression that referred to it by its old label. */
export function renameNodeInGraph(graph: GraphDoc, nodeId: string, label: string): GraphDoc {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return graph;
  const oldLabel = nodeLabel(node);
  // A duplicated old label is ambiguous: rewriting would repoint the other node's references.
  const oldIsUnique = graph.nodes.filter((n) => nodeLabel(n) === oldLabel).length === 1;
  const newIsFree = !graph.nodes.some((n) => n.id !== nodeId && nodeLabel(n) === label);
  const rewrite = oldIsUnique && newIsFree && oldLabel.length > 0;

  return {
    edges: graph.edges,
    nodes: graph.nodes.map((n) => {
      const data = n.data as OttoNodeData;
      if (n.id === nodeId) {
        return { ...n, data: { ...data, label, config: rewrite ? rewriteNodeReferences(data.config, oldLabel, label) : data.config } };
      }
      if (!rewrite) return n;
      const config = rewriteNodeReferences(data.config, oldLabel, label);
      return config === data.config ? n : { ...n, data: { ...data, config } };
    }),
  };
}

function uniqueLabel(nodes: Node[], wanted: string): string {
  const taken = new Set(nodes.map(nodeLabel));
  if (!taken.has(wanted)) return wanted;
  for (let i = 2; ; i += 1) {
    const candidate = `${wanted} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function defaultPosition(nodes: Node[]): { x: number; y: number } {
  if (nodes.length === 0) return { x: 0, y: 0 };
  const rightmost = nodes.reduce((a, b) => (b.position.x > a.position.x ? b : a));
  return { x: rightmost.position.x + NODE_GAP_X, y: rightmost.position.y };
}

function isFinitePoint(p: unknown): p is { x: number; y: number } {
  const point = p as { x?: unknown; y?: unknown } | null;
  return Boolean(point) && Number.isFinite(point!.x) && Number.isFinite(point!.y);
}

/**
 * Apply a batch of operations. With `atomic` (the default) the batch is all-or-nothing:
 * if any operation fails, the original graph comes back unchanged and the results say
 * which operation failed and why.
 */
export function applyOperations(
  graph: GraphDoc,
  operations: EditorOperation[],
  ctx: OperationContext,
  { atomic = true }: { atomic?: boolean } = {},
): ApplyResult {
  let nodes = [...graph.nodes];
  let edges = [...graph.edges];
  const refs = new Map<string, string>();
  const results: OperationResult[] = [];

  const resolve = (ref: NodeRef): Node => {
    const byId = nodes.find((n) => n.id === ref);
    if (byId) return byId;
    const byRef = refs.get(ref);
    if (byRef) {
      const node = nodes.find((n) => n.id === byRef);
      if (node) return node;
    }
    const byLabel = nodes.filter((n) => nodeLabel(n) === ref);
    if (byLabel.length === 1) return byLabel[0];
    if (byLabel.length > 1) throw new OperationError(`"${ref}" matches ${byLabel.length} nodes; use the node id`);
    throw new OperationError(`No node "${ref}"`);
  };

  const typeOf = (node: Node): NodeTypeInfo => {
    const type = (node.data as OttoNodeData).nodeType;
    const info = ctx.getNodeType(type);
    if (!info) throw new OperationError(`Unknown node type "${type}"`);
    return info;
  };

  const apply = (operation: EditorOperation): OperationResult => {
    switch (operation.op) {
      case 'add_node': {
        const info = ctx.getNodeType(operation.type);
        if (!info) throw new OperationError(`Unknown node type "${operation.type}"`);
        if (operation.ref && (refs.has(operation.ref) || nodes.some((n) => n.id === operation.ref))) {
          throw new OperationError(`ref "${operation.ref}" is already used`);
        }
        if (operation.position && !isFinitePoint(operation.position)) throw new OperationError('position needs numeric x and y');
        const id = ctx.newId();
        const label = uniqueLabel(nodes, operation.label?.trim() || info.label);
        nodes = [...nodes, {
          id,
          type: operation.type === 'ai_agent' ? 'agentNode' : 'ottoNode',
          position: operation.position ?? defaultPosition(nodes),
          data: { label, nodeType: operation.type, config: { ...info.defaultConfig, ...(operation.config ?? {}) } },
        }];
        if (operation.ref) refs.set(operation.ref, id);
        return { op: operation.op, ok: true, nodeId: id };
      }

      case 'remove_node': {
        const node = resolve(operation.node);
        nodes = nodes.filter((n) => n.id !== node.id);
        edges = edges.filter((e) => e.source !== node.id && e.target !== node.id);
        return { op: operation.op, ok: true, nodeId: node.id };
      }

      case 'move_node': {
        const node = resolve(operation.node);
        if (!isFinitePoint(operation.position)) throw new OperationError('position needs numeric x and y');
        nodes = nodes.map((n) => (n.id === node.id ? { ...n, position: { ...operation.position } } : n));
        return { op: operation.op, ok: true, nodeId: node.id };
      }

      case 'rename_node': {
        const node = resolve(operation.node);
        const label = operation.label.trim();
        if (!label) throw new OperationError('label cannot be empty');
        if (nodes.some((n) => n.id !== node.id && nodeLabel(n) === label)) {
          throw new OperationError(`Another node is already called "${label}"`);
        }
        ({ nodes, edges } = renameNodeInGraph({ nodes, edges }, node.id, label));
        return { op: operation.op, ok: true, nodeId: node.id };
      }

      case 'connect': {
        const source = resolve(operation.source);
        const target = resolve(operation.target);
        if (source.id === target.id) throw new OperationError('A node cannot connect to itself');
        const outs = typeOf(source).handles.out;
        const ins = typeOf(target).handles.in;
        if (outs.length === 0) throw new OperationError(`"${nodeLabel(source)}" has no outputs`);
        if (ins.length === 0) throw new OperationError(`"${nodeLabel(target)}" is a trigger and takes no input`);

        let sourceHandle: string | null = operation.sourceHandle ?? null;
        if (outs.length > 1 && !sourceHandle) {
          throw new OperationError(`"${nodeLabel(source)}" has several outputs; choose sourceHandle (${outs.map((h) => h.id).join(', ')})`);
        }
        if (sourceHandle && !outs.some((h) => h.id === sourceHandle)) {
          throw new OperationError(`"${nodeLabel(source)}" has no output "${sourceHandle}" (${outs.map((h) => h.id).join(', ')})`);
        }
        // Single-output nodes are stored without a handle id, the same as saved workflows.
        if (outs.length === 1) sourceHandle = null;
        const targetHandle = operation.targetHandle ?? null;
        if (targetHandle && !ins.some((h) => h.id === targetHandle)) {
          throw new OperationError(`"${nodeLabel(target)}" has no input "${targetHandle}"`);
        }

        const duplicate = edges.some((e) => e.source === source.id && e.target === target.id && (e.sourceHandle ?? null) === sourceHandle);
        if (duplicate) throw new OperationError('These nodes are already connected');
        if (wouldCreateCycle(edges, source.id, target.id)) throw new OperationError('This connection would create a loop');

        const id = ctx.newId();
        edges = [...edges, { id, source: source.id, target: target.id, sourceHandle, targetHandle }];
        return { op: operation.op, ok: true, edgeId: id };
      }

      case 'disconnect': {
        const source = resolve(operation.source);
        const target = resolve(operation.target);
        const matches = (e: Edge) => e.source === source.id && e.target === target.id
          && (operation.sourceHandle === undefined || (e.sourceHandle ?? null) === operation.sourceHandle);
        const removed = edges.filter(matches);
        if (removed.length === 0) throw new OperationError('These nodes are not connected');
        edges = edges.filter((e) => !matches(e));
        return { op: operation.op, ok: true, edgeId: removed[0].id };
      }

      case 'update_config': {
        const node = resolve(operation.node);
        if (!operation.config || typeof operation.config !== 'object' || Array.isArray(operation.config)) {
          throw new OperationError('config must be an object');
        }
        nodes = nodes.map((n) => {
          if (n.id !== node.id) return n;
          const data = n.data as OttoNodeData;
          const config = operation.replace ? { ...operation.config } : { ...data.config, ...operation.config };
          return { ...n, data: { ...data, config } };
        });
        return { op: operation.op, ok: true, nodeId: node.id };
      }

      case 'set_node_controls': {
        const node = resolve(operation.node);
        const unknown = Object.keys(operation.controls ?? {}).filter((k) => !CONTROL_KEYS.includes(k as keyof NodeControls));
        if (unknown.length) throw new OperationError(`Unknown control: ${unknown.join(', ')}`);
        nodes = nodes.map((n) => (n.id === node.id ? { ...n, data: { ...(n.data as OttoNodeData), ...operation.controls } } : n));
        return { op: operation.op, ok: true, nodeId: node.id };
      }

      default:
        throw new OperationError(`Unknown operation "${(operation as { op?: string }).op}"`);
    }
  };

  let failed = false;
  for (const operation of operations) {
    if (failed && atomic) {
      results.push({ op: operation.op, ok: false, error: 'Skipped: an earlier operation failed' });
      continue;
    }
    try {
      results.push(apply(operation));
    } catch (err) {
      if (!(err instanceof OperationError)) throw err;
      failed = true;
      results.push({ op: operation.op, ok: false, error: err.message });
    }
  }

  if (failed && atomic) return { ok: false, graph, results };
  return { ok: !failed, graph: { nodes, edges }, results };
}

/** A compact, plain-JSON view of the workflow for an assistant's context. */
export function describeGraph(graph: GraphDoc) {
  const labels = new Map(graph.nodes.map((n) => [n.id, nodeLabel(n)]));
  return {
    nodes: graph.nodes.map((n) => {
      const data = n.data as OttoNodeData;
      return {
        id: n.id,
        label: data.label,
        type: data.nodeType,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        config: data.config,
        ...(data.disabled ? { disabled: true } : {}),
      };
    }),
    edges: graph.edges.map((e) => ({
      source: labels.get(e.source) ?? e.source,
      target: labels.get(e.target) ?? e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    })),
  };
}
