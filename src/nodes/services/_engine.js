// src/nodes/services/_engine.js
import { credentialValue, safeRequestJson, urlJoin } from '../service-utils.js';
import { fillPath, buildQuery, fillBody } from './_interpolate.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function resolveBase(descriptor, config) {
  if (descriptor.base) return descriptor.base;
  const raw = config[descriptor.baseFrom];
  if (!raw) throw new Error(`${descriptor.type}: missing base value "${descriptor.baseFrom}"`);
  let url;
  try { url = new URL(String(raw)); } catch { throw new Error(`${descriptor.type}: invalid base URL`); }
  if (url.protocol !== 'https:') throw new Error(`${descriptor.type}: base must be https`);
  return url.origin;
}

function applyAuth(descriptor, config, token, headers, params) {
  const kind = descriptor.auth.kind;
  if (!token && kind !== 'oauth2') throw new Error(`${descriptor.type}: credential is required`);
  switch (kind) {
    case 'bearer': headers.Authorization = `Bearer ${token}`; break;
    case 'header': headers[descriptor.auth.header || 'Authorization'] = token; break;
    case 'basic': headers.Authorization = `Basic ${Buffer.from(token).toString('base64')}`; break;
    case 'query': params.set(descriptor.auth.param || 'api_key', token); break;
    case 'path': /* token injected via the operation path template (see descriptor) */ break;
    default: throw new Error(`${descriptor.type}: auth.kind "${kind}" not supported in this batch`);
  }
}

/**
 * Build a node handler from a descriptor. `deps.request` defaults to the
 * SSRF-guarded safeRequestJson and is injectable for tests.
 */
export function makeServiceHandler(descriptor, { request = safeRequestJson } = {}) {
  return async function serviceHandler({ config = {}, credential } = {}) {
    const opName = config.operation || descriptor.defaultOperation;
    const op = descriptor.operations[opName];
    if (!op) throw new Error(`${descriptor.type}: unknown operation "${opName}"`);

    for (const field of op.fields ?? []) {
      if (field.required && (config[field.key] == null || config[field.key] === '')) {
        throw new Error(`${descriptor.type}.${opName}: missing required field "${field.key}"`);
      }
    }

    const base = resolveBase(descriptor, config);
    const overrideField = descriptor.credential?.overrideField;
    const override = overrideField ? config[overrideField] : undefined;
    const token = override || credentialValue(credential, descriptor.credential?.keys ?? ['token', 'value', 'apiKey']);

    const headers = { ...(descriptor.auth.headers ?? {}) };
    const queryParams = new URLSearchParams(buildQuery(op.query, config));
    applyAuth(descriptor, config, token, headers, queryParams);

    let url = urlJoin(base, fillPath(op.path, config));
    const qs = queryParams.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;

    let body;
    if (op.body && op.method !== 'GET') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
      body = JSON.stringify(fillBody(op.body, config));
    }

    return request(url, {
      method: op.method,
      headers,
      body,
      signal: AbortSignal.timeout(op.timeoutMs || DEFAULT_TIMEOUT_MS),
      maxBytes: op.maxBytes || DEFAULT_MAX_BYTES,
    });
  };
}
