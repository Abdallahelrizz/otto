import { webhookTrigger } from './webhook-trigger.js';
import { httpRequest } from './http-request.js';
import { llmCall } from './llm-call.js';
import { ifNode } from './if.js';
import { mergeNode } from './merge.js';
import { setNode } from './set.js';
import { placeholderNode } from './placeholder.js';
import { aiAgent } from './ai-agent.js';
import { delayNode } from './delay.js';
import { filterNode } from './filter.js';
import { loopNode } from './loop.js';
import { subWorkflow } from './sub-workflow.js';
import { sendEmail } from './send-email.js';
import { postgresQuery } from './postgres-query.js';
import { redisGet } from './redis-get.js';
import { redisSet } from './redis-set.js';
import { vectorSearch } from './vector-search.js';
import { scheduleTrigger } from './schedule-trigger.js';
import { codeNode } from './code.js';

const registry = new Map([
  ['webhook_trigger',  webhookTrigger],
  ['manual_trigger',   webhookTrigger],
  ['schedule_trigger', scheduleTrigger],
  ['http_request',     httpRequest],
  ['llm_call',         llmCall],
  ['ai_agent',         aiAgent],
  ['if',               ifNode],
  ['filter',           filterNode],
  ['merge',            mergeNode],
  ['set',              setNode],
  ['loop',             loopNode],
  ['delay',            delayNode],
  ['sub_workflow',     subWorkflow],
  ['send_email',       sendEmail],
  ['postgres_query',   postgresQuery],
  ['redis_get',        redisGet],
  ['redis_set',        redisSet],
  ['vector_search',    vectorSearch],
  ['code',             codeNode],
  ['placeholder',      placeholderNode],
]);

export function getNodeHandler(type) {
  const handler = registry.get(type);
  if (!handler) throw new Error(`Unknown node type: "${type}"`);
  return handler;
}
