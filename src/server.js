import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRoutes } from './routes/auth.js';
import { webhookRoutes } from './routes/webhooks.js';
import { executionRoutes } from './routes/executions.js';
import { workflowRoutes } from './routes/workflows.js';
import { credentialRoutes } from './routes/credentials.js';
import { importRoutes } from './routes/import.js';
import { integrationRoutes } from './routes/integrations.js';
import { startWorker } from './queue/worker.js';
import { cleanupExpiredSessions, getAuthContext } from './auth/session.js';
import { checkRateLimit, rateLimitReply } from './middleware/rate-limit.js';
import { reconcileActiveSchedules } from './schedules/service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : true; // true = reflect request origin (dev default)

const fastify = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

await fastify.register(cors, { origin: allowedOrigins, credentials: true });

// Parse JSON bodies
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

fastify.addHook('onRequest', async (req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');

  const pathname = req.url.split('?')[0];
  const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

  if (pathname.startsWith('/webhooks/')) {
    const result = checkRateLimit(`webhook:${ip}`, { limit: 120, windowMs: 60_000 });
    if (!result.allowed) return rateLimitReply(reply, result);
    return;
  }

  if (pathname === '/api/v1/auth/login' || pathname === '/api/v1/auth/setup') {
    const result = checkRateLimit(`auth:${ip}`, { limit: 20, windowMs: 10 * 60_000 });
    if (!result.allowed) return rateLimitReply(reply, result);
  }

  if (!pathname.startsWith('/api/v1')) return;

  req.auth = await getAuthContext(req);

  const publicApi = new Set([
    '/api/v1/auth/status',
    '/api/v1/auth/setup',
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
  ]);

  if (!publicApi.has(pathname) && !req.auth) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
});

// Routes
await fastify.register(authRoutes);
await fastify.register(webhookRoutes);
await fastify.register(executionRoutes);
await fastify.register(workflowRoutes);
await fastify.register(credentialRoutes);
await fastify.register(importRoutes);
await fastify.register(integrationRoutes);

// Health check
fastify.get('/health', async () => ({ status: 'ok', version: '0.1.0' }));

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
  if (pathname.startsWith('/api/') || pathname.startsWith('/webhooks/')) {
    return reply.code(404).send({ error: 'Not found' });
  }
  if (!existsSync(publicDir)) return reply.code(404).send({ error: 'Frontend build not found' });

  const decoded = decodeURIComponent(pathname);
  const requested = decoded === '/' ? '/index.html' : decoded;
  const filePath = path.resolve(publicDir, `.${requested}`);
  const safePath = filePath.startsWith(publicDir) ? filePath : path.join(publicDir, 'index.html');
  const finalPath = existsSync(safePath) ? safePath : path.join(publicDir, 'index.html');
  const ext = path.extname(finalPath);

  reply.header('Content-Type', contentTypes[ext] ?? 'application/octet-stream');
  return reply.send(await readFile(finalPath));
});

// Start BullMQ worker in the same process (split to separate process for scale)
startWorker();
await cleanupExpiredSessions().catch((err) => fastify.log.warn({ err }, 'session cleanup failed'));
await reconcileActiveSchedules().catch((err) => fastify.log.warn({ err }, 'schedule reconcile failed'));

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

try {
  await fastify.listen({ host, port });
  console.log(`Otto engine running on http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
