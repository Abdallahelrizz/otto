import { webhookTrigger } from './webhook-trigger.js';
import { formTrigger } from './form-trigger.js';
import { chatTrigger } from './chat-trigger.js';
import { httpRequest } from './http-request.js';
import { llmCall } from './llm-call.js';
import { parallelAi } from './parallel-ai.js';
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
import { memoryRead } from './memory-read.js';
import { memoryWrite } from './memory-write.js';
import { readFileNode } from './read-file.js';
import { writeFileNode } from './write-file.js';
import { moveBinaryData } from './move-binary-data.js';
import { listFiles } from './list-files.js';
import { binaryMetadata } from './binary-metadata.js';
import { s3Object } from './s3-object.js';
import { cryptoNode } from './crypto.js';
import { dateTime } from './datetime.js';
import { jwtNode } from './jwt.js';
import { slackSendMessage } from './slack-send-message.js';
import { discordSendMessage } from './discord-send-message.js';
import { telegramSendMessage } from './telegram-send-message.js';
import { notionApi } from './notion-api.js';
import { airtableRecords } from './airtable-records.js';
import { graphqlRequest } from './graphql-request.js';
import { stripeApi } from './stripe-api.js';
import { sendgridEmail } from './sendgrid-email.js';
import { twilioSms } from './twilio-sms.js';
import { salesforceApi } from './salesforce-api.js';
import { linearApi } from './linear-api.js';
import { scheduleTrigger } from './schedule-trigger.js';
import { stopError } from './stop-error.js';
import { waitNode } from './wait.js';
import { humanApproval } from './human-approval.js';
import { codeNode } from './code.js';
import { serviceHandlers } from './services/_load.js';
import {
  csvParse,
  csvStringify,
  xmlParse,
  xmlStringify,
  htmlExtract,
  jsonTransform,
  compressionNode,
} from './data-transform.js';

const registry = new Map([
  ['webhook_trigger',  webhookTrigger],
  ['manual_trigger',   webhookTrigger],
  ['form_trigger',     formTrigger],
  ['chat_trigger',     chatTrigger],
  ['schedule_trigger', scheduleTrigger],
  ['http_request',     httpRequest],
  ['llm_call',         llmCall],
  ['parallel_ai',      parallelAi],
  ['ai_agent',         aiAgent],
  ['if',               ifNode],
  ['filter',           filterNode],
  ['merge',            mergeNode],
  ['set',              setNode],
  ['loop',             loopNode],
  ['delay',            delayNode],
  ['wait',             waitNode],
  ['human_approval',   humanApproval],
  ['stop_error',       stopError],
  ['sub_workflow',     subWorkflow],
  ['send_email',       sendEmail],
  ['postgres_query',   postgresQuery],
  ['redis_get',        redisGet],
  ['redis_set',        redisSet],
  ['vector_search',    vectorSearch],
  ['memory_read',      memoryRead],
  ['memory_write',     memoryWrite],
  ['read_file',        readFileNode],
  ['write_file',       writeFileNode],
  ['move_binary_data', moveBinaryData],
  ['list_files',       listFiles],
  ['binary_metadata',  binaryMetadata],
  ['s3_object',        s3Object],
  ['crypto',           cryptoNode],
  ['datetime',         dateTime],
  ['jwt',              jwtNode],
  ['slack_send_message', slackSendMessage],
  ['discord_send_message', discordSendMessage],
  ['telegram_send_message', telegramSendMessage],
  ['notion_api',       notionApi],
  ['airtable_records', airtableRecords],
  ['graphql_request',  graphqlRequest],
  ['stripe_api',       stripeApi],
  ['sendgrid_email',   sendgridEmail],
  ['twilio_sms',       twilioSms],
  ['salesforce_api',   salesforceApi],
  ['linear_api',       linearApi],
  ['csv_parse',        csvParse],
  ['csv_stringify',    csvStringify],
  ['xml_parse',        xmlParse],
  ['xml_stringify',    xmlStringify],
  ['html_extract',     htmlExtract],
  ['json_transform',   jsonTransform],
  ['compression',      compressionNode],
  ['code',             codeNode],
  ['placeholder',      placeholderNode],
]);

for (const [type, handler] of serviceHandlers) {
  registry.set(type, handler);
}

export function getNodeHandler(type) {
  const handler = registry.get(type);
  if (!handler) throw new Error(`Unknown node type: "${type}"`);
  return handler;
}
