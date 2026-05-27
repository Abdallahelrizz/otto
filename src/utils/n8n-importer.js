import { randomUUID } from 'crypto';

const SWITCH_TYPE = 'n8n-nodes-base.switch';
const STICKY_NOTE_TYPE = 'n8n-nodes-base.stickyNote';

const SUPPORT = {
  'n8n-nodes-base.webhook': {
    type: 'webhook_trigger',
    status: 'partial',
    notes: ['Webhook path and method are mapped. Response modes, test URLs, auth, and binary body options need review.'],
  },
  'n8n-nodes-base.webhookTrigger': {
    type: 'webhook_trigger',
    status: 'partial',
    notes: ['Webhook path and method are mapped. Response modes, test URLs, auth, and binary body options need review.'],
  },
  'n8n-nodes-base.manualTrigger': {
    type: 'manual_trigger',
    status: 'exact',
    notes: ['Manual trigger has no meaningful runtime configuration to convert.'],
  },
  'n8n-nodes-base.scheduleTrigger': {
    type: 'schedule_trigger',
    status: 'partial',
    notes: ['Basic interval and cron settings are mapped. Advanced n8n recurrence options need review.'],
  },
  'n8n-nodes-base.formTrigger': {
    type: 'form_trigger',
    status: 'partial',
    notes: ['Mapped to Form Trigger. Basic path, title, field schema, and response message are preserved; advanced n8n form options need review.'],
  },
  'n8n-nodes-base.form': {
    type: 'form_trigger',
    status: 'partial',
    notes: ['Mapped to Form Trigger. Basic form fields are preserved where possible.'],
  },
  '@n8n/n8n-nodes-langchain.chatTrigger': {
    type: 'chat_trigger',
    status: 'partial',
    notes: ['Mapped to Chat Trigger. Basic session and message fields are supported; n8n chat hub behavior needs review.'],
  },
  '@n8n/n8n-nodes-langchain.manualChatTrigger': {
    type: 'chat_trigger',
    status: 'partial',
    notes: ['Mapped to Chat Trigger. Basic session and message fields are supported; manual chat UI behavior needs review.'],
  },
  'n8n-nodes-base.httpRequest': {
    type: 'http_request',
    status: 'partial',
    notes: ['Method, URL, headers, and simple body fields are mapped. Credentials, pagination, proxy, retry, redirect, and binary options need review.'],
  },
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': {
    type: 'llm_call',
    status: 'partial',
    notes: ['Provider and model are mapped. n8n LangChain connection semantics and credentials must be reselected in Otto.'],
  },
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': {
    type: 'llm_call',
    status: 'partial',
    notes: ['Provider and model are mapped. n8n LangChain connection semantics and credentials must be reselected in Otto.'],
  },
  '@n8n/n8n-nodes-langchain.lmChatOpenRouter': {
    type: 'llm_call',
    status: 'partial',
    notes: ['Provider and model are mapped. n8n LangChain connection semantics and credentials must be reselected in Otto.'],
  },
  '@n8n/n8n-nodes-langchain.chainLlm': {
    type: 'llm_call',
    status: 'partial',
    notes: ['Mapped to a direct LLM call. Chain prompt plumbing and connected model nodes need review.'],
  },
  '@n8n/n8n-nodes-langchain.agent': {
    type: 'ai_agent',
    status: 'partial',
    notes: ['Mapped to Otto AI Agent. Connected LangChain tool/model/memory nodes are not fully converted.'],
  },
  'n8n-nodes-base.if': {
    type: 'if',
    status: 'partial',
    notes: ['Simple conditions are mapped. Complex n8n condition groups and item-aware expressions need review.'],
  },
  'n8n-nodes-base.merge': {
    type: 'merge',
    status: 'partial',
    notes: ['Basic merge mode is mapped. n8n item pairing and multi-mode merge behavior need review.'],
  },
  'n8n-nodes-base.set': {
    type: 'set',
    status: 'partial',
    notes: ['Simple assignments are mapped. n8n item model, include-other-fields, and typed values need review.'],
  },
  'n8n-nodes-base.code': {
    type: 'code',
    status: 'partial',
    notes: ['Code text and language are mapped. n8n item helpers, binary helpers, and task-runner behavior are not available.'],
  },
  'n8n-nodes-base.function': {
    type: 'code',
    status: 'partial',
    notes: ['Function code is mapped to the Code node. n8n item helpers and legacy function context need review.'],
  },
  'n8n-nodes-base.functionItem': {
    type: 'code',
    status: 'partial',
    notes: ['Function Item code is mapped to the Code node. Per-item n8n semantics need manual adjustment.'],
  },
  'n8n-nodes-base.wait': {
    type: 'delay',
    status: 'partial',
    notes: ['Time-interval waits are mapped. Resume-by-webhook/date modes are not supported yet.'],
  },
  'n8n-nodes-base.filter': {
    type: 'filter',
    status: 'partial',
    notes: ['Simple conditions are mapped. Item-aware n8n filter behavior needs review.'],
  },
  'n8n-nodes-base.splitInBatches': {
    type: 'loop',
    status: 'partial',
    notes: ['Batch size is mapped to an Otto loop limit. n8n batch continuation semantics need review.'],
  },
  'n8n-nodes-base.executeWorkflow': {
    type: 'sub_workflow',
    status: 'partial',
    notes: ['Workflow ID is mapped when present. Imported workflow references must exist in Otto.'],
  },
  'n8n-nodes-base.emailSend': {
    type: 'send_email',
    status: 'partial',
    notes: ['Recipient, subject, and message are mapped. SMTP/Resend credential must be selected in Otto.'],
  },
  'n8n-nodes-base.postgres': {
    type: 'postgres_query',
    status: 'partial',
    notes: ['SQL text and simple query params are mapped. Credentials and advanced operations need review.'],
  },
  'n8n-nodes-base.readBinaryFile': {
    type: 'read_file',
    status: 'partial',
    notes: ['File path and binary property are mapped. Otto reads from the workspace file directory, not arbitrary host paths.'],
  },
  'n8n-nodes-base.readBinaryFiles': {
    type: 'read_file',
    status: 'partial',
    notes: ['Mapped to a single Read File node. Glob/multi-file behavior needs manual rebuild.'],
  },
  'n8n-nodes-base.writeBinaryFile': {
    type: 'write_file',
    status: 'partial',
    notes: ['File path and binary property are mapped. Otto writes under the workspace file directory.'],
  },
  'n8n-nodes-base.moveBinaryData': {
    type: 'move_binary_data',
    status: 'partial',
    notes: ['Basic JSON/binary conversion settings are mapped. n8n item and binary metadata behavior needs review.'],
  },
  'n8n-nodes-base.s3': {
    type: 's3_object',
    status: 'partial',
    notes: ['Mapped to S3 Object. Bucket/key/operation are mapped where possible; credentials must be reselected in Otto.'],
  },
  'n8n-nodes-base.awsS3': {
    type: 's3_object',
    status: 'partial',
    notes: ['Mapped to S3 Object. Bucket/key/operation are mapped where possible; credentials must be reselected in Otto.'],
  },
  'n8n-nodes-base.mySql': {
    type: 'placeholder',
    status: 'unsupported',
    notes: ['MySQL is recognized but not executable yet because the project has no MySQL driver/runtime handler.'],
  },
  'n8n-nodes-base.mongoDb': {
    type: 'placeholder',
    status: 'unsupported',
    notes: ['MongoDB is recognized but not executable yet because the project has no MongoDB driver/runtime handler.'],
  },
  'n8n-nodes-base.sqlite': {
    type: 'placeholder',
    status: 'unsupported',
    notes: ['SQLite is recognized but not executable yet because the current project has no stable SQLite runtime dependency.'],
  },
  'n8n-nodes-base.googleDrive': {
    type: 'placeholder',
    status: 'unsupported',
    notes: ['Google Drive is recognized but needs OAuth or service-account support before it can be executable.'],
  },
  'n8n-nodes-base.slack': {
    type: 'slack_send_message',
    status: 'partial',
    notes: ['Mapped to Slack Send Message. Credentials must be reselected in Otto; non-message Slack operations need manual rebuild.'],
  },
  'n8n-nodes-base.discord': {
    type: 'discord_send_message',
    status: 'partial',
    notes: ['Mapped to Discord webhook message. Bot operations and non-message resources need manual rebuild.'],
  },
  'n8n-nodes-base.telegram': {
    type: 'telegram_send_message',
    status: 'partial',
    notes: ['Mapped to Telegram Send Message. Bot token credential must be reselected in Otto.'],
  },
  'n8n-nodes-base.github': {
    type: 'github_api',
    status: 'partial',
    notes: ['Mapped to a GitHub API request. Resource/operation-specific n8n behavior needs review.'],
  },
  'n8n-nodes-base.notion': {
    type: 'notion_api',
    status: 'partial',
    notes: ['Mapped to a Notion API request. Resource-specific Notion operations need review.'],
  },
  'n8n-nodes-base.airtable': {
    type: 'airtable_records',
    status: 'partial',
    notes: ['Mapped to Airtable Records. Credentials and operation details need review.'],
  },
  'n8n-nodes-base.graphql': {
    type: 'graphql_request',
    status: 'partial',
    notes: ['Mapped to GraphQL Request. Authentication headers and variables need review.'],
  },
  'n8n-nodes-base.dateTime': {
    type: 'datetime',
    status: 'partial',
    notes: ['Mapped to DateTime. Complex n8n date formats/timezones need review.'],
  },
  'n8n-nodes-base.crypto': {
    type: 'crypto',
    status: 'partial',
    notes: ['Mapped to Crypto. Operation names and HMAC secrets need review.'],
  },
  'n8n-nodes-base.jwt': {
    type: 'jwt',
    status: 'partial',
    notes: ['Mapped to JWT. Otto currently supports HS256/HS384/HS512 signing and verification.'],
  },
  'n8n-nodes-base.htmlExtract': {
    type: 'html_extract',
    status: 'partial',
    notes: ['Mapped to HTML Extract. Basic tag, id, class, text, HTML, and attribute extraction are supported.'],
  },
  'n8n-nodes-base.itemLists': {
    type: 'json_transform',
    status: 'partial',
    notes: ['Mapped to JSON Transform. Review item-list operation details after import.'],
  },
  'n8n-nodes-base.renameKeys': {
    type: 'json_transform',
    status: 'partial',
    notes: ['Mapped to JSON Transform. Configure exact paths after import.'],
  },
  'n8n-nodes-base.compression': {
    type: 'compression',
    status: 'partial',
    notes: ['Mapped to Compression. Gzip, gunzip, deflate, and inflate are supported with text/base64 payloads.'],
  },
};

function namedPairsToHeaders(params) {
  const pairs = params?.headerParametersUi?.parameter
    ?? params?.headerParameters?.parameters
    ?? params?.headerParameters
    ?? [];

  if (!Array.isArray(pairs)) return [];
  return pairs
    .map((item) => ({ key: item.name ?? item.key ?? '', value: item.value ?? '' }))
    .filter((item) => item.key || item.value);
}

function namedPairsToObject(pairs) {
  if (!Array.isArray(pairs)) return {};
  return Object.fromEntries(
    pairs
      .map((item) => [item.name ?? item.key ?? '', item.value ?? ''])
      .filter(([key]) => key)
  );
}

function stringifyBody(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function locatorValue(value) {
  if (value && typeof value === 'object') {
    return value.value ?? value.cachedResultName ?? value.name ?? value.id ?? '';
  }
  return value ?? '';
}

function mapS3Operation(value) {
  const operation = String(value ?? 'list').toLowerCase();
  if (operation.includes('upload') || operation.includes('create') || operation.includes('put')) return 'put';
  if (operation.includes('download') || operation.includes('get')) return 'get';
  if (operation.includes('delete') || operation.includes('remove')) return 'delete';
  if (operation.includes('metadata') || operation.includes('head')) return 'head';
  return 'list';
}

function mapHttpRequestConfig(params) {
  const p = params ?? {};
  const bodyPairs = p.bodyParametersUi?.parameter
    ?? p.bodyParameters?.parameters
    ?? p.bodyParameters
    ?? [];
  const bodyObject = namedPairsToObject(bodyPairs);
  const body = p.jsonBody
    ?? p.rawBody
    ?? p.body
    ?? (Object.keys(bodyObject).length ? bodyObject : '');

  return {
    method: (p.method ?? p.requestMethod ?? 'GET').toUpperCase(),
    url: p.url ?? '',
    headers: namedPairsToHeaders(p),
    body: stringifyBody(body),
    authType: 'none',
  };
}

function mapLlmCallConfig(params, n8nType) {
  const p = params ?? {};
  const providerMap = {
    '@n8n/n8n-nodes-langchain.lmChatOpenAi': 'openai',
    '@n8n/n8n-nodes-langchain.lmChatAnthropic': 'anthropic',
    '@n8n/n8n-nodes-langchain.lmChatOpenRouter': 'openrouter',
    '@n8n/n8n-nodes-langchain.chainLlm': 'openai',
  };

  return {
    provider: providerMap[n8nType] ?? 'openai',
    model: p.model ?? p.modelId ?? p.options?.model ?? 'gpt-4o-mini',
    systemPrompt: p.systemPromptType === 'define' ? (p.systemPrompt ?? '') : (p.systemMessage ?? ''),
    userPrompt: p.prompt ?? p.text ?? p.messages?.message ?? '{{ input.prompt }}',
    temperature: p.temperature ?? p.options?.temperature ?? 0.7,
    maxTokens: p.maxTokens ?? p.options?.maxTokens ?? 1000,
  };
}

function mapSetConfig(params) {
  const p = params ?? {};
  const assignmentsSource = p.values?.values
    ?? p.assignments?.assignments
    ?? p.fields?.values
    ?? p.values
    ?? [];
  const assignments = Array.isArray(assignmentsSource)
    ? assignmentsSource.map((value) => ({
      key: value.name ?? value.key ?? value.fieldName ?? '',
      value: value.value ?? value.fieldValue ?? '',
    })).filter((value) => value.key)
    : [];

  return {
    assignments,
    mode: p.includeOtherFields === true || p.keepOnlySet === false ? 'merge' : 'set',
  };
}

function extractConditions(params) {
  const p = params ?? {};
  const source = p.conditions?.conditions
    ?? p.conditions?.string
    ?? p.conditions?.number
    ?? p.conditions?.boolean
    ?? p.rules?.values
    ?? [];

  if (!Array.isArray(source)) return [];
  return source.map((condition) => ({
    left: condition.leftValue ?? condition.value1 ?? condition.field ?? '',
    operator: condition.operation ?? condition.operator ?? '==',
    right: condition.rightValue ?? condition.value2 ?? condition.value ?? '',
  })).filter((condition) => condition.left || condition.right);
}

function mapIfConfig(params) {
  const p = params ?? {};
  return {
    conditions: extractConditions(p),
    combinator: (p.combinator ?? p.combineOperation ?? 'and').toLowerCase() === 'any' ? 'or' : (p.combinator ?? 'and'),
  };
}

function mapDelayConfig(params) {
  const p = params ?? {};
  const rawUnit = p.unit ?? p.resumeUnit ?? 'seconds';
  const rawAmount = Number(p.amount ?? p.resumeAmount ?? 1);
  if (rawUnit === 'hours') return { amount: rawAmount * 60, unit: 'm' };
  if (rawUnit === 'minutes') return { amount: rawAmount, unit: 'm' };
  if (rawUnit === 'milliseconds') return { amount: rawAmount, unit: 'ms' };
  return { amount: rawAmount, unit: 's' };
}

function mapScheduleConfig(params) {
  const p = params ?? {};
  if (p.rule?.interval?.[0]?.field === 'cronExpression' || p.triggerAtHour != null || p.cronExpression) {
    return {
      mode: 'cron',
      cron: p.cronExpression ?? p.rule?.interval?.[0]?.expression ?? '0 * * * *',
      timezone: p.timezone ?? 'UTC',
    };
  }
  const interval = p.rule?.interval?.[0] ?? {};
  return {
    mode: 'interval',
    every: Number(p.intervalSize ?? interval.minutesInterval ?? interval.hoursInterval ?? 15),
    unit: p.intervalUnit ?? (interval.field === 'hours' ? 'hours' : 'minutes'),
    cron: '0 * * * *',
    timezone: p.timezone ?? 'UTC',
  };
}

function mapCodeConfig(params, n8nType) {
  const p = params ?? {};
  return {
    language: p.language === 'python' ? 'python' : 'javascript',
    version: p.language === 'python' ? '3.11.x' : '18.x',
    code: p.jsCode ?? p.pythonCode ?? p.functionCode ?? p.code ?? 'return input;',
    timeoutMs: 5000,
    memoryLimitMb: 128,
    stdinMode: n8nType === 'n8n-nodes-base.functionItem' ? 'item' : 'json',
  };
}

function mapRedisConfig(params) {
  const p = params ?? {};
  const operation = (p.operation ?? 'get').toLowerCase();
  if (operation === 'set') {
    return {
      type: 'redis_set',
      status: 'partial',
      notes: ['Redis set key/value/TTL are mapped. Credentials and Redis data types need review.'],
      config: { key: p.key ?? '', value: p.value ?? '', ttl: p.expire === true ? (p.ttl ?? p.expireTime ?? 0) : (p.ttl ?? 0) },
    };
  }
  return {
    type: 'redis_get',
    status: 'partial',
    notes: ['Redis get key is mapped. Credentials and Redis data types need review.'],
    config: { key: p.key ?? '' },
  };
}

function mapTransformSupport(n8nType, params) {
  const p = params ?? {};
  if (n8nType === 'n8n-nodes-base.spreadsheetFile') {
    const operation = String(p.operation ?? p.action ?? '').toLowerCase();
    const type = operation.includes('tofile') || operation.includes('to file') || operation.includes('write')
      ? 'csv_stringify'
      : 'csv_parse';
    return {
      type,
      status: 'partial',
      notes: ['Mapped from n8n Spreadsheet File. CSV rows, headers, delimiter, and string output are supported; Excel/OpenDocument formats need manual review.'],
      config: mapConfig(type, p, n8nType),
    };
  }

  if (n8nType === 'n8n-nodes-base.xml') {
    const operation = String(p.operation ?? p.mode ?? '').toLowerCase();
    const type = operation.includes('toxml') || operation.includes('to xml') || operation.includes('string')
      ? 'xml_stringify'
      : 'xml_parse';
    return {
      type,
      status: 'partial',
      notes: ['Mapped from n8n XML. Basic XML parse/stringify is supported; namespaces, schema validation, and advanced options need review.'],
      config: mapConfig(type, p, n8nType),
    };
  }

  return null;
}

function mapConfig(ottoType, params, n8nType) {
  switch (ottoType) {
    case 'webhook_trigger':
      return {
        path: params?.path ?? params?.webhookPath ?? '',
        method: params?.httpMethod ?? params?.method ?? 'POST',
        responseMode: params?.responseMode === 'responseNode' ? 'accepted' : (params?.responseMode ?? 'accepted'),
        responseStatus: params?.responseCode ?? params?.responseStatusCode ?? 202,
        responseBody: stringifyBody(params?.responseData ?? params?.responseBody ?? { message: 'Accepted' }),
      };
    case 'form_trigger':
      return {
        path: params?.path ?? params?.formPath ?? params?.webhookPath ?? '',
        title: params?.formTitle ?? params?.title ?? params?.name ?? 'Imported Form',
        description: params?.formDescription ?? params?.description ?? '',
        fieldsJson: stringifyBody(params?.formFields?.values ?? params?.fields ?? []),
        submitLabel: params?.buttonLabel ?? params?.submitLabel ?? 'Submit',
        responseMessage: params?.responseMessage ?? params?.completionMessage ?? 'Submitted',
      };
    case 'chat_trigger':
      return {
        path: params?.path ?? params?.webhookPath ?? 'chat',
        sessionField: params?.sessionField ?? 'sessionId',
        messageField: params?.messageField ?? 'message',
        welcomeText: params?.initialMessages ?? params?.welcomeText ?? '',
        responseMessage: params?.responseMessage ?? 'Message accepted',
      };
    case 'schedule_trigger':
      return mapScheduleConfig(params);
    case 'http_request':
      return mapHttpRequestConfig(params);
    case 'llm_call':
      return mapLlmCallConfig(params, n8nType);
    case 'set':
      return mapSetConfig(params);
    case 'if':
      return mapIfConfig(params);
    case 'delay':
      return mapDelayConfig(params);
    case 'filter':
      return { conditions: extractConditions(params), combinator: params?.combinator ?? 'and' };
    case 'loop':
      return { over: 'input.items', limit: Number(params?.batchSize ?? 100) };
    case 'sub_workflow':
      return { workflowId: params?.workflowId ?? params?.workflow ?? '' };
    case 'send_email':
      return { to: params?.toEmail ?? params?.to ?? '', subject: params?.subject ?? '', body: params?.message ?? params?.text ?? '' };
    case 'postgres_query':
      return { query: params?.query ?? params?.sql ?? '', params: stringifyBody(params?.queryParams ?? []) || '[]' };
    case 'code':
      return mapCodeConfig(params, n8nType);
    case 'merge':
      return { mode: params?.mode ?? 'merge-object' };
    case 'read_file':
      return {
        path: params?.filePath ?? params?.path ?? '',
        binaryProperty: params?.dataPropertyName ?? params?.binaryPropertyName ?? 'data',
        mimeType: params?.mimeType ?? '',
      };
    case 'write_file':
      return {
        path: params?.fileName ?? params?.filePath ?? params?.path ?? '',
        binaryProperty: params?.dataPropertyName ?? params?.binaryPropertyName ?? 'data',
      };
    case 'move_binary_data':
      return {
        mode: ['binaryToJson', 'binary_to_json'].includes(params?.mode) ? 'binary_to_json' : 'json_to_binary',
        sourceField: params?.sourceKey ?? params?.sourceField ?? 'data',
        targetField: params?.destinationKey ?? params?.targetField ?? 'data',
        binaryProperty: params?.dataPropertyName ?? params?.binaryPropertyName ?? 'data',
        fileName: params?.fileName ?? 'data.txt',
        mimeType: params?.mimeType ?? 'text/plain',
        encoding: params?.encoding ?? 'utf8',
      };
    case 's3_object':
      return {
        operation: mapS3Operation(params?.operation ?? params?.action),
        credentialId: '',
        endpoint: params?.endpoint ?? '',
        region: params?.region ?? 'us-east-1',
        bucket: locatorValue(params?.bucketName ?? params?.bucket),
        key: locatorValue(params?.fileKey ?? params?.key ?? params?.path ?? params?.fileName),
        prefix: locatorValue(params?.prefix ?? params?.folderKey ?? ''),
        maxKeys: params?.maxKeys ?? 100,
        sourceMode: params?.binaryData === true || params?.inputDataFieldName ? 'binary' : 'text',
        value: params?.body ?? '',
        sourceField: params?.sourceField ?? 'data',
        binaryProperty: params?.inputDataFieldName ?? params?.dataPropertyName ?? params?.binaryPropertyName ?? 'data',
        fileName: params?.fileName ?? '',
        contentType: params?.contentType ?? 'application/octet-stream',
        forcePathStyle: 'true',
      };
    case 'slack_send_message':
      return {
        channel: params?.channel ?? params?.channelId ?? '',
        text: params?.text ?? params?.message ?? '',
        blocksJson: stringifyBody(params?.blocks ?? ''),
      };
    case 'discord_send_message':
      return {
        webhookUrl: params?.webhookUri ?? params?.webhookUrl ?? '',
        content: params?.text ?? params?.content ?? params?.message ?? '',
        username: params?.username ?? '',
        embedsJson: stringifyBody(params?.embeds ?? ''),
      };
    case 'telegram_send_message':
      return {
        chatId: params?.chatId ?? '',
        text: params?.text ?? params?.message ?? '',
        parseMode: params?.parseMode ?? '',
      };
    case 'github_api':
      return {
        method: 'GET',
        path: params?.url ?? (params?.resource ? `/${params.resource}` : '/user'),
        body: '{}',
      };
    case 'notion_api':
      return {
        method: 'GET',
        path: params?.resource ? `/${params.resource}` : '/users/me',
        body: '{}',
        notionVersion: '2022-06-28',
      };
    case 'airtable_records':
      return {
        operation: params?.operation ?? 'list',
        baseId: params?.baseId ?? '',
        tableName: params?.table ?? params?.tableId ?? '',
        recordId: params?.id ?? params?.recordId ?? '',
        fieldsJson: stringifyBody(params?.fields ?? {}),
      };
    case 'graphql_request':
      return {
        endpoint: params?.endpoint ?? params?.url ?? '',
        query: params?.query ?? '',
        variablesJson: stringifyBody(params?.variables ?? {}),
        authHeader: 'Authorization',
      };
    case 'datetime':
      return {
        operation: params?.operation ?? 'format',
        value: params?.value ?? params?.date ?? '{{ input.date }}',
        inputFormat: params?.inputFormat ?? 'auto',
        outputFormat: params?.outputFormat ?? 'iso',
        addAmount: params?.amount ?? 1,
        addUnit: params?.unit ?? 'days',
      };
    case 'crypto':
      return {
        operation: params?.operation ?? 'sha256',
        value: params?.value ?? '{{ input.value }}',
        secret: '',
        encoding: params?.encoding ?? 'hex',
      };
    case 'jwt':
      return {
        operation: params?.operation ?? 'decode',
        payload: stringifyBody(params?.payload ?? {}),
        token: params?.token ?? '{{ input.token }}',
        secret: '',
        algorithm: params?.algorithm ?? 'HS256',
      };
    case 'csv_parse':
      return {
        text: params?.data ?? params?.text ?? '',
        sourceField: params?.sourceField ?? params?.dataPropertyName ?? 'data',
        delimiter: params?.delimiter ?? params?.options?.delimiter ?? ',',
        hasHeader: String(params?.headerRow ?? params?.options?.headerRow ?? true),
        trim: 'true',
        columns: '',
      };
    case 'csv_stringify':
      return {
        value: '',
        sourceField: params?.sourceField ?? 'rows',
        delimiter: params?.delimiter ?? params?.options?.delimiter ?? ',',
        includeHeader: String(params?.includeHeader ?? params?.headerRow ?? true),
        columns: '',
      };
    case 'xml_parse':
      return {
        text: params?.data ?? params?.xml ?? '',
        sourceField: params?.sourceField ?? 'data',
      };
    case 'xml_stringify':
      return {
        value: '',
        sourceField: params?.sourceField ?? 'data',
        rootName: params?.rootName ?? 'root',
      };
    case 'html_extract':
      return {
        html: params?.html ?? '',
        sourceField: params?.sourceField ?? 'html',
        selector: params?.selector ?? params?.extractionValues?.values?.[0]?.key ?? 'title',
        attribute: params?.attribute ?? params?.returnValue ?? 'text',
        multiple: String(params?.returnArray ?? params?.multiple ?? true),
      };
    case 'json_transform':
      return {
        operation: 'get',
        value: '',
        sourceField: params?.sourceField ?? '',
        path: params?.field ?? params?.path ?? '',
        paths: '',
        setValue: '',
        space: 2,
      };
    case 'compression':
      return {
        operation: params?.operation ?? 'gzip',
        value: '',
        sourceField: params?.sourceField ?? 'data',
        inputEncoding: params?.inputEncoding ?? '',
        outputEncoding: params?.outputEncoding ?? '',
      };
    default:
      return {};
  }
}

function makeImportMeta(n8nNode, status, notes) {
  return {
    source: 'n8n',
    status,
    n8nId: n8nNode.id ?? null,
    n8nName: n8nNode.name ?? null,
    n8nType: n8nNode.type ?? null,
    typeVersion: n8nNode.typeVersion ?? null,
    credentials: n8nNode.credentials ?? {},
    notes,
    originalNode: n8nNode,
  };
}

function makeWorkflowNode(n8nNode, { type, status, notes, config }) {
  const pos = n8nNode.position ?? [0, 0];
  return {
    id: n8nNode.id ?? randomUUID(),
    type,
    name: n8nNode.name ?? type,
    position: { x: Number(pos[0] ?? 0), y: Number(pos[1] ?? 0) },
    disabled: Boolean(n8nNode.disabled),
    notes: typeof n8nNode.notes === 'string' ? n8nNode.notes : '',
    displayNote: Boolean(n8nNode.notesInFlow),
    continueOnError: Boolean(n8nNode.continueOnFail),
    retryOnFail: Boolean(n8nNode.retryOnFail),
    maxTries: Number.isFinite(Number(n8nNode.maxTries)) ? Number(n8nNode.maxTries) : 2,
    retryDelayMs: Number.isFinite(Number(n8nNode.waitBetweenTries)) ? Number(n8nNode.waitBetweenTries) : 1000,
    alwaysOutputData: Boolean(n8nNode.alwaysOutputData),
    config: {
      ...config,
      _ottoImport: makeImportMeta(n8nNode, status, notes),
    },
  };
}

function makeReportNode(n8nNode, ottoNode, status, notes) {
  return {
    id: ottoNode.id,
    name: n8nNode.name ?? ottoNode.name,
    n8nType: n8nNode.type ?? 'unknown',
    ottoType: ottoNode.type,
    status,
    notes,
  };
}

function mapNode(n8nNode) {
  const n8nType = n8nNode.type;
  const params = n8nNode.parameters ?? {};

  if (n8nType === STICKY_NOTE_TYPE) {
    const notes = ['Sticky notes are preserved as non-executable placeholder nodes until Otto has native notes.'];
    const node = makeWorkflowNode(n8nNode, {
      type: 'placeholder',
      status: 'unsupported',
      notes,
      config: { n8nOriginalType: n8nType, n8nOriginalConfig: params },
    });
    return { nodes: [node], reportNodes: [makeReportNode(n8nNode, node, 'unsupported', notes)] };
  }

  if (n8nType === SWITCH_TYPE) {
    const notes = ['Switch is approximated as a single IF node using the first mapped condition. Additional switch rules need manual rebuild.'];
    const node = makeWorkflowNode(n8nNode, {
      type: 'if',
      status: 'partial',
      notes,
      config: mapIfConfig(params),
    });
    return { nodes: [node], reportNodes: [makeReportNode(n8nNode, node, 'partial', notes)] };
  }

  if (n8nType === 'n8n-nodes-base.redis') {
    const mapped = mapRedisConfig(params);
    const node = makeWorkflowNode(n8nNode, mapped);
    return { nodes: [node], reportNodes: [makeReportNode(n8nNode, node, mapped.status, mapped.notes)] };
  }

  const transformSupport = mapTransformSupport(n8nType, params);
  if (transformSupport) {
    const node = makeWorkflowNode(n8nNode, transformSupport);
    return { nodes: [node], reportNodes: [makeReportNode(n8nNode, node, transformSupport.status, transformSupport.notes)] };
  }

  const support = SUPPORT[n8nType];
  if (!support) {
    const notes = ['No executable Otto mapping exists yet. The original n8n node config is preserved, but this node will fail until replaced.'];
    const node = makeWorkflowNode(n8nNode, {
      type: 'placeholder',
      status: 'placeholder',
      notes,
      config: { n8nOriginalType: n8nType, n8nOriginalConfig: params },
    });
    return { nodes: [node], reportNodes: [makeReportNode(n8nNode, node, 'placeholder', notes)] };
  }

  const node = makeWorkflowNode(n8nNode, {
    type: support.type,
    status: support.status,
    notes: support.notes,
    config: support.type === 'placeholder'
      ? { n8nOriginalType: n8nType, n8nOriginalConfig: params }
      : mapConfig(support.type, params, n8nType),
  });
  return { nodes: [node], reportNodes: [makeReportNode(n8nNode, node, support.status, support.notes)] };
}

function sourceHandleFor(sourceNode, outputIndex) {
  if (!sourceNode) return null;
  if (sourceNode.type === 'if') return outputIndex === '1' ? 'false' : 'true';
  if (sourceNode.type === 'loop') return outputIndex === '1' ? 'done' : 'loop';
  return null;
}

function targetHandleFor(targetNode, targetConnection) {
  if (!targetNode) return null;
  if (targetNode.type === 'merge') {
    const targetIndex = Number(targetConnection.index ?? 0);
    return `in${targetIndex + 1}`;
  }
  return null;
}

function mapEdges(n8nConnections, nodeIdMap, nodeByName) {
  const edges = [];
  const warnings = [];
  const unsupportedConnections = [];

  for (const [sourceName, outputs] of Object.entries(n8nConnections ?? {})) {
    const sourceId = nodeIdMap[sourceName];
    if (!sourceId) {
      warnings.push(`Connection source "${sourceName}" was not found in imported nodes.`);
      continue;
    }

    for (const connectionType of Object.keys(outputs ?? {})) {
      if (connectionType !== 'main') {
        unsupportedConnections.push({ sourceName, connectionType });
        warnings.push(`Connection type "${connectionType}" from "${sourceName}" is not supported yet and was not imported.`);
      }
    }

    for (const [outputIndex, targets] of Object.entries(outputs?.main ?? {})) {
      for (const target of (targets ?? [])) {
        const targetId = nodeIdMap[target.node];
        if (!targetId) {
          warnings.push(`Connection target "${target.node}" from "${sourceName}" was not found in imported nodes.`);
          continue;
        }
        edges.push({
          id: randomUUID(),
          source: sourceId,
          target: targetId,
          sourceHandle: sourceHandleFor(nodeByName[sourceName], String(outputIndex)),
          targetHandle: targetHandleFor(nodeByName[target.node], target),
        });
      }
    }
  }

  return { edges, warnings, unsupportedConnections };
}

function summarize(reportNodes, unsupportedConnections) {
  const summary = { exact: 0, partial: 0, placeholder: 0, unsupported: 0 };
  for (const node of reportNodes) {
    summary[node.status] = (summary[node.status] ?? 0) + 1;
  }
  summary.unsupported += unsupportedConnections.length;
  return summary;
}

function warningsFromReport(reportNodes, edgeWarnings) {
  const nodeWarnings = reportNodes
    .filter((node) => node.status !== 'exact')
    .map((node) => `Node "${node.name}" (${node.n8nType}) imported as ${node.status}${node.ottoType ? ` -> ${node.ottoType}` : ''}: ${node.notes.join(' ')}`);
  return [...nodeWarnings, ...edgeWarnings];
}

export function importN8n(n8nJson) {
  const raw = typeof n8nJson === 'string' ? JSON.parse(n8nJson) : n8nJson;
  const workflow = raw.workflow ?? raw;
  const n8nNodes = workflow.nodes ?? [];
  const n8nConnections = workflow.connections ?? {};

  if (!Array.isArray(n8nNodes)) {
    throw new Error('n8n export must contain a nodes array');
  }

  const nodes = [];
  const reportNodes = [];
  const nodeIdMap = {};
  const nodeByName = {};

  for (const n8nNode of n8nNodes) {
    const mapped = mapNode(n8nNode);
    for (const node of mapped.nodes) {
      nodes.push(node);
      nodeIdMap[n8nNode.name] = node.id;
      nodeByName[n8nNode.name] = node;
    }
    reportNodes.push(...mapped.reportNodes);
  }

  const edgeResult = mapEdges(n8nConnections, nodeIdMap, nodeByName);
  const report = {
    source: 'n8n',
    workflowName: workflow.name ?? raw.name ?? null,
    summary: summarize(reportNodes, edgeResult.unsupportedConnections),
    nodes: reportNodes,
    warnings: [],
    unsupportedConnections: edgeResult.unsupportedConnections,
  };
  report.warnings = warningsFromReport(reportNodes, edgeResult.warnings);

  const definition = {
    nodes,
    edges: edgeResult.edges,
    importReport: report,
  };

  return {
    ...definition,
    definition,
    report,
    warnings: report.warnings,
  };
}
