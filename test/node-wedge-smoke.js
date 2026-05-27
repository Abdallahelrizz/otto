import assert from 'assert/strict';
import { createHash } from 'crypto';

import { getNodeHandler } from '../src/nodes/index.js';
import { cryptoNode } from '../src/nodes/crypto.js';
import { dateTime } from '../src/nodes/datetime.js';
import { jwtNode } from '../src/nodes/jwt.js';
import { slackSendMessage } from '../src/nodes/slack-send-message.js';
import { discordSendMessage } from '../src/nodes/discord-send-message.js';
import { telegramSendMessage } from '../src/nodes/telegram-send-message.js';
import { notionApi } from '../src/nodes/notion-api.js';
import { airtableRecords } from '../src/nodes/airtable-records.js';
import { graphqlRequest } from '../src/nodes/graphql-request.js';
import { importN8n } from '../src/utils/n8n-importer.js';

const newNodeTypes = [
  'crypto',
  'datetime',
  'jwt',
  'slack_send_message',
  'discord_send_message',
  'telegram_send_message',
  'parallel_ai',
  'github_api',
  'notion_api',
  'airtable_records',
  'graphql_request',
];

for (const nodeType of newNodeTypes) {
  assert.equal(typeof getNodeHandler(nodeType), 'function', `${nodeType} should be registered`);
}

const hashed = await cryptoNode({ input: {}, config: { operation: 'sha256', value: 'otto', encoding: 'hex' } });
assert.equal(hashed.result, createHash('sha256').update('otto').digest('hex'));

const encoded = await cryptoNode({ input: {}, config: { operation: 'base64-encode', value: 'hello' } });
assert.equal(encoded.result, 'aGVsbG8=');

const formattedDate = await dateTime({
  input: {},
  config: {
    operation: 'format',
    value: '2026-05-25T13:14:15.000Z',
    inputFormat: 'iso',
    outputFormat: 'YYYY-MM-DD',
  },
});
assert.equal(formattedDate.result, '2026-05-25');

const addedDate = await dateTime({
  input: {},
  config: {
    operation: 'add',
    value: '2026-05-25T00:00:00.000Z',
    inputFormat: 'iso',
    outputFormat: 'iso',
    addAmount: 2,
    addUnit: 'days',
  },
});
assert.equal(addedDate.iso, '2026-05-27T00:00:00.000Z');

const signed = await jwtNode({
  input: {},
  config: {
    operation: 'sign',
    payload: '{"sub":"user_1"}',
    secret: 'test-secret',
    algorithm: 'HS256',
    expiresIn: '60s',
  },
});
assert.equal(String(signed.token).split('.').length, 3);

const decoded = await jwtNode({ input: {}, config: { operation: 'decode', token: signed.token } });
assert.equal(decoded.payload.sub, 'user_1');

const verified = await jwtNode({
  input: {},
  config: { operation: 'verify', token: signed.token, secret: 'test-secret', algorithm: 'HS256' },
});
assert.equal(verified.valid, true);

await assert.rejects(
  slackSendMessage({ config: { text: 'hello' }, credential: null }),
  /channel is required/
);
await assert.rejects(
  discordSendMessage({ config: {}, credential: null }),
  /webhookUrl is required/
);
await assert.rejects(
  telegramSendMessage({ config: { chatId: '123' }, credential: null }),
  /bot token is required/
);
const parallelResult = await getNodeHandler('parallel_ai')({
  config: {
    targetsJson: JSON.stringify([
      { id: 'a', provider: 'missing_provider_a', model: 'model-a', userPrompt: 'hello' },
      { id: 'b', provider: 'missing_provider_b', model: 'model-b', userPrompt: 'hello' },
    ]),
    failureMode: 'never',
  },
  credential: null,
});
assert.equal(parallelResult.branchCount, 2);
assert.equal(parallelResult.successCount, 0);
assert.equal(parallelResult.errorCount, 2);
await assert.rejects(
  getNodeHandler('parallel_ai')({ config: { targetsJson: '{bad' }, credential: null }),
  /invalid targets JSON/
);
await assert.rejects(
  notionApi({ config: { path: '/users/me' }, credential: null }),
  /API token is required/
);
await assert.rejects(
  airtableRecords({ config: { tableName: 'Tasks' }, credential: null }),
  /baseId is required/
);
await assert.rejects(
  graphqlRequest({ config: { query: '{ viewer { id } }' }, credential: null }),
  /endpoint is required/
);

const n8nNodes = [
  ['Slack', 'n8n-nodes-base.slack', { channel: 'C123', text: 'Hi' }, 'slack_send_message'],
  ['Discord', 'n8n-nodes-base.discord', { webhookUrl: 'https://example.invalid/webhook', content: 'Hi' }, 'discord_send_message'],
  ['Telegram', 'n8n-nodes-base.telegram', { chatId: '123', text: 'Hi' }, 'telegram_send_message'],
  ['GitHub', 'n8n-nodes-base.github', { resource: 'user' }, 'github_api'],
  ['Notion', 'n8n-nodes-base.notion', { resource: 'users/me' }, 'notion_api'],
  ['Airtable', 'n8n-nodes-base.airtable', { operation: 'list', baseId: 'app123', table: 'Tasks' }, 'airtable_records'],
  ['GraphQL', 'n8n-nodes-base.graphql', { endpoint: 'https://example.invalid/graphql', query: '{ ok }' }, 'graphql_request'],
  ['DateTime', 'n8n-nodes-base.dateTime', { operation: 'format', value: '2026-05-25' }, 'datetime'],
  ['Crypto', 'n8n-nodes-base.crypto', { operation: 'sha256', value: 'otto' }, 'crypto'],
  ['JWT', 'n8n-nodes-base.jwt', { operation: 'decode', token: '{{ input.token }}' }, 'jwt'],
];

const imported = importN8n({
  name: 'Service node fixture',
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

console.log('node wedge smoke ok');
