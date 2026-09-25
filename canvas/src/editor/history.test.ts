import { describe, expect, it } from 'vitest';
import type { Edge, Node } from 'reactflow';
import { GraphHistory } from './history';
import type { GraphDoc } from './history';

function node(id: string, x = 0, extra: Partial<Node> = {}): Node {
  return { id, type: 'ottoNode', position: { x, y: 0 }, data: { label: id, nodeType: 'set', config: {} }, ...extra };
}

function doc(nodes: Node[], edges: Edge[] = []): GraphDoc {
  return { nodes, edges };
}

function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('GraphHistory', () => {
  it('undoes and redoes separate changes one at a time', () => {
    const c = clock();
    const h = new GraphHistory({ now: c.now, coalesceMs: 500 });
    h.reset(doc([]));
    h.observe(doc([node('a')]));
    c.advance(1000);
    h.observe(doc([node('a'), node('b')]));

    expect(h.undo()?.nodes.map((n) => n.id)).toEqual(['a']);
    expect(h.undo()?.nodes.map((n) => n.id)).toEqual([]);
    expect(h.undo()).toBeNull();
    expect(h.redo()?.nodes.map((n) => n.id)).toEqual(['a']);
    expect(h.redo()?.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(h.canRedo).toBe(false);
  });

  it('merges a burst of quick changes, like typing, into one step', () => {
    const c = clock();
    const h = new GraphHistory({ now: c.now, coalesceMs: 500 });
    h.reset(doc([node('a')]));
    for (const label of ['H', 'He', 'Hel', 'Hello']) {
      c.advance(100);
      h.observe(doc([{ ...node('a'), data: { label, nodeType: 'set', config: {} } }]));
    }
    expect(h.undo()?.nodes[0].data.label).toBe('a');
    expect(h.canUndo).toBe(false);
  });

  it('ignores selection, drag state and edge styling', () => {
    const h = new GraphHistory();
    h.reset(doc([node('a')], [{ id: 'e', source: 'a', target: 'b' }]));
    h.observe(doc([node('a', 0, { selected: true })], [{ id: 'e', source: 'a', target: 'b', style: { stroke: 'red' } }]));
    expect(h.canUndo).toBe(false);
  });

  it('records a drag once, when it ends', () => {
    const c = clock();
    const h = new GraphHistory({ now: c.now, coalesceMs: 0 });
    h.reset(doc([node('a', 0)]));
    for (const x of [10, 20, 30]) {
      c.advance(10);
      h.observe(doc([node('a', x, { dragging: true })]));
    }
    expect(h.canUndo).toBe(false);
    h.observe(doc([node('a', 30)]));
    expect(h.undo()?.nodes[0].position.x).toBe(0);
  });

  it('starts a new step after a checkpoint even when changes are close together', () => {
    const c = clock();
    const h = new GraphHistory({ now: c.now, coalesceMs: 10_000 });
    h.reset(doc([]));
    h.observe(doc([node('a')]));
    h.checkpoint();
    c.advance(1);
    h.observe(doc([node('a'), node('b')]));
    expect(h.undo()?.nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('drops the redo branch when a new change is made after undo', () => {
    const c = clock();
    const h = new GraphHistory({ now: c.now, coalesceMs: 0 });
    h.reset(doc([]));
    c.advance(1);
    h.observe(doc([node('a')]));
    h.undo();
    c.advance(1);
    h.observe(doc([node('z')]));
    expect(h.canRedo).toBe(false);
    expect(h.undo()?.nodes).toEqual([]);
  });

  it('keeps at most `limit` steps', () => {
    const c = clock();
    const h = new GraphHistory({ now: c.now, coalesceMs: 0, limit: 3 });
    h.reset(doc([]));
    for (let i = 1; i <= 6; i += 1) {
      c.advance(1);
      h.observe(doc([node('a', i)]));
    }
    let steps = 0;
    while (h.undo()) steps += 1;
    expect(steps).toBe(3);
  });

  it('does not treat restoring a snapshot as a new change', () => {
    const c = clock();
    const h = new GraphHistory({ now: c.now, coalesceMs: 0 });
    h.reset(doc([]));
    c.advance(1);
    h.observe(doc([node('a')]));
    const restored = h.undo()!;
    h.observe(restored);
    expect(h.canRedo).toBe(true);
  });
});
