import Fastify from 'fastify';
import cors from '@fastify/cors';
import { webhookRoutes } from './routes/webhooks.js';
import { executionRoutes } from './routes/executions.js';
import { startWorker } from './queue/worker.js';

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });

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
