import { getByPath } from '../utils/path.js';

export function resolveValue(value, context) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*(.+?)\s*\}\}/g, (_, path) => {
    const resolved = getByPath(context, path);
    return resolved === undefined ? '' : String(resolved);
  });
}

export function resolveConfig(config, context) {
  if (!config || typeof config !== 'object') return config;
  const out = {};
  for (const [key, val] of Object.entries(config)) {
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      out[key] = resolveConfig(val, context);
    } else if (Array.isArray(val)) {
      // Recurse into object elements (e.g. assignment arrays: [{ key, value }])
      out[key] = val.map(v =>
        (typeof v === 'object' && v !== null) ? resolveConfig(v, context) : resolveValue(v, context)
      );
    } else {
      out[key] = resolveValue(val, context);
    }
  }
  return out;
}
