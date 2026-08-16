import { safeFetch } from '../utils/safe-fetch.js';
import { safeUrlLabel } from '../utils/redact.js';

const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const SENSITIVE_RESPONSE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'set-cookie',
  'www-authenticate',
  'proxy-authenticate',
]);

/** Reject a declared Content-Length above the caller's cap; streamed bytes are checked separately. */
export function assertWithinCap(contentLength, maxBytes) {
  if (!maxBytes) return;
  const len = Number(contentLength);
  if (Number.isFinite(len) && len > maxBytes) {
    const err = new Error(`Response too large: ${len} bytes exceeds cap of ${maxBytes}`);
    err.code = 'RESPONSE_TOO_LARGE';
    throw err;
  }
}

export function credentialValue(credential, keys = ['value', 'token', 'apiKey']) {
  for (const key of keys) {
    if (credential?.data?.[key]) return credential.data[key];
  }
  return null;
}

export function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    throw new Error('Expected valid JSON');
  }
}

async function readTextWithinCap(response, maxBytes) {
  assertWithinCap(response.headers.get('content-length'), maxBytes);
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
      // SECURITY: Content-Length is optional/untrusted; cap streamed bytes too.
      const err = new Error(`Response too large: streamed body exceeds cap of ${maxBytes}`);
      err.code = 'RESPONSE_TOO_LARGE';
      throw err;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

function responseHeaders(response) {
  return Object.fromEntries([...response.headers.entries()].map(([key, value]) => [
    key,
    // SECURITY: response auth/cookie challenges may contain credentials and outputs are persisted.
    SENSITIVE_RESPONSE_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value,
  ]));
}

async function _jsonFromResponse(response, maxBytes) {
  const text = await readTextWithinCap(response, maxBytes);
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep plain-text response bodies.
  }
  if (!response.ok) {
    // SECURITY: provider-controlled error text can echo tokens or signed URLs into persisted errors.
    const err = new Error(`HTTP ${response.status}`);
    err.statusCode = response.status;
    err.body = body;
    throw err;
  }
  return { statusCode: response.status, headers: responseHeaders(response), body };
}

// All outbound integration calls go through safeFetch (SSRF-guarded).
// Legitimate public APIs (slack.com, stripe.com, …) resolve to public IPs and
// pass; only private/reserved targets are blocked. Self-hosters that need
// internal calls set SSRF_ALLOW_PRIVATE=true. requestJson and safeRequestJson
// are intentionally identical so no call site can accidentally skip the guard.
//
// Cancellation: `options.signal` needs no special handling here — it falls into
// `fetchOptions` and reaches `fetch` via safeFetch (which also preserves it across
// redirect hops). Callers pass `signal` from their handler params. Do not "fix"
// the apparent absence of `signal` in this file; the pass-through is deliberate.
export async function requestJson(url, options = {}) {
  const { maxBytes = DEFAULT_MAX_RESPONSE_BYTES, ...fetchOptions } = options;
  let response;
  try {
    response = await safeFetch(url, fetchOptions);
  } catch (err) {
    if (fetchOptions.signal?.aborted) throw err;
    // SECURITY: fetch errors often include the full URL, including path/query
    // credentials, and node errors are persisted + streamed. Keep the ORIGIN and the
    // underlying reason so the failure is still diagnosable — a bare "network request
    // failed" tells the user nothing. `cause` is not enough: the executor persists
    // only `err.message`.
    const reason = err instanceof Error ? (err.cause?.code ?? err.code ?? err.message) : String(err);
    const safeError = new Error(`Request to ${safeUrlLabel(url)} failed: ${reason}`);
    safeError.cause = err;
    throw safeError;
  }
  return _jsonFromResponse(response, maxBytes);
}

export const safeRequestJson = requestJson;

export function bearerHeaders(token, extra = {}) {
  if (!token) throw new Error('API token is required');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export function urlJoin(base, path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/$/, '')}/${String(path ?? '').replace(/^\//, '')}`;
}
