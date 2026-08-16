// src/nodes/services/_validate.js
const AUTH_KINDS = new Set(['bearer', 'header', 'basic', 'query', 'path', 'oauth2']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

function validateFixedBase(base, where) {
  if (typeof base !== 'string') throw new Error(`${where}: "base" must be a string`);
  if (/[{}]/.test(base)) throw new Error(`${where}: "base" must not contain templates`);
  let url;
  try { url = new URL(base); } catch { throw new Error(`${where}: invalid "base" URL`); }
  // WHAT was wrong: a descriptor could target plaintext HTTP or embed credentials in its base URL.
  if (url.protocol !== 'https:') throw new Error(`${where}: "base" must use https`);
  if (url.username || url.password) throw new Error(`${where}: "base" must not contain credentials`);
  if (url.search || url.hash) throw new Error(`${where}: "base" must not contain query or fragment data`);
}

/** Throw a descriptive Error if the descriptor is malformed. Called at load time. */
export function validateDescriptor(d) {
  const where = d?.type ? `descriptor "${d.type}"` : 'descriptor';
  if (!d || typeof d !== 'object') throw new Error('Service descriptor must be an object');
  if (!d.type || typeof d.type !== 'string') throw new Error(`${where}: missing string "type"`);
  if (!d.base && !d.baseFrom) throw new Error(`${where}: needs "base" or "baseFrom"`);
  if (d.base && d.baseFrom) throw new Error(`${where}: cannot define both "base" and "baseFrom"`);
  if (d.base) validateFixedBase(d.base, where);
  if (d.baseFrom && (typeof d.baseFrom !== 'string' || !/^\w+$/.test(d.baseFrom))) {
    throw new Error(`${where}: "baseFrom" must be a config field name`);
  }
  if (!d.auth || !AUTH_KINDS.has(d.auth.kind)) {
    throw new Error(`${where}: invalid auth.kind (got ${d.auth?.kind})`);
  }
  if (d.auth.kind === 'header' && d.auth.header != null
    && (typeof d.auth.header !== 'string' || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(d.auth.header))) {
    throw new Error(`${where}: auth.header is not a valid HTTP header name`);
  }
  if (['query', 'path'].includes(d.auth.kind) && d.auth.param != null
    && (typeof d.auth.param !== 'string' || !/^\w+$/.test(d.auth.param))) {
    throw new Error(`${where}: auth.param must be a field name`);
  }
  const ops = d.operations && Object.entries(d.operations);
  if (!ops || ops.length === 0) throw new Error(`${where}: needs at least one operation`);
  if (d.defaultOperation != null && !Object.hasOwn(d.operations, d.defaultOperation)) {
    throw new Error(`${where}: defaultOperation does not name an operation`);
  }
  for (const [name, op] of ops) {
    if (!op || typeof op !== 'object') throw new Error(`${where}: operation "${name}" must be an object`);
    if (typeof op.method !== 'string' || !HTTP_METHODS.has(op.method)) {
      throw new Error(`${where}: operation "${name}" has invalid method`);
    }
    if (typeof op.path !== 'string' || !op.path) throw new Error(`${where}: operation "${name}" missing path`);
    // WHAT was wrong: urlJoin accepts absolute URLs, so a hostile descriptor path could replace the validated base host.
    if (!op.path.startsWith('/') || op.path.startsWith('//') || op.path.includes('\\') || /[\r\n]/.test(op.path)) {
      throw new Error(`${where}: operation "${name}" path must be an absolute-path reference on the base host`);
    }
    if (d.auth.kind === 'path' && !op.path.includes(`{${d.auth.param || 'token'}}`)) {
      // WHAT was wrong: path auth could validate even though no operation path consumed the credential.
      throw new Error(`${where}: operation "${name}" path is missing its auth placeholder`);
    }
    for (const [key, value] of [['timeoutMs', op.timeoutMs], ['maxBytes', op.maxBytes]]) {
      if (value != null && (!Number.isSafeInteger(value) || value <= 0)) {
        throw new Error(`${where}: operation "${name}" ${key} must be a positive integer`);
      }
    }
  }
}
