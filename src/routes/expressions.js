import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import { db } from '../db/client.js';
import { checkRateLimit, rateLimitReply } from '../middleware/rate-limit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.resolve(__dirname, '../engine/expression-worker.js');

const MAX_EXPRESSION_BYTES = 2048;   // 2 KB
const MAX_CONTEXT_BYTES    = 65536;  // 64 KB
const PREVIEW_RATE_LIMIT   = { limit: 120, windowMs: 60_000 };
const WORKER_TIMEOUT_MS    = 250;

function runInWorker(expression, context) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { expression, context },
      resourceLimits: { maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8 },
      // Do NOT inherit the parent's Node flags. The dev server runs with
      // `node --watch`, which is invalid in a worker thread and would make
      // every preview fail to spawn. An empty execArgv keeps the worker robust.
      execArgv: [],
    });

    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('timeout'));
    }, WORKER_TIMEOUT_MS);

    worker.on('message', (msg) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(msg);
    });

    worker.on('error', () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('worker error'));
    });
  });
}

export async function expressionRoutes(fastify) {
  fastify.post('/api/v1/expressions/preview', async (req, reply) => {
    const { workspaceId, userId } = req.auth;

    // Dedicated rate limit on top of the global per-user limit
    const rl = checkRateLimit(`expr-preview:${userId}`, PREVIEW_RATE_LIMIT);
    if (!rl.allowed) return rateLimitReply(reply, rl);

    const { expression, executionId, nodeId } = req.body ?? {};

    // Input size caps
    if (!expression || typeof expression !== 'string') {
      return reply.code(400).send({ error: 'expression is required' });
    }
    if (Buffer.byteLength(expression, 'utf8') > MAX_EXPRESSION_BYTES) {
      return reply.code(400).send({ error: 'expression too large (max 2 KB)' });
    }

    // Build the expression context from execution data (workspace-scoped)
    let inputData = null;
    let nodesData = {};

    if (executionId && nodeId) {
      try {
        const [execResult, nodeResult] = await Promise.all([
          db.query(
            `SELECT id FROM executions WHERE id = $1 AND workspace_id = $2`,
            [executionId, workspaceId]
          ),
          db.query(
            `SELECT node_id, node_name, input, output
             FROM node_executions
             WHERE execution_id = $1
             ORDER BY started_at ASC`,
            [executionId]
          ),
        ]);

        // If execution isn't in this workspace, just preview with empty context
        // (don't 500 / don't leak existence) — degrade gracefully.
        if (execResult.rows.length) {
          for (const ne of nodeResult.rows) {
            if (ne.node_id === nodeId) inputData = ne.input;
            if (ne.output != null) {
              nodesData[ne.node_name] = ne.output;
              nodesData[ne.node_id]   = ne.output;
            }
          }
        }
      } catch {
        // DB hiccup — preview against empty context rather than erroring the field
        inputData = null;
        nodesData = {};
      }
    }

    // Build context — never includes decrypted credentials
    const context = { input: inputData ?? {}, nodes: nodesData };

    // Size cap on the context object
    const contextBytes = Buffer.byteLength(JSON.stringify(context), 'utf8');
    if (contextBytes > MAX_CONTEXT_BYTES) {
      return reply.code(400).send({ error: 'context too large' });
    }

    try {
      const result = await runInWorker(expression, context);
      if (!result.ok) {
        return reply.send({ ok: false, error: 'Expression could not be evaluated' });
      }
      return reply.send({ ok: true, result: result.result, resolvedType: result.resolvedType });
    } catch {
      // timeout or worker crash — generic message, no internal details
      return reply.send({ ok: false, error: 'Expression could not be evaluated' });
    }
  });
}
