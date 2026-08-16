import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { csrfPlugin } from './middleware/csrf.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhooks.js';
import { executionRoutes } from './routes/executions.js';
import { workflowRoutes } from './routes/workflows.js';
import { credentialRoutes } from './routes/credentials.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { importRoutes } from './routes/import.js';
import { integrationRoutes } from './routes/integrations.js';
import { memoryRoutes } from './routes/memory.js';
import { binaryDataRoutes } from './routes/binary-data.js';
import { observabilityRoutes } from './routes/observability.js';
import { resumeRoutes } from './routes/resume.js';
import { workspaceRoutes } from './routes/workspace.js';
import { publicApiRoutes } from './routes/public-api.js';
import { mcpRoutes } from './routes/mcp.js';
import { variableRoutes } from './routes/variables.js';
import { auditRoutes } from './routes/audit.js';
import { templateRoutes } from './routes/templates.js';
import { approvalRoutes } from './routes/approvals.js';
import { evaluationRoutes } from './routes/evaluations.js';
import { externalSecretRoutes } from './routes/external-secrets.js';
import { nodeRoutes } from './routes/nodes.js';
import { tagRoutes } from './routes/tags.js';
import { exportRoutes } from './routes/export.js';
import { usageRoutes } from './routes/usage.js';
import { expressionRoutes } from './routes/expressions.js';
import { ottobotRoutes } from './routes/ottobot.js';
import { resolveScope } from './auth/scopes.js';
import { auditLog } from './utils/audit.js';
import { startWorker } from './queue/worker.js';
import { db } from './db/client.js';
import { runMigrations } from '../migrations/run.js';
import { redis, executionQueue } from './queue/client.js';
import { cleanupExpiredSessions, getAuthContext } from './auth/session.js';
import { getApiKeyAuthContext } from './auth/api-key.js';
import { checkRateLimit, rateLimitReply, checkUserApiLimit } from './middleware/rate-limit.js';
import { reconcileActiveSchedules } from './schedules/service.js';
import { schedulePruningJob } from './queue/pruning-job.js';
import { seedIntegrations } from './seed/integrations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

// Required env vars — fail fast so misconfigured deploys don't start silently
const REQUIRED_ENV = ['CREDENTIAL_ENCRYPTION_KEY', 'API_KEY_PEPPER'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key] || process.env[key].length < 32) {
    console.error(`[otto] FATAL: env var ${key} is missing or shorter than 32 chars. Generate with: openssl rand -hex 32`);
    process.exit(1);
  }
}

// Reflecting an arbitrary origin while sending credentials is a CSRF-grade hole.
// In production, refuse to reflect: an unset allowlist means same-origin only.
// In dev we still reflect for convenience.
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : (isProduction ? false : true);
if (isProduction && allowedOrigins === false) {
  console.warn('[otto] ALLOWED_ORIGINS is not set in production — CORS is restricted to same-origin. Set ALLOWED_ORIGINS for cross-origin canvas/API access.');
}

const fastify = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

// ── Global error handler ──────────────────────────────────────────────────
// Logs the true cause server-side; returns clean JSON to the client.
// Never leaks a stack trace. Infra/connection errors map to 503.
const INFRA_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'EPIPE',
]);
fastify.setErrorHandler((err, req, reply) => {
  req.log.error({ err, path: req.url, method: req.method }, 'request failed');

  // Client-intended errors (validation, 4xx) pass their message through.
  const status = err.statusCode && err.statusCode >= 400 && err.statusCode < 500
    ? err.statusCode
    : null;
  if (status) {
    return reply.code(status).send({ error: err.message, code: err.code });
  }

  // Malformed client input that Postgres rejects → 400, not 500. Without this a
  // request like GET /workflows/not-a-uuid surfaces as "Internal server error",
  // which is both the wrong status and indistinguishable from a genuine fault in
  // monitoring. These are all "you sent something invalid" classes:
  //   22P02 invalid_text_representation (bad uuid/int/enum literal)
  //   22003 numeric_value_out_of_range
  //   22007/22008 invalid/out-of-range datetime
  //   22001 string_data_right_truncation (value longer than the column)
  if (['22P02', '22003', '22007', '22008', '22001'].includes(err.code)) {
    return reply.code(400).send({ error: 'Invalid request parameter', code: 'INVALID_INPUT' });
  }

  // Infra connectivity → 503 with an actionable (but non-leaky) message.
  if (INFRA_ERROR_CODES.has(err.code) || /ECONNREFUSED|ENOTFOUND|getaddrinfo|pool|redis/i.test(err.message ?? '')) {
    return reply.code(503).send({
      error: 'A backend service (database or queue) is unavailable. Check server connectivity.',
      code: 'SERVICE_UNAVAILABLE',
    });
  }

  return reply.code(500).send({ error: 'Internal server error', code: 'INTERNAL' });
});

// ── Process-level guards ──────────────────────────────────────────────────
// A stray rejection logs instead of silently killing the process — these are
// usually a missing await and the process is still in a sane state.
process.on('unhandledRejection', (reason) => {
  fastify.log.error({ err: reason }, 'unhandledRejection');
});
// An *uncaught exception* leaves the process in an undefined state (Node's own
// guidance: do not resume normal operation). In production we log then exit so
// the supervisor (Docker restart policy / Railway) brings up a clean process.
// In dev we keep it alive so an editor-driven crash doesn't kill the dev server
// mid-iteration (`node --watch` would restart it anyway).
process.on('uncaughtException', (err) => {
  fastify.log.error({ err }, 'uncaughtException');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

await fastify.register(cors, { origin: allowedOrigins, credentials: true });
await fastify.register(cookie);
await fastify.register(csrfPlugin);

// Parse JSON bodies
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

fastify.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
  done(null, Object.fromEntries(new URLSearchParams(body)));
});

fastify.addHook('onRequest', async (req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",   // unsafe-inline needed for Vite-built SPA
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' wss: https:",       // wss for SSE/websockets, https for API calls
    "frame-ancestors 'none'",
  ].join('; '));

  const pathname = req.url.split('?')[0];
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

  if (
    pathname.startsWith('/webhooks/')
    || pathname.startsWith('/webhooks-test/')
    || pathname.startsWith('/forms/')
    || pathname.startsWith('/forms-test/')
    || pathname.startsWith('/chat/')
    || pathname.startsWith('/chat-test/')
  ) {
    const result = checkRateLimit(`webhook:${ip}`, { limit: 120, windowMs: 60_000 });
    if (!result.allowed) return rateLimitReply(reply, result);
    return;
  }

  if (pathname === '/api/v1/auth/login' || pathname === '/api/v1/auth/setup') {
    const result = checkRateLimit(`auth:${ip}`, { limit: 20, windowMs: 10 * 60_000 });
    if (!result.allowed) return rateLimitReply(reply, result);
  }

  if (!pathname.startsWith('/api/v1')) return;

  const publicApi = new Set([
    '/api/v1/auth/status',
    '/api/v1/auth/setup',
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
  ]);

  // Resume tokens are self-authenticating — no session required
  if (pathname.startsWith('/api/v1/resume/')) return;

  if (publicApi.has(pathname)) return;

  req.auth = await getAuthContext(req) ?? await getApiKeyAuthContext(req);

  if (!publicApi.has(pathname) && !req.auth) {
    return reply.code(401).send({ error: 'Authentication required' });
  }

  if (req.auth?.userId) {
    const apiLimit = checkUserApiLimit(req.auth.userId);
    if (!apiLimit.allowed) return rateLimitReply(reply, apiLimit);
  }

  if (req.auth) {
    const role = req.auth.role ?? 'editor';
    const method = req.method;
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method);

    // Viewers have read-only access across all routes
    if (role === 'viewer' && isWrite) {
      return reply.code(403).send({ error: 'Viewers have read-only access' });
    }

    // Credential and member management requires admin or owner
    const sensitiveWrite =
      (pathname.startsWith('/api/v1/credentials') || pathname.startsWith('/api/v1/workspace/members'))
      && isWrite;
    if (sensitiveWrite && !['owner', 'admin'].includes(role)) {
      return reply.code(403).send({ error: 'Credential and member management requires admin role or above' });
    }

    // Scope gate — only applies to API key auth; sessions carry full role-based access
    if (req.auth.authMethod === 'api_key') {
      const requiredScope = resolveScope(pathname, method);
      const grantedScopes = Array.isArray(req.auth.scopes) ? req.auth.scopes : [];
      if (requiredScope && !grantedScopes.includes('*') && !grantedScopes.includes(requiredScope)) {
        auditLog({
          workspaceId: req.auth.workspaceId,
          userId: req.auth.userId,
          action: 'api_key.scope_denied',
          resourceType: 'api_key',
          resourceId: req.auth.apiKeyId,
          metadata: { requiredScope, grantedScopes, path: pathname, method },
          ip,
          userAgent: req.headers['user-agent'],
        });
        return reply.code(403).send({ error: `Missing scope: ${requiredScope}` });
      }
    }
  }
});

// Routes
await fastify.register(authRoutes);
await fastify.register(webhookRoutes);
await fastify.register(executionRoutes);
await fastify.register(workflowRoutes);
await fastify.register(credentialRoutes);
await fastify.register(apiKeyRoutes);
await fastify.register(importRoutes);
await fastify.register(integrationRoutes);
await fastify.register(memoryRoutes);
await fastify.register(binaryDataRoutes);
await fastify.register(observabilityRoutes);
await fastify.register(resumeRoutes);
await fastify.register(workspaceRoutes);
await fastify.register(publicApiRoutes);
await fastify.register(mcpRoutes);
await fastify.register(variableRoutes);
await fastify.register(auditRoutes);
await fastify.register(templateRoutes);
await fastify.register(approvalRoutes);
await fastify.register(evaluationRoutes);
await fastify.register(externalSecretRoutes);
await fastify.register(nodeRoutes);
await fastify.register(tagRoutes);
await fastify.register(exportRoutes);
await fastify.register(usageRoutes);
await fastify.register(expressionRoutes);
await fastify.register(ottobotRoutes);

// Health check
fastify.get('/health', async () => ({ status: 'ok', version: '0.1.0' }));

// Readiness check — verifies DB and Redis connectivity
fastify.get('/ready', async (req, reply) => {
  const checks = { db: 'ok', redis: 'ok' };
  let healthy = true;
  try {
    const client = await db.pool.connect();
    await client.query('SELECT 1');
    client.release();
  } catch {
    checks.db = 'unavailable';
    healthy = false;
  }
  try {
    await redis.ping();
  } catch {
    checks.redis = 'unavailable';
    healthy = false;
  }
  checks.queue = 'ok';
  try {
    const waiting = await executionQueue.getWaitingCount();
    const active = await executionQueue.getActiveCount();
    checks.queue = 'ok';
    checks.queueStats = { waiting, active };
  } catch {
    checks.queue = 'unavailable';
    healthy = false;
  }
  reply.status(healthy ? 200 : 503).send({ ready: healthy, checks });
});

// Admin: queue stats
fastify.get('/api/v1/admin/queue', async (req, reply) => {
  if (!req.auth || !['owner', 'admin'].includes(req.auth.role ?? '')) {
    return reply.code(403).send({ error: 'Admin required' });
  }
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    executionQueue.getWaitingCount(),
    executionQueue.getActiveCount(),
    executionQueue.getCompletedCount(),
    executionQueue.getFailedCount(),
    executionQueue.getDelayedCount(),
  ]);
  return reply.send({ waiting, active, completed, failed, delayed, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 10) });
});

// Metrics — Prometheus-compatible execution counters.
// Optional gate: if METRICS_TOKEN is set, require it (Bearer header or ?token=).
const METRICS_TOKEN = process.env.METRICS_TOKEN;
fastify.get('/metrics', async (req, reply) => {
  if (METRICS_TOKEN) {
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const provided = bearer || req.query?.token;
    if (provided !== METRICS_TOKEN) {
      return reply.code(401).header('Content-Type', 'text/plain; version=0.0.4').send('# unauthorized\n');
    }
  }
  const lines = [
    '# HELP otto_executions_total Total executions by status',
    '# TYPE otto_executions_total counter',
  ];
  const statuses = ['success', 'error', 'running', 'pending', 'cancelled', 'waiting'];
  try {
    const result = await db.query(
      'SELECT status, COUNT(*) AS count FROM executions GROUP BY status'
    );
    const counts = Object.fromEntries(result.rows.map(r => [r.status, Number(r.count)]));
    for (const s of statuses) {
      lines.push(`otto_executions_total{status="${s}"} ${counts[s] ?? 0}`);
    }
    reply.header('Content-Type', 'text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  } catch (err) {
    reply
      .status(503)
      .header('Content-Type', 'text/plain; version=0.0.4')
      .send(`# ERROR db unavailable: ${err.message}\n`);
  }
});

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

fastify.get('/*', async (req, reply) => {
  const pathname = req.url.split('?')[0];
  if (
    pathname.startsWith('/api/')
    || pathname.startsWith('/webhooks/')
    || pathname.startsWith('/webhooks-test/')
    || pathname.startsWith('/forms/')
    || pathname.startsWith('/forms-test/')
    || pathname.startsWith('/chat/')
    || pathname.startsWith('/chat-test/')
  ) {
    return reply.code(404).send({ error: 'Not found' });
  }
  if (!existsSync(publicDir)) return reply.code(404).send({ error: 'Frontend build not found' });

  let requested;
  try {
    const decoded = decodeURIComponent(pathname);
    requested = decoded === '/' ? '/index.html' : decoded;
  } catch {
    // Malformed percent-encoding (e.g. a lone "%") — serve the SPA shell rather than 500.
    requested = '/index.html';
  }
  const filePath = path.resolve(publicDir, `.${requested}`);
  // Reject anything that resolves outside publicDir. Compare against `publicDir + sep`
  // (not a bare startsWith) so a sibling dir sharing the prefix — e.g. /app/public-secret
  // vs /app/public — can't slip through.
  const withinPublic = filePath === publicDir || filePath.startsWith(publicDir + path.sep);
  const safePath = withinPublic ? filePath : path.join(publicDir, 'index.html');
  const finalPath = existsSync(safePath) ? safePath : path.join(publicDir, 'index.html');
  const ext = path.extname(finalPath);

  reply.header('Content-Type', contentTypes[ext] ?? 'application/octet-stream');
  return reply.send(await readFile(finalPath));
});

// Build/upgrade the database schema before anything touches it (n8n-style auto-migrate).
// Idempotent + advisory-locked, so it's safe across replicas and restarts. This is also
// why the seed/reconcile steps below can assume their tables exist on a fresh database.
// Opt out (e.g. to run migrations as a separate release step) with RUN_MIGRATIONS_ON_BOOT=false.
if (process.env.RUN_MIGRATIONS_ON_BOOT !== 'false') {
  try {
    const { applied, skipped } = await runMigrations({ pool: db.pool, log: (m) => fastify.log.info(m) });
    fastify.log.info(`Migrations: ${applied} applied, ${skipped} already current`);
  } catch (err) {
    fastify.log.error({ err }, 'database migration failed — refusing to start');
    process.exit(1);
  }
}

// Start BullMQ worker in the same process (split to separate process for scale)
startWorker();
await cleanupExpiredSessions().catch((err) => fastify.log.warn({ err }, 'session cleanup failed'));
await reconcileActiveSchedules().catch((err) => fastify.log.warn({ err }, 'schedule reconcile failed'));
await schedulePruningJob().catch((err) => fastify.log.warn({ err }, 'pruning job schedule failed'));
await seedIntegrations().then(({ inserted, total }) => {
  if (inserted > 0) fastify.log.info(`Seeded ${inserted}/${total} integrations`);
}).catch((err) => fastify.log.warn({ err }, 'integration seed failed'));

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

try {
  await fastify.listen({ host, port });
  console.log(`Otto engine running on http://${host}:${port}`);

  // Connectivity self-check — surfaces which dependency is down (the #1 cause of 500s).
  const checkDb = db.query('SELECT 1')
    .then(() => console.log('  ✓ Postgres reachable'))
    .catch((err) => console.error(`  ✗ Postgres UNREACHABLE — executions will 503: ${err.message}`));
  const checkRedis = redis.ping()
    .then(() => console.log('  ✓ Redis reachable'))
    .catch((err) => console.error(`  ✗ Redis UNREACHABLE — running workflows will 503: ${err.message}`));
  await Promise.allSettled([checkDb, checkRedis]);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
