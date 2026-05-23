import { webhookTrigger } from './webhook-trigger.js';
import { httpRequest } from './http-request.js';
import { llmCall } from './llm-call.js';
import { ifNode } from './if.js';
import { mergeNode } from './merge.js';
import { setNode } from './set.js';

const registry = new Map([
  ['webhook_trigger', webhookTrigger],
  ['manual_trigger',  webhookTrigger], // manual trigger passes input straight through
  ['http_request',    httpRequest],
  ['llm_call',        llmCall],
  ['if',              ifNode],
  ['merge',           mergeNode],
  ['set',             setNode],
]);

export function getNodeHandler(type) {
  const handler = registry.get(type);
  if (!handler) throw new Error(`Unknown node type: "${type}"`);
  return handler;
}
