import assert from 'assert/strict';
import { evaluateExpression, resolveConfig } from '../src/engine/expressions.js';
import { makeItem, normalizeItems } from '../src/utils/items.js';

const context = {
  input: {
    name: 'Ada',
    count: 3,
    items: [{ id: 1 }, { id: 2 }],
  },
  nodes: {
    node_a: { body: { id: 5 } },
    HTTP: { body: { id: 42 } },
    List: { items: [{ json: { id: 10 } }, { json: { id: 20 } }] },
  },
};

const resolved = resolveConfig({
  nativeNumber: '{{ input.count + 2 }}',
  inline: 'Hello {{ $uppercase($json.name) }}',
  byNodeName: '{{ $node["HTTP"].json.body.id }}',
  byNodeId: '{{ nodes.node_a.body.id }}',
  itemIds: '{{ $items("List").map(item => item.json.id).join(",") }}',
  objectValue: '{{ $pick($json, ["name", "count"]) }}',
}, context);

assert.equal(resolved.nativeNumber, 5);
assert.equal(resolved.inline, 'Hello ADA');
assert.equal(resolved.byNodeName, 42);
assert.equal(resolved.byNodeId, 5);
assert.equal(resolved.itemIds, '10,20');
assert.deepEqual(resolved.objectValue, { name: 'Ada', count: 3 });
assert.deepEqual(normalizeItems({ items: [makeItem({ id: 1 }), { id: 2 }] }).map((item) => item.json.id), [1, 2]);

assert.throws(
  () => evaluateExpression('process.env', context),
  /blocked identifier/
);

console.log('expressions smoke ok');
