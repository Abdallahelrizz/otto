import assert from 'assert/strict';

import { getNodeHandler } from '../src/nodes/index.js';
import {
  csvParse,
  csvStringify,
  xmlParse,
  xmlStringify,
  htmlExtract,
  jsonTransform,
  compressionNode,
} from '../src/nodes/data-transform.js';
import { importN8n } from '../src/utils/n8n-importer.js';
import { validateWorkflowDefinition } from '../src/utils/workflow-validation.js';

const transformNodeTypes = [
  'csv_parse',
  'csv_stringify',
  'xml_parse',
  'xml_stringify',
  'html_extract',
  'json_transform',
  'compression',
];

for (const nodeType of transformNodeTypes) {
  assert.equal(typeof getNodeHandler(nodeType), 'function', `${nodeType} should be registered`);
}

const parsedCsv = await csvParse({
  input: {},
  config: {
    text: 'name,age\nAda,36\nGrace,37',
    delimiter: ',',
    hasHeader: 'true',
    trim: 'true',
  },
});
assert.equal(parsedCsv.count, 2);
assert.equal(parsedCsv.rows[0].name, 'Ada');
assert.equal(parsedCsv.items[1].json.age, '37');

const csvOut = await csvStringify({
  input: { rows: parsedCsv.rows },
  config: { sourceField: 'rows', delimiter: ',', includeHeader: 'true', columns: 'name,age' },
});
assert.equal(csvOut.csv, 'name,age\nAda,36\nGrace,37');

const parsedXml = await xmlParse({
  input: {},
  config: { text: '<root><item id="1">A</item><item id="2">B</item></root>' },
});
assert.equal(parsedXml.root.item[0].$.id, '1');
assert.equal(parsedXml.root.item[1]._text, 'B');

const xmlOut = await xmlStringify({
  input: {},
  config: { value: { title: 'Otto', meta: { $: { id: '1' }, _text: 'ok' } }, rootName: 'doc' },
});
assert.equal(xmlOut.xml, '<doc><title>Otto</title><meta id="1">ok</meta></doc>');

const title = await htmlExtract({
  input: {},
  config: { html: '<h1>Hello <span>World</span></h1><a href="/x">Link</a>', selector: 'h1', attribute: 'text' },
});
assert.equal(title.result, 'Hello World');

const href = await htmlExtract({
  input: {},
  config: { html: '<a href="/x">Link</a>', selector: 'a', attribute: 'href' },
});
assert.equal(href.result, '/x');

const jsonGet = await jsonTransform({
  input: {},
  config: { operation: 'get', value: { customer: { id: 'c_1', name: 'Ada' } }, path: 'customer.id' },
});
assert.equal(jsonGet.result, 'c_1');

const jsonSet = await jsonTransform({
  input: {},
  config: { operation: 'set', value: { customer: { id: 'c_1' } }, path: 'customer.score', setValue: '99' },
});
assert.equal(jsonSet.result.customer.score, 99);

const jsonPick = await jsonTransform({
  input: {},
  config: { operation: 'pick', value: { a: 1, b: 2, nested: { id: 3 } }, paths: 'b,nested.id' },
});
assert.deepEqual(jsonPick.result, { b: 2, nested: { id: 3 } });

const gzipped = await compressionNode({
  input: {},
  config: { operation: 'gzip', value: 'hello otto', inputEncoding: 'utf8', outputEncoding: 'base64' },
});
const unzipped = await compressionNode({
  input: {},
  config: { operation: 'gunzip', value: gzipped.result, inputEncoding: 'base64', outputEncoding: 'utf8' },
});
assert.equal(unzipped.result, 'hello otto');

const n8nNodes = [
  ['CSV In', 'n8n-nodes-base.spreadsheetFile', { operation: 'fromFile', delimiter: ',' }, 'csv_parse'],
  ['CSV Out', 'n8n-nodes-base.spreadsheetFile', { operation: 'toFile', delimiter: ',' }, 'csv_stringify'],
  ['XML In', 'n8n-nodes-base.xml', { operation: 'toJson' }, 'xml_parse'],
  ['XML Out', 'n8n-nodes-base.xml', { operation: 'toXml' }, 'xml_stringify'],
  ['HTML', 'n8n-nodes-base.htmlExtract', { selector: 'h1', returnValue: 'text' }, 'html_extract'],
  ['Items', 'n8n-nodes-base.itemLists', { operation: 'sort' }, 'json_transform'],
  ['Compression', 'n8n-nodes-base.compression', { operation: 'gzip' }, 'compression'],
];

const imported = importN8n({
  name: 'Transform node fixture',
  nodes: n8nNodes.map(([name, type, parameters], index) => ({
    id: String(index + 1),
    name,
    type,
    typeVersion: 1,
    position: [index * 160, 0],
    parameters,
  })),
  connections: {},
});

const importedByName = Object.fromEntries(imported.nodes.map((node) => [node.name, node]));
for (const [name, , , expectedType] of n8nNodes) {
  assert.equal(importedByName[name].type, expectedType, `${name} should import as ${expectedType}`);
  assert.equal(importedByName[name].config._ottoImport.status, 'partial');
}
assert.equal(imported.report.summary.partial, n8nNodes.length);

const validation = validateWorkflowDefinition({
  nodes: transformNodeTypes.map((type, index) => ({
    id: `n${index}`,
    type,
    name: type,
    config: {
      operation: type === 'compression' ? 'gzip' : type === 'json_transform' ? 'get' : undefined,
      delimiter: ',',
      hasHeader: 'true',
      includeHeader: 'true',
      rootName: 'root',
      selector: 'title',
      attribute: 'text',
    },
  })),
  edges: [],
}, { requireIncoming: false });
assert.equal(validation.errorCount, 0);

console.log('transform nodes smoke ok');
