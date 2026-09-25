import { describe, expect, it } from 'vitest';
import type { Node } from 'reactflow';
import { applyOperations, describeGraph, renameNodeInGraph, rewriteNodeReferences } from './operations';
import type { NodeTypeInfo, OperationContext } from './operations';
import type { GraphDoc } from './history';

const TYPES: Record<string, NodeTypeInfo> = {
  manual_trigger: { label: 'Manual Trigger', defaultConfig: {}, handles: { in: [], out: [{ id: 'output' }] } },
  set: { label: 'Set / Transform', defaultConfig: { mode: 'set' }, handles: { in: [{ id: 'input' }], out: [{ id: 'output' }] } },
  llm_call: { label: 'LLM Call', defaultConfig: { provider: 'openai' }, handles: { in: [{ id: 'input' }], out: [{ id: 'output' }] } },
  if: { label: 'IF Condition', defaultConfig: {}, handles: { in: [{ id: 'input' }], out: [{ id: 'true' }, { id: 'false' }] } },
  stop_error: { label: 'Stop and Error', defaultConfig: {}, handles: { in: [{ id: 'input' }], out: [] } },
  ai_agent: { label: 'AI Agent', defaultConfig: {}, handles: { in: [{ id: 'input' }], out: [{ id: 'output' }] } },
};

function context(): OperationContext {
  let n = 0;
  return { getNodeType: (type) => TYPES[type], newId: () => `id${++n}` };
}

const empty: GraphDoc = { nodes: [], edges: [] };

function labels(graph: GraphDoc) {
  return graph.nodes.map((n) => n.data.label);
}

describe('applyOperations', () => {
  it('builds a workflow from a batch using refs', () => {
    const { ok, graph, results } = applyOperations(empty, [
      { op: 'add_node', type: 'manual_trigger', ref: 'start' },
      { op: 'add_node', type: 'llm_call', ref: 'classify', label: 'Classify intent', config: { model: 'gpt-4o-mini' } },
      { op: 'connect', source: 'start', target: 'classify' },
    ], context());

    expect(ok).toBe(true);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(labels(graph)).toEqual(['Manual Trigger', 'Classify intent']);
    expect(graph.nodes[1].data.config).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
    expect(graph.edges).toEqual([{ id: 'id3', source: 'id1', target: 'id2', sourceHandle: null, targetHandle: null }]);
  });

  it('places new nodes to the right of the rightmost node by default', () => {
    const { graph } = applyOperations(empty, [
      { op: 'add_node', type: 'set' },
      { op: 'add_node', type: 'set' },
    ], context());
    expect(graph.nodes[1].position.x).toBeGreaterThan(graph.nodes[0].position.x);
  });

  it('keeps labels unique, since expressions refer to nodes by label', () => {
    const { graph } = applyOperations(empty, [
      { op: 'add_node', type: 'set' },
      { op: 'add_node', type: 'set' },
    ], context());
    expect(labels(graph)).toEqual(['Set / Transform', 'Set / Transform 2']);
  });

  it('uses the agent node component for AI Agent', () => {
    const { graph } = applyOperations(empty, [{ op: 'add_node', type: 'ai_agent' }], context());
    expect(graph.nodes[0].type).toBe('agentNode');
  });

  it('is all-or-nothing by default and reports which operation failed', () => {
    const { ok, graph, results } = applyOperations(empty, [
      { op: 'add_node', type: 'set', ref: 'a' },
      { op: 'connect', source: 'a', target: 'nope' },
      { op: 'add_node', type: 'set' },
    ], context());
    expect(ok).toBe(false);
    expect(graph).toBe(empty);
    expect(results.map((r) => r.ok)).toEqual([true, false, false]);
    expect(results[1].error).toBe('No node "nope"');
    expect(results[2].error).toMatch(/Skipped/);
  });

  it('can apply the operations that succeed when atomic is off', () => {
    const { ok, graph } = applyOperations(empty, [
      { op: 'add_node', type: 'set' },
      { op: 'add_node', type: 'unknown_type' },
    ], context(), { atomic: false });
    expect(ok).toBe(false);
    expect(graph.nodes).toHaveLength(1);
  });

  describe('connect', () => {
    const base = () => applyOperations(empty, [
      { op: 'add_node', type: 'manual_trigger', ref: 't' },
      { op: 'add_node', type: 'if', ref: 'check', label: 'Check' },
      { op: 'add_node', type: 'set', ref: 'yes', label: 'Yes' },
      { op: 'add_node', type: 'stop_error', ref: 'stop', label: 'Stop' },
      { op: 'connect', source: 't', target: 'check' },
    ], context()).graph;

    it('requires a branch for nodes with several outputs', () => {
      const r = applyOperations(base(), [{ op: 'connect', source: 'Check', target: 'Yes' }], context());
      expect(r.results[0].error).toMatch(/choose sourceHandle \(true, false\)/);
      const ok = applyOperations(base(), [{ op: 'connect', source: 'Check', target: 'Yes', sourceHandle: 'true' }], context());
      expect(ok.ok).toBe(true);
      expect(ok.graph.edges[ok.graph.edges.length - 1]?.sourceHandle).toBe('true');
    });

    it('rejects an unknown branch', () => {
      const r = applyOperations(base(), [{ op: 'connect', source: 'Check', target: 'Yes', sourceHandle: 'maybe' }], context());
      expect(r.results[0].error).toMatch(/no output "maybe"/);
    });

    it('rejects connecting into a trigger or out of a node with no outputs', () => {
      expect(applyOperations(base(), [{ op: 'connect', source: 'Yes', target: 'Manual Trigger' }], context()).results[0].error)
        .toMatch(/trigger/);
      expect(applyOperations(base(), [{ op: 'connect', source: 'Stop', target: 'Yes' }], context()).results[0].error)
        .toMatch(/no outputs/);
    });

    it('rejects self-connections, duplicates and loops', () => {
      const g = applyOperations(base(), [{ op: 'connect', source: 'Check', target: 'Yes', sourceHandle: 'true' }], context()).graph;
      expect(applyOperations(g, [{ op: 'connect', source: 'Yes', target: 'Yes' }], context()).results[0].error).toMatch(/itself/);
      expect(applyOperations(g, [{ op: 'connect', source: 'Check', target: 'Yes', sourceHandle: 'true' }], context()).results[0].error)
        .toMatch(/already connected/);
      expect(applyOperations(g, [{ op: 'connect', source: 'Yes', target: 'Check' }], context()).results[0].error).toMatch(/loop/);
    });
  });

  it('removes a node together with its connections', () => {
    const g = applyOperations(empty, [
      { op: 'add_node', type: 'manual_trigger', ref: 't' },
      { op: 'add_node', type: 'set', ref: 's', label: 'S' },
      { op: 'connect', source: 't', target: 's' },
      { op: 'remove_node', node: 'S' },
    ], context()).graph;
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it('disconnects, and says so when there was nothing to disconnect', () => {
    const g = applyOperations(empty, [
      { op: 'add_node', type: 'manual_trigger', ref: 't' },
      { op: 'add_node', type: 'set', ref: 's' },
      { op: 'connect', source: 't', target: 's' },
      { op: 'disconnect', source: 't', target: 's' },
    ], context());
    expect(g.ok).toBe(true);
    expect(g.graph.edges).toHaveLength(0);
    expect(applyOperations(g.graph, [{ op: 'disconnect', source: 'Manual Trigger', target: 'Set / Transform' }], context()).results[0].error)
      .toMatch(/not connected/);
  });

  it('merges config by default and replaces it when asked', () => {
    const g = applyOperations(empty, [{ op: 'add_node', type: 'llm_call', ref: 'l', config: { model: 'a' } }], context()).graph;
    const merged = applyOperations(g, [{ op: 'update_config', node: 'LLM Call', config: { temperature: 0.2 } }], context()).graph;
    expect(merged.nodes[0].data.config).toEqual({ provider: 'openai', model: 'a', temperature: 0.2 });
    const replaced = applyOperations(g, [{ op: 'update_config', node: 'LLM Call', config: { model: 'b' }, replace: true }], context()).graph;
    expect(replaced.nodes[0].data.config).toEqual({ model: 'b' });
  });

  it('sets node controls and rejects unknown ones', () => {
    const g = applyOperations(empty, [{ op: 'add_node', type: 'set' }], context()).graph;
    const on = applyOperations(g, [{ op: 'set_node_controls', node: 'Set / Transform', controls: { retryOnFail: true, maxTries: 3 } }], context());
    expect(on.graph.nodes[0].data).toMatchObject({ retryOnFail: true, maxTries: 3 });
    const bad = applyOperations(g, [{ op: 'set_node_controls', node: 'Set / Transform', controls: { label: 'x' } as never }], context());
    expect(bad.results[0].error).toMatch(/Unknown control: label/);
  });

  it('refuses ambiguous labels and asks for the id', () => {
    const twins: GraphDoc = {
      edges: [],
      nodes: ['a', 'b'].map((id): Node => ({ id, type: 'ottoNode', position: { x: 0, y: 0 }, data: { label: 'Twin', nodeType: 'set', config: {} } })),
    };
    expect(applyOperations(twins, [{ op: 'remove_node', node: 'Twin' }], context()).results[0].error).toMatch(/matches 2 nodes/);
    expect(applyOperations(twins, [{ op: 'remove_node', node: 'b' }], context()).ok).toBe(true);
  });

  it('renames and keeps expressions that referenced the old name working', () => {
    const g = applyOperations(empty, [
      { op: 'add_node', type: 'set', ref: 'src', label: 'Lookup' },
      { op: 'add_node', type: 'llm_call', ref: 'use', label: 'Use', config: { userPrompt: 'Hi {{ $node["Lookup"].json.name }}' } },
      { op: 'rename_node', node: 'src', label: 'Lookup customer' },
    ], context()).graph;
    expect(labels(g)).toEqual(['Lookup customer', 'Use']);
    expect(g.nodes[1].data.config.userPrompt).toBe('Hi {{ $node["Lookup customer"].json.name }}');
  });

  it('will not rename to a label another node already has', () => {
    const g = applyOperations(empty, [
      { op: 'add_node', type: 'set', label: 'A' },
      { op: 'add_node', type: 'set', label: 'B' },
    ], context()).graph;
    expect(applyOperations(g, [{ op: 'rename_node', node: 'B', label: 'A' }], context()).results[0].error).toMatch(/already called "A"/);
  });
});

describe('rewriteNodeReferences', () => {
  it('rewrites every reference style and leaves other text alone', () => {
    const config = {
      a: '{{ $node["Old"].json.x }}',
      b: "{{ $node['Old'].json.x }}",
      c: '{{ nodes["Old"].x }} and {{ $nodes["Old"].x }}',
      d: '{{ $items("Old")[0] }} {{ $("Old").item }}',
      e: '{{ $node.Old.json }}',
      f: ['{{ $node["Old"].json }}', { deep: '{{ $node["Old"].data }}' }],
      g: 'Old stays plain text, and $node["Older"] is a different node',
      h: 42,
    };
    expect(rewriteNodeReferences(config, 'Old', 'New')).toEqual({
      a: '{{ $node["New"].json.x }}',
      b: "{{ $node['New'].json.x }}",
      c: '{{ nodes["New"].x }} and {{ $nodes["New"].x }}',
      d: '{{ $items("New")[0] }} {{ $("New").item }}',
      e: '{{ $node.New.json }}',
      f: ['{{ $node["New"].json }}', { deep: '{{ $node["New"].data }}' }],
      g: 'Old stays plain text, and $node["Older"] is a different node',
      h: 42,
    });
  });

  it('switches dotted references to brackets when the new name has spaces', () => {
    expect(rewriteNodeReferences('{{ $node.Lookup.json }}', 'Lookup', 'Lookup customer'))
      .toBe('{{ $node["Lookup customer"].json }}');
  });

  it('escapes quotes and handles names with regex characters', () => {
    expect(rewriteNodeReferences(`{{ $node['A (b)'].json }}`, 'A (b)', "it's")).toBe('{{ $node["it\'s"].json }}');
  });

  it('returns the same object when nothing referenced the node', () => {
    const config = { a: 'nothing here', nested: { b: 1 } };
    expect(rewriteNodeReferences(config, 'Old', 'New')).toBe(config);
  });
});

describe('renameNodeInGraph', () => {
  it('does not rewrite when the old label was shared by two nodes', () => {
    const graph: GraphDoc = {
      edges: [],
      nodes: [
        { id: 'a', type: 'ottoNode', position: { x: 0, y: 0 }, data: { label: 'Dup', nodeType: 'set', config: {} } },
        { id: 'b', type: 'ottoNode', position: { x: 0, y: 0 }, data: { label: 'Dup', nodeType: 'set', config: {} } },
        { id: 'c', type: 'ottoNode', position: { x: 0, y: 0 }, data: { label: 'C', nodeType: 'set', config: { v: '{{ $node["Dup"].json }}' } } },
      ],
    };
    const next = renameNodeInGraph(graph, 'a', 'Renamed');
    expect(next.nodes[0].data.label).toBe('Renamed');
    expect(next.nodes[2].data.config.v).toBe('{{ $node["Dup"].json }}');
  });
});

describe('describeGraph', () => {
  it('produces a compact view with edges named by label', () => {
    const g = applyOperations(empty, [
      { op: 'add_node', type: 'manual_trigger', ref: 't' },
      { op: 'add_node', type: 'if', ref: 'i', label: 'Check' },
      { op: 'add_node', type: 'set', ref: 's', label: 'Yes' },
      { op: 'connect', source: 't', target: 'i' },
      { op: 'connect', source: 'i', target: 's', sourceHandle: 'true' },
    ], context()).graph;
    const view = describeGraph(g);
    expect(view.nodes.map((n) => n.type)).toEqual(['manual_trigger', 'if', 'set']);
    expect(view.edges).toEqual([
      { source: 'Manual Trigger', target: 'Check' },
      { source: 'Check', target: 'Yes', sourceHandle: 'true' },
    ]);
  });
});
