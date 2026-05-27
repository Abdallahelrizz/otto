import assert from 'assert/strict';
import {
  hasBlockingIssues,
  hasSaveBlockingIssues,
  scopeDefinitionForValidation,
  validateWorkflowDefinition,
} from '../src/utils/workflow-validation.js';

const validWorkflow = {
  nodes: [
    { id: 'manual', type: 'manual_trigger', name: 'Manual', config: {} },
    { id: 'http', type: 'http_request', name: 'HTTP', config: { method: 'GET', url: 'https://example.com' } },
  ],
  edges: [{ id: 'e1', source: 'manual', target: 'http' }],
};

const validResult = validateWorkflowDefinition(validWorkflow);
assert.equal(validResult.ok, true);
assert.equal(hasBlockingIssues(validResult), false);

const missingField = validateWorkflowDefinition({
  nodes: [{ id: 'http', type: 'http_request', name: 'HTTP', config: { method: 'GET' } }],
  edges: [],
});
assert.equal(hasBlockingIssues(missingField), true);
assert.equal(missingField.errors[0].code, 'required_field_missing');
assert.equal(missingField.errors[0].field, 'url');

const disabledMissingField = validateWorkflowDefinition({
  nodes: [{ id: 'disabled-http', type: 'http_request', name: 'Disabled HTTP', disabled: true, config: { method: 'GET' } }],
  edges: [],
});
assert.equal(hasBlockingIssues(disabledMissingField), false);
assert.equal(disabledMissingField.errors.length, 0);

const invalidJson = validateWorkflowDefinition({
  nodes: [{ id: 'pg', type: 'postgres_query', name: 'PG', config: { query: 'SELECT 1', params: '{bad' } }],
  edges: [],
});
assert.equal(invalidJson.errors.some((issue) => issue.code === 'invalid_json'), true);

const missingCredential = validateWorkflowDefinition({
  nodes: [{ id: 'slack', type: 'slack_send_message', name: 'Slack', config: { channel: 'C123', text: 'Hi' } }],
  edges: [],
});
assert.equal(missingCredential.errors.some((issue) => issue.code === 'missing_credential'), true);

const placeholder = validateWorkflowDefinition({
  nodes: [{ id: 'x', type: 'placeholder', name: 'Unsupported', config: { _ottoImport: { status: 'placeholder' } } }],
  edges: [],
});
assert.equal(placeholder.errors.some((issue) => issue.code === 'unsupported_import_node'), true);

const scoped = scopeDefinitionForValidation({
  nodes: [
    { id: 'bad', type: 'http_request', name: 'Bad HTTP', config: {} },
    { id: 'crypto', type: 'crypto', name: 'Crypto', config: { operation: 'sha256', value: 'otto' } },
  ],
  edges: [],
}, { mode: 'single_node', nodeId: 'crypto' });
const scopedResult = validateWorkflowDefinition(scoped, { mode: 'single_node' });
assert.equal(scopedResult.errors.some((issue) => issue.nodeId === 'bad'), false);
assert.equal(scopedResult.errors.length, 0);

const malformed = validateWorkflowDefinition({ nodes: [] });
assert.equal(hasSaveBlockingIssues(malformed), true);

console.log('workflow validation smoke ok');
