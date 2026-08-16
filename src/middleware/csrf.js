import { randomBytes, timingSafeEqual } from 'crypto';

const CSRF_COOKIE = 'otto-csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Paths that are exempt from CSRF (webhooks use their own auth, public API uses API keys)
const EXEMPT_PREFIXES = [
  '/webhooks/', '/webhooks-test/', '/forms/', '/forms-test/',
  '/chat/', '/chat-test/',
  '/api/v1/resume/',   // self-authenticating resume tokens
  '/api/v1/public/',   // API-key authenticated
  '/api/v1/mcp/',      // API-key or session authenticated from AI client
];
const EXEMPT_EXACT = new Set([
  '/api/v1/auth/setup', '/api/v1/auth/login', '/api/v1/auth/logout',
  '/api/v1/mcp', '/health', '/ready', '/metrics',
]);

function tokensEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

// NOTE: This plugin requires @fastify/cookie to be registered before it.
export function csrfPlugin(fastify, _opts, done) {
  // On every request: set the CSRF cookie if missing
  fastify.addHook('onRequest', (req, reply, hookDone) => {
    // Issue a new token if one isn't present
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = randomBytes(16).toString('hex');
      reply.setCookie(CSRF_COOKIE, token, {
        path: '/',
        httpOnly: false,   // must be readable by JS to double-submit
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      });
    }
    hookDone();
  });

  // On state-changing requests: verify the header matches the cookie
  fastify.addHook('preHandler', (req, reply, hookDone) => {
    if (SAFE_METHODS.has(req.method)) return hookDone();

    const pathname = req.url.split('?')[0];
    // Broad prefix matches previously exempted lookalike paths such as /health-admin.
    if (EXEMPT_EXACT.has(pathname) || EXEMPT_PREFIXES.some(p => pathname.startsWith(p))) return hookDone();

    // API-key authenticated clients don't need CSRF (token in header, not cookie)
    // Any fake Bearer header previously bypassed CSRF while a session cookie authenticated the request.
    if (req.auth?.authMethod === 'api_key') return hookDone();

    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER];

    if (!tokensEqual(cookieToken, headerToken)) {
      return reply.code(403).send({ error: 'CSRF token mismatch' });
    }
    hookDone();
  });

  done();
}
