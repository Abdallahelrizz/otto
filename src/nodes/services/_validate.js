// src/nodes/services/_validate.js
const AUTH_KINDS = new Set(['bearer', 'header', 'basic', 'query', 'path', 'oauth2']);

/** Throw a descriptive Error if the descriptor is malformed. Called at load time. */
export function validateDescriptor(d) {
  const where = d?.type ? `descriptor "${d.type}"` : 'descriptor';
  if (!d || typeof d !== 'object') throw new Error('Service descriptor must be an object');
  if (!d.type || typeof d.type !== 'string') throw new Error(`${where}: missing string "type"`);
  if (!d.base && !d.baseFrom) throw new Error(`${where}: needs "base" or "baseFrom"`);
  if (!d.auth || !AUTH_KINDS.has(d.auth.kind)) {
    throw new Error(`${where}: invalid auth.kind (got ${d.auth?.kind})`);
  }
  const ops = d.operations && Object.entries(d.operations);
  if (!ops || ops.length === 0) throw new Error(`${where}: needs at least one operation`);
  for (const [name, op] of ops) {
    if (!op.method) throw new Error(`${where}: operation "${name}" missing method`);
    if (!op.path) throw new Error(`${where}: operation "${name}" missing path`);
  }
}
