const SENSITIVE_KEYS = new Set([
  'password', 'token', 'apikey', 'secret', 'secretkey',
  'accesstoken', 'refreshtoken', 'privatekey', 'clientsecret',
  'webhookurl', 'bottoken', 'connectionstring', 'authorization',
]);

const REDACTED = '[REDACTED]';

// Scrub secrets from free text (error messages, logs). Targets credentials
// embedded in URLs, bearer tokens, and common provider key formats. Optionally
// redacts caller-supplied exact secret values (e.g. the node's credential data).
const SECRET_PATTERNS = [
  /(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^/\s@]+@/gi, // scheme://user:pass@host
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,             // Bearer <token>
  /\bsk-[A-Za-z0-9_-]{12,}/g,                         // OpenAI-style
  /\bsk-ant-[A-Za-z0-9_-]{12,}/g,                     // Anthropic
  /\bxox[baprs]-[A-Za-z0-9-]{8,}/g,                   // Slack
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,                    // GitHub
  /\bAKIA[0-9A-Z]{16}/g,                              // AWS access key id
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/g, // JWT
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
  /([?&](?:access_token|api_key|apikey|auth|key|secret|token)=)[^&#\s]*/gi,
];

export function redactString(str, extraSecrets = []) {
  if (str == null) return str;
  let out = String(str);
  for (const secret of extraSecrets) {
    if (secret && typeof secret === 'string' && secret.length >= 6) {
      out = out.split(secret).join(REDACTED);
    }
  }
  out = out.replace(SECRET_PATTERNS[0], '$1[REDACTED]@');
  for (const re of SECRET_PATTERNS.slice(1)) out = out.replace(re, REDACTED);
  return out;
}

// Collect string secret values from a credential's decrypted data, for redaction.
export function credentialSecrets(credential) {
  const out = [];
  const data = credential?.data;
  const seen = new WeakSet();
  function collect(value) {
    if (typeof value === 'string') {
      if (value.length >= 6) out.push(value);
      return;
    }
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    // Nested credential objects, arrays, and Maps previously escaped exact-value redaction.
    const values = value instanceof Map ? value.values() : Object.values(value);
    for (const nested of values) collect(nested);
  }
  collect(data);
  return out;
}

export function redactObject(obj, depth = 0, seen = new WeakMap()) {
  // Primitive string values previously bypassed the free-text scrubber entirely.
  if (typeof obj === 'string') return redactString(obj);
  if (obj == null || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return seen.get(obj);
  if (Array.isArray(obj)) {
    const result = [];
    seen.set(obj, result);
    for (const item of obj) result.push(redactObject(item, depth + 1, seen));
    return result;
  }
  if (obj instanceof Map) {
    const result = new Map();
    seen.set(obj, result);
    for (const [key, value] of obj) {
      const normalized = String(key).toLowerCase().replace(/[_-]/g, '');
      result.set(key, SENSITIVE_KEYS.has(normalized) ? (value ? REDACTED : value) : redactObject(value, depth + 1, seen));
    }
    return result;
  }

  const result = {};
  seen.set(obj, result);
  for (const [key, value] of Object.entries(obj)) {
    // Exact matching was case-sensitive and missed common separator variants.
    const normalized = key.toLowerCase().replace(/[_-]/g, '');
    if (SENSITIVE_KEYS.has(normalized)) {
      result[key] = value ? REDACTED : value;
    } else {
      // The old depth-8 cutoff returned the original secret-bearing subtree unchanged.
      result[key] = redactObject(value, depth + 1, seen);
    }
  }
  return result;
}

/**
 * A URL safe to put in an error message: scheme + host + port only.
 *
 * Node errors are persisted to `node_executions` and streamed over SSE, so a raw URL
 * in an error can leak a credential carried in the path or query (`?token=…`,
 * `/webhook/<secret>`). But dropping the URL entirely — as an earlier fix did — left
 * users with a bare "network request failed" and no way to tell a typo'd host from a
 * refused connection.
 *
 * The origin is the part that essentially never carries a secret and is exactly what a
 * user needs to debug. Returns a placeholder rather than throwing on unparseable input.
 */
export function safeUrlLabel(url) {
  try {
    const u = new URL(String(url));
    // Credentials can also be embedded as user:pass@host — drop those too.
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(invalid URL)';
  }
}
