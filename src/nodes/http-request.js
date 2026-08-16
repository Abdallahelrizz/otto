import { safeFetch } from '../utils/safe-fetch.js';
import { safeUrlLabel } from '../utils/redact.js';

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const SENSITIVE_RESPONSE_HEADERS = new Set(['authorization', 'proxy-authorization', 'set-cookie', 'www-authenticate', 'proxy-authenticate']);

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
    try {
      response = await safeFetch(url, {
        method: methodUpper,
        headers: reqHeaders,
        body: bodyStr,
        signal: reqSignal,
      });
    } catch (err) {
      if (reqSignal.aborted) throw err;
      // SECURITY: fetch errors can contain a full URL with query/path credentials, and
      // node errors are persisted + streamed over SSE. Keep the ORIGIN (which a user
      // needs to tell a typo'd host from a refused connection) and the underlying
      // reason, but never the path or query. `cause` alone is not enough — the executor
      // only persists `err.message`.
      const reason = err instanceof Error ? (err.cause?.code ?? err.code ?? err.message) : String(err);
      const safeError = new Error(
        `HTTP Request failed for ${safeUrlLabel(url)}: ${reason}`
      );
      safeError.cause = err;
      throw safeError;
    }
  } finally {
    clearTimeout(timer);
  }

  const responseText = await readTextWithinCap(response, MAX_RESPONSE_BYTES);
  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    // SECURITY: URLs may contain query/path credentials, so never persist them in errors.
    const err = new Error(`HTTP Request failed with status ${response.status}`);
    err.statusCode = response.status;
    err.body = responseBody;
    throw err;
  }

  return {
    statusCode: response.status,
    // SECURITY: response cookies/auth challenges are secrets and node output is persisted.
    headers: Object.fromEntries([...response.headers.entries()].map(([key, value]) => [
      key,
      SENSITIVE_RESPONSE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value,
    ])),
    body: responseBody,
  };
}

async function readTextWithinCap(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error(`HTTP Request response exceeds ${maxBytes} bytes`);
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      // SECURITY: enforce the cap even for chunked responses with no Content-Length.
      throw new Error(`HTTP Request response exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
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
