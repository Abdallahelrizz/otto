/**
 * HTTP Request node — calls any REST API.
 *
 * Config:
 *   url:     string (required, supports {{ }} expressions)
 *   method:  GET | POST | PUT | PATCH | DELETE  (default: GET)
 *   headers: object
 *   body:    object | string  (sent as JSON if object)
 *   timeout: number (ms, default 30000)
 *
 * Credential (optional):
 *   type: api_key  → { header: 'Authorization', value: 'Bearer ...' }
 *   type: basic    → { username, password }
 */
export async function httpRequest({ input, config, credential }) {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    timeout = 30_000,
  } = config;

  if (!url) throw new Error('HTTP Request node: url is required');

  const reqHeaders = { ...headers };

  if (credential) {
    if (credential.type === 'api_key') {
      const { header = 'Authorization', value } = credential.data;
      reqHeaders[header] = value;
    } else if (credential.type === 'basic') {
      const { username, password } = credential.data;
      reqHeaders['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    }
  }

  const methodUpper = method.toUpperCase();
  let bodyStr;
  if (body !== undefined && body !== null && !['GET', 'HEAD'].includes(methodUpper)) {
    if (typeof body === 'object' && Object.keys(body).length > 0) {
      bodyStr = JSON.stringify(body);
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] ?? 'application/json';
    } else if (typeof body === 'string' && body.trim()) {
      bodyStr = body;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  let response;
  try {
    response = await fetch(url, {
      method: methodUpper,
      headers: reqHeaders,
      body: bodyStr,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const responseText = await response.text();
  let responseBody;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    responseBody = responseText;
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} from ${url}`);
    err.statusCode = response.status;
    err.body = responseBody;
    throw err;
  }

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: responseBody,
  };
}
