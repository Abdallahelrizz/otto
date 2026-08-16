import { safeFetch } from '../utils/safe-fetch.js';

export async function httpRequest({ input, config, credential, signal }) {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeout = 30_000,
    authType = 'none',
    authKey,
    authValue,
    authUsername,
    authPassword,
  } = config;

  if (!url) throw new Error('HTTP Request node: url is required');

  const reqHeaders = normalizeHeaders(headers);

  if (credential) {
    if (credential.type === 'api_key') {
      const { header = 'Authorization', value } = credential.data;
      reqHeaders[header] = value;
    } else if (credential.type === 'bearer_token') {
      reqHeaders['Authorization'] = `Bearer ${credential.data.value}`;
    } else if (credential.type === 'basic' || credential.type === 'basic_auth') {
      const { username, password } = credential.data;
      reqHeaders['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    }
  } else if (authType === 'api_key' && authKey && authValue) {
    reqHeaders[authKey] = authValue;
  } else if (authType === 'bearer' && authValue) {
    reqHeaders['Authorization'] = String(authValue).startsWith('Bearer ')
      ? String(authValue)
      : `Bearer ${authValue}`;
  } else if (authType === 'basic' && authUsername && authPassword) {
    reqHeaders['Authorization'] = 'Basic ' + Buffer.from(`${authUsername}:${authPassword}`).toString('base64');
  }

  const methodUpper = method.toUpperCase();
  let bodyStr;
  if (body !== undefined && body !== null && !['GET', 'HEAD'].includes(methodUpper)) {
    if (typeof body === 'object' && Object.keys(body).length > 0) {
      bodyStr = JSON.stringify(body);
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] ?? 'application/json';
    } else if (typeof body === 'string' && body.trim()) {
      bodyStr = body;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // Combine, don't replace: the request must abort on EITHER its own timeout OR
  // the execution being cancelled. Dropping one to honour the other would either
  // break per-request timeouts or leave the call running after cancel.
  const reqSignal = signal
    ? AbortSignal.any([controller.signal, signal])
    : controller.signal;

  let response;
  try {
    response = await safeFetch(url, {
      method: methodUpper,
      headers: reqHeaders,
      body: bodyStr,
      signal: reqSignal,
    });
  } finally {
    clearTimeout(timer);
  }

  const responseText = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} from ${url}`);
    err.statusCode = response.status;
    err.body = responseBody;
    throw err;
  }

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody,
  };
}

function normalizeHeaders(headers) {
  if (Array.isArray(headers)) {
    return Object.fromEntries(
      headers
        .map((header) => [header.key ?? header.name ?? '', header.value ?? ''])
        .filter(([key]) => key)
    );
  }
  if (headers && typeof headers === 'object') return { ...headers };
  return {};
}
