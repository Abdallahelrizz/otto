import Fastify from 'fastify';
import cors from '@fastify/cors';
import { webhookRoutes } from './routes/webhooks.js';
import { executionRoutes } from './routes/executions.js';
import { workflowRoutes } from './routes/workflows.js';
import { credentialRoutes } from './routes/credentials.js';
import { startWorker } from './queue/worker.js';

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : true; // true = reflect request origin (dev default)

const fastify = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

await fastify.register(cors, { origin: allowedOrigins });

// Parse JSON bodies
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  try {
    done(null, JSON.parse(body));
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

// Routes
await fastify.register(webhookRoutes);
await fastify.register(executionRoutes);
await fastify.register(workflowRoutes);
await fastify.register(credentialRoutes);

// Health check
fastify.get('/health', async () => ({ status: 'ok', version: '0.1.0' }));

// Start BullMQ worker in the same process (split to separate process for scale)
startWorker();

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);

try {
  await fastify.listen({ host, port });
  console.log(`Otto engine running on http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
