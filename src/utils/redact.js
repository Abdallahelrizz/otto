const SENSITIVE_KEYS = new Set([
  'password', 'token', 'apiKey', 'api_key', 'secret', 'secretKey', 'secret_key',
  'accessToken', 'access_token', 'refreshToken', 'refresh_token',
  'privateKey', 'private_key', 'clientSecret', 'client_secret',
  'webhookUrl', 'webhook_url', 'botToken', 'bot_token',
  'connectionString', 'connection_string', 'Authorization', 'authorization',
]);

const REDACTED = '[REDACTED]';

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
