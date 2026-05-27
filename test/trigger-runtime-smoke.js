import assert from 'assert/strict';

import { getNodeHandler } from '../src/nodes/index.js';
import { importN8n } from '../src/utils/n8n-importer.js';
import {
  buildChatInput,
  buildFormInput,
  buildTriggerInput,
  methodMatches,
  normalizeHttpMethod,
  normalizeTriggerPath,
  parseFormFields,
  renderFormHtml,
  validateFormFields,
  webhookResponse,
} from '../src/triggers/runtime.js';
import { validateWorkflowDefinition } from '../src/utils/workflow-validation.js';

for (const nodeType of ['webhook_trigger', 'form_trigger', 'chat_trigger']) {
  assert.equal(typeof getNodeHandler(nodeType), 'function', `${nodeType} should be registered`);
}

assert.equal(normalizeTriggerPath('/lead-form/'), 'lead-form');
assert.throws(() => normalizeTriggerPath('nested/path'), /single URL segment/);
assert.equal(normalizeHttpMethod('post'), 'POST');
assert.equal(methodMatches('ANY', 'PATCH'), true);
assert.equal(methodMatches('POST', 'GET'), false);

const fieldsJson = JSON.stringify([
  { name: 'email', label: 'Email', type: 'email', required: true },
  { name: 'topic', label: 'Topic', type: 'select', options: 'sales,support' },
]);
const fields = parseFormFields(fieldsJson);
assert.equal(fields[0].name, 'email');
assert.deepEqual(fields[1].options, ['sales', 'support']);
assert.equal(validateFormFields(fieldsJson).length, 0);
assert.equal(validateFormFields('[{"label":"Missing name"}]').length, 1);

const formHtml = renderFormHtml({ title: 'Contact', fieldsJson, submitLabel: 'Send' }, { action: '/forms/contact' });
assert.match(formHtml, /<form method="POST" action="\/forms\/contact">/);
assert.match(formHtml, /name="email"/);

const req = {
  body: { email: 'ada@example.com', message: 'hello' },
  headers: { 'content-type': 'application/json' },
  query: { source: 'test' },
  method: 'POST',
};
const formNode = { id: 'form1', name: 'Contact', config: { path: 'contact', title: 'Contact', fieldsJson } };
const formInput = buildFormInput({ req, workflowId: 'wf1', node: formNode, path: 'contact', mode: 'test' });
assert.equal(formInput.submission.email, 'ada@example.com');
assert.equal(formInput.trigger.type, 'form');
assert.equal(formInput.form.fields.length, 2);

const chatNode = { id: 'chat1', name: 'Chat', config: { path: 'assistant', sessionField: 'sid', messageField: 'text' } };
const chatInput = buildChatInput({
  req: { ...req, body: { sid: 's1', text: 'Hi', metadata: { channel: 'web' } } },
  workflowId: 'wf1',
  node: chatNode,
  path: 'assistant',
  mode: 'production',
});
assert.equal(chatInput.sessionId, 's1');
assert.equal(chatInput.message, 'Hi');
assert.equal(chatInput.metadata.channel, 'web');

const webhookNode = { id: 'hook1', name: 'Webhook', config: { path: 'hook' } };
const webhookInput = buildTriggerInput({
  req,
  triggerType: 'webhook',
  workflowId: 'wf1',
  node: webhookNode,
  path: 'hook',
  mode: 'production',
});
assert.equal(webhookInput.body.email, 'ada@example.com');
assert.equal(webhookInput.trigger.nodeId, 'hook1');

const accepted = webhookResponse({}, { workflowId: 'wf1', executionId: 'ex1' });
assert.equal(accepted.statusCode, 202);
assert.equal(accepted.body.executionId, 'ex1');

const custom = webhookResponse(
  { responseMode: 'custom', responseStatus: 201, responseBody: '{"ok":true}' },
  { workflowId: 'wf1', executionId: 'ex1' }
);
assert.equal(custom.statusCode, 201);
assert.deepEqual(custom.body, { ok: true });

const validWorkflow = {
  nodes: [
    { id: 'form1', type: 'form_trigger', name: 'Form', config: { path: 'contact', title: 'Contact', fieldsJson } },
    { id: 'chat1', type: 'chat_trigger', name: 'Chat', config: { path: 'assistant', sessionField: 'sessionId', messageField: 'message' } },
    { id: 'webhook1', type: 'webhook_trigger', name: 'Webhook', config: { path: 'hook', method: 'POST' } },
  ],
  edges: [],
};
const validation = validateWorkflowDefinition(validWorkflow, { requireIncoming: false });
assert.equal(validation.errorCount, 0);

const invalidForm = validateWorkflowDefinition({
  nodes: [{ id: 'form', type: 'form_trigger', name: 'Bad Form', config: { path: 'bad', title: 'Bad', fieldsJson: '{bad' } }],
  edges: [],
}, { requireIncoming: false });
assert.equal(invalidForm.errors.some((issue) => issue.code === 'invalid_json'), true);

const imported = importN8n({
  name: 'Trigger fixture',
  nodes: [
    {
      id: '1',
      name: 'Webhook',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [0, 0],
      disabled: true,
      notes: 'Inspect sample payload before activating',
      notesInFlow: true,
      continueOnFail: true,
      retryOnFail: true,
      maxTries: 4,
      waitBetweenTries: 250,
      alwaysOutputData: true,
      parameters: { path: 'hook', httpMethod: 'PATCH', responseCode: 201 },
    },
    {
      id: '2',
      name: 'Form',
      type: 'n8n-nodes-base.formTrigger',
      typeVersion: 1,
      position: [160, 0],
      parameters: { path: 'contact', formTitle: 'Contact', formFields: { values: [{ name: 'email', type: 'email' }] } },
    },
    {
      id: '3',
      name: 'Chat',
      type: '@n8n/n8n-nodes-langchain.chatTrigger',
      typeVersion: 1,
      position: [320, 0],
      parameters: { path: 'assistant' },
    },
  ],
  connections: {},
});
const importedByName = Object.fromEntries(imported.nodes.map((node) => [node.name, node]));
assert.equal(importedByName.Webhook.type, 'webhook_trigger');
assert.equal(importedByName.Webhook.config.method, 'PATCH');
assert.equal(importedByName.Webhook.disabled, true);
assert.equal(importedByName.Webhook.notes, 'Inspect sample payload before activating');
assert.equal(importedByName.Webhook.displayNote, true);
assert.equal(importedByName.Webhook.continueOnError, true);
assert.equal(importedByName.Webhook.retryOnFail, true);
assert.equal(importedByName.Webhook.maxTries, 4);
assert.equal(importedByName.Webhook.retryDelayMs, 250);
assert.equal(importedByName.Webhook.alwaysOutputData, true);
assert.equal(importedByName.Form.type, 'form_trigger');
assert.equal(importedByName.Chat.type, 'chat_trigger');
assert.equal(imported.report.summary.partial, 3);

console.log('trigger runtime smoke ok');
