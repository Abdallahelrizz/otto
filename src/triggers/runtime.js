const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const ANY_METHOD = 'ANY';

export function normalizeTriggerPath(path) {
  const normalized = String(path ?? '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  if (!normalized) throw new Error('Trigger path is required');
  if (normalized.includes('/')) throw new Error('Trigger path must be a single URL segment');
  return normalized;
}

export function normalizeHttpMethod(method, fallback = 'POST') {
  const value = String(method ?? fallback).trim().toUpperCase();
  if (value === ANY_METHOD) return ANY_METHOD;
  return HTTP_METHODS.has(value) ? value : fallback;
}

export function methodMatches(configMethod, requestMethod) {
  const wanted = normalizeHttpMethod(configMethod, ANY_METHOD);
  if (wanted === ANY_METHOD) return true;
  return wanted === normalizeHttpMethod(requestMethod, 'POST');
}

export function parseJsonConfig(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  return JSON.parse(value);
}

export function parseFormFields(value) {
  const parsed = parseJsonConfig(value, []);
  if (!Array.isArray(parsed)) throw new Error('Form fields must be a JSON array');

  return parsed.map((field, index) => {
    if (!field || typeof field !== 'object') {
      throw new Error(`Form field ${index + 1} must be an object`);
    }
    const name = String(field.name ?? field.key ?? '').trim();
    if (!name) throw new Error(`Form field ${index + 1} needs a name`);
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
      throw new Error(`Form field "${name}" has an invalid name`);
    }

    const type = String(field.type ?? 'text').trim().toLowerCase();
    const allowedTypes = new Set(['text', 'email', 'number', 'textarea', 'select', 'checkbox']);
    return {
      name,
      label: String(field.label ?? name),
      type: allowedTypes.has(type) ? type : 'text',
      required: Boolean(field.required),
      options: normalizeOptions(field.options),
      placeholder: String(field.placeholder ?? ''),
    };
  });
}

export function validateFormFields(value) {
  try {
    parseFormFields(value);
    return [];
  } catch (err) {
    return [err.message];
  }
}

function normalizeOptions(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

export function buildTriggerInput({ req, triggerType, workflowId, node, path, mode, payload }) {
  return {
    body: payload ?? req.body ?? {},
    headers: req.headers ?? {},
    query: req.query ?? {},
    method: req.method,
    path,
    trigger: {
      type: triggerType,
      mode,
      workflowId,
      nodeId: node.id,
      nodeName: node.name ?? null,
      receivedAt: new Date().toISOString(),
    },
  };
}

export function buildFormInput({ req, workflowId, node, path, mode }) {
  const submission = req.body && typeof req.body === 'object' ? req.body : {};
  const fields = parseFormFields(node.config?.fieldsJson ?? node.config?.fields ?? []);
  return {
    ...buildTriggerInput({ req, triggerType: 'form', workflowId, node, path, mode, payload: submission }),
    form: {
      path,
      title: node.config?.title ?? node.name ?? 'Form',
      fields,
    },
    submission,
  };
}

export function buildChatInput({ req, workflowId, node, path, mode }) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sessionField = String(node.config?.sessionField ?? 'sessionId');
  const messageField = String(node.config?.messageField ?? 'message');
  const sessionId = body[sessionField] ?? body.sessionId ?? req.query?.sessionId ?? 'default';
  const message = body[messageField] ?? body.message ?? '';
  const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

  return {
    ...buildTriggerInput({ req, triggerType: 'chat', workflowId, node, path, mode, payload: body }),
    chat: { path, sessionId, message, metadata },
    sessionId,
    message,
    metadata,
  };
}

export function webhookResponse(config, { workflowId, executionId }) {
  const responseMode = config?.responseMode ?? 'accepted';
  if (responseMode === 'custom') {
    const statusCode = Number(config?.responseStatus ?? 200);
    return {
      statusCode: Number.isFinite(statusCode) ? statusCode : 200,
      body: parseResponseBody(config?.responseBody, { ok: true, workflowId, executionId }),
    };
  }
  if (responseMode === 'empty') {
    return { statusCode: 204, body: null };
  }
  return {
    statusCode: 202,
    body: { message: 'Accepted', workflowId, executionId },
  };
}

export function formResponse(config, { workflowId, executionId }) {
  const message = String(config?.responseMessage ?? 'Submitted');
  return {
    statusCode: 202,
    body: { message, workflowId, executionId },
    html: htmlPage(message, `<p>${escapeHtml(message)}</p>`),
  };
}

export function chatResponse(config, { workflowId, executionId, sessionId }) {
  const message = String(config?.responseMessage ?? 'Message accepted');
  return {
    statusCode: 202,
    body: { message, workflowId, executionId, sessionId },
  };
}

function parseResponseBody(value, fallback) {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function renderFormHtml(config, { action }) {
  const fields = parseFormFields(config?.fieldsJson ?? config?.fields ?? []);
  const title = escapeHtml(config?.title ?? 'Otto Form');
  const description = escapeHtml(config?.description ?? '');
  const submitLabel = escapeHtml(config?.submitLabel ?? 'Submit');
  const fieldHtml = fields.map(renderField).join('\n');

  return htmlPage(title, `
    ${description ? `<p>${description}</p>` : ''}
    <form method="POST" action="${escapeAttribute(action)}">
      ${fieldHtml}
      <button type="submit">${submitLabel}</button>
    </form>
  `);
}

function renderField(field) {
  const id = `field-${field.name}`;
  const required = field.required ? ' required' : '';
  const placeholder = field.placeholder ? ` placeholder="${escapeAttribute(field.placeholder)}"` : '';
  const name = escapeAttribute(field.name);
  const label = escapeHtml(field.label);

  if (field.type === 'textarea') {
    return `<label for="${id}">${label}</label><textarea id="${id}" name="${name}"${required}${placeholder}></textarea>`;
  }

  if (field.type === 'select') {
    const options = field.options.map((option) => `<option value="${escapeAttribute(option)}">${escapeHtml(option)}</option>`).join('');
    return `<label for="${id}">${label}</label><select id="${id}" name="${name}"${required}>${options}</select>`;
  }

  if (field.type === 'checkbox') {
    return `<label><input type="checkbox" name="${name}" value="true"${required}> ${label}</label>`;
  }

  return `<label for="${id}">${label}</label><input id="${id}" type="${field.type}" name="${name}"${required}${placeholder}>`;
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111113; color: #fafafa; }
    main { width: min(520px, calc(100vw - 32px)); }
    form { display: grid; gap: 14px; }
    label { display: grid; gap: 6px; font-size: 13px; color: #d4d4d8; }
    input, textarea, select { width: 100%; box-sizing: border-box; border: 1px solid #3f3f46; border-radius: 6px; padding: 10px 12px; background: #18181b; color: #fafafa; font: inherit; }
    textarea { min-height: 96px; resize: vertical; }
    button { border: 0; border-radius: 6px; padding: 11px 14px; background: #ff6f1a; color: #111113; font-weight: 800; cursor: pointer; }
    p { color: #a1a1aa; line-height: 1.5; }
  </style>
</head>
<body><main><h1>${escapeHtml(title)}</h1>${body}</main></body>
</html>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}
