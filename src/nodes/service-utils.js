import { safeFetch } from '../utils/safe-fetch.js';

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

async function _jsonFromResponse(response) {
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep plain-text response bodies.
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body?.error
      ? body.error.message ?? body.error
      : `HTTP ${response.status}`;
    const err = new Error(String(message));
    err.statusCode = response.status;
    err.body = body;
    throw err;
  }
  return { statusCode: response.status, headers: Object.fromEntries(response.headers.entries()), body };
}

export async function requestJson(url, options = {}) {
  return _jsonFromResponse(await fetch(url, options));
}

export async function safeRequestJson(url, options = {}) {
  return _jsonFromResponse(await safeFetch(url, options));
}

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
