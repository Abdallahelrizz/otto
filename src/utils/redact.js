const SENSITIVE_KEYS = new Set([
  'password', 'token', 'apiKey', 'api_key', 'secret', 'secretKey', 'secret_key',
  'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'privateKey', 'private_key', 'clientSecret', 'client_secret',
  'webhookUrl', 'webhook_url', 'botToken', 'bot_token',
  'connectionString', 'connection_string', 'Authorization', 'authorization',
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
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) {
      if (typeof v === 'string' && v.length >= 6) out.push(v);
    }
  }
  return out;
}

export function redactObject(obj, depth = 0) {
  if (depth > 8) return obj;
  if (obj == null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => redactObject(item, depth + 1));

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key)) {
      result[key] = value ? REDACTED : value;
    } else {
      result[key] = redactObject(value, depth + 1);
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
