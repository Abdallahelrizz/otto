// src/nodes/services/_interpolate.js
// Pure interpolation helpers for declarative service descriptors.
// `{key}` references a value in the node's resolved config. Path/query values are
// URL-encoded; body values preserve type for whole-value placeholders.

const WHOLE = /^\{(\w+)\}$/;        // value is exactly "{key}"
const TOKEN = /\{(\w+)\}/g;         // any "{key}" occurrence

/** Interpolate a path template, URL-encoding every substituted value. */
export function fillPath(template, config) {
  return String(template).replace(TOKEN, (_m, key) =>
    encodeURIComponent(config[key] == null ? '' : String(config[key]))
  );
}

/** Build a URL-encoded query string from a {key: template} object; skip null/undefined. */
export function buildQuery(queryTemplate, config) {
  const params = new URLSearchParams();
  for (const [name, template] of Object.entries(queryTemplate ?? {})) {
    const m = String(template).match(WHOLE);
    const value = m ? config[m[1]] : String(template).replace(TOKEN, (_x, k) => config[k] ?? '');
    if (value == null || value === '') continue;
    params.append(name, String(value));
  }
  return params.toString();
}

/** Build a request body object; whole-value placeholders keep their type, others stringify. */
export function fillBody(bodyTemplate, config) {
  const out = {};
  for (const [name, template] of Object.entries(bodyTemplate ?? {})) {
    if (typeof template === 'string') {
      const m = template.match(WHOLE);
      if (m) {
        if (config[m[1]] === undefined) continue;   // omit unset whole-value fields
        out[name] = config[m[1]];
      } else {
        out[name] = template.replace(TOKEN, (_x, k) => config[k] ?? '');
      }
    } else {
      out[name] = template;                          // literal (number/bool/object)
    }
  }
  return out;
}
