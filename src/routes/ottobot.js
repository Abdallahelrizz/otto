/**
 * POST /api/v1/ottobot/chat
 * Streams an OttoBot LLM response using the user's saved AI credential.
 * Security: workspace-scoped credential, never exposes the key, rate-limited,
 * CSRF-covered (no exempt prefix), reuses getCredential + llm provider logic.
 */
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../db/client.js';
import { getCredential } from '../engine/credentials.js';
import { checkRateLimit, rateLimitReply } from '../middleware/rate-limit.js';

const OTTOBOT_RATE = { limit: 60, windowMs: 60_000 };
const AI_TYPES     = new Set(['openai', 'anthropic', 'openrouter']);
const MAX_MESSAGES = 40;
const MAX_CHARS    = 24_000;

const SYSTEM_PROMPT = `You are OttoBot, an AI workflow assistant embedded inside Otto — a parallel workflow orchestrator similar to n8n but built for the AI era.
You help users design, debug, and optimize their automation workflows. You understand:
- Node types (triggers, HTTP requests, LLM calls, parallel AI, conditions, loops, etc.)
- Otto expressions like {{ $json.field }}, {{ $node["NodeName"].json.field }}, $input.item, $vars
- Workflow best practices: parallelization, error handling, credential use, data mapping
Be concise, practical, and specific. If given workflow context, analyze it and give actionable advice.`;

export async function ottobotRoutes(fastify) {
  fastify.post('/api/v1/ottobot/chat', async (req, reply) => {
    const { workspaceId, userId } = req.auth;

    // Dedicated rate limit
    const rl = checkRateLimit(`ottobot:${userId}`, OTTOBOT_RATE);
    if (!rl.allowed) return rateLimitReply(reply, rl);

    const { messages, credentialId } = req.body ?? {};

    // Input validation
    if (!Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send({ error: 'messages array is required' });
    }
    if (messages.length > MAX_MESSAGES) {
      return reply.code(400).send({ error: `Too many messages (max ${MAX_MESSAGES})` });
    }
    const totalChars = messages.reduce((n, m) => n + String(m?.content ?? '').length, 0);
    if (totalChars > MAX_CHARS) {
      return reply.code(400).send({ error: 'Payload too large' });
    }

    // Credential resolution — must belong to this workspace and be an AI type
    let credential;
    if (credentialId) {
      // Verify workspace ownership
      const { rows } = await db.query(
        'SELECT id, type FROM credentials WHERE id = $1 AND workspace_id = $2',
        [credentialId, workspaceId]
      );
      if (!rows.length) {
        return reply.code(404).send({ error: 'Credential not found' });
      }
      if (!AI_TYPES.has(rows[0].type)) {
        return reply.code(400).send({ error: 'Credential must be an AI provider' });
      }
      credential = await getCredential(credentialId, { workspaceId });
    } else {
      // Auto-select first available AI credential in this workspace
      const { rows } = await db.query(
        `SELECT id, type FROM credentials
         WHERE workspace_id = $1 AND type = ANY($2::text[])
         ORDER BY created_at ASC LIMIT 1`,
        [workspaceId, [...AI_TYPES]]
      );
      if (!rows.length) {
        return reply.code(422).send({ error: 'No AI credential configured. Add an OpenAI, Anthropic, or OpenRouter credential first.' });
      }
      credential = await getCredential(rows[0].id, { workspaceId });
    }

    const apiKey    = credential.data?.value;
    const provider  = credential.type; // 'openai' | 'anthropic' | 'openrouter'

    if (!apiKey) {
      return reply.code(422).send({ error: 'OttoBot request failed' });
    }

    // Build safe message list (only role+content, no injection)
    const safeMessages = messages
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({
        role:    ['user', 'assistant'].includes(String(m.role)) ? String(m.role) : 'user',
        content: String(m.content ?? '').slice(0, 8000),
      }));

    // ── Stream the response ───────────────────────────────────────
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':   'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (text) => res.write(`data: ${JSON.stringify({ text })}\n\n`);
    const done = () => { res.write('data: [DONE]\n\n'); res.end(); };

    try {
      if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey });
        const stream = await client.messages.create({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: safeMessages,
          stream: true,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
            send(chunk.delta.text);
          }
        }
      } else {
        // OpenAI or OpenRouter (OpenAI-compatible)
        const client = new OpenAI({
          apiKey,
          ...(provider === 'openrouter' ? { baseURL: 'https://openrouter.ai/api/v1' } : {}),
        });
        const stream = await client.chat.completions.create({
          model:       provider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini',
          messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...safeMessages],
          max_tokens:  1024,
          stream:      true,
        });
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) send(text);
        }
      }
    } catch {
      // Never expose upstream error details
      res.write('data: [ERROR]\n\n');
    }

    done();
    return reply;
  });

  // List workspace AI credentials (id + name + type only — no key data)
  fastify.get('/api/v1/ottobot/credentials', async (req, reply) => {
    const { workspaceId } = req.auth;
    const { rows } = await db.query(
      `SELECT id, name, type, created_at
       FROM credentials
       WHERE workspace_id = $1 AND type = ANY($2::text[])
       ORDER BY created_at ASC`,
      [workspaceId, [...AI_TYPES]]
    );
    return reply.send({ credentials: rows });
  });
}
