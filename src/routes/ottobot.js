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
    const { workspaceId, userId, workspace } = req.auth;

    // Enforce workspace settings
    const settings = workspace.ottobot_settings || { enabled: true, credentialId: null };
    if (!settings.enabled) {
      return reply.code(403).send({ error: 'OttoBot is disabled for this workspace. An admin can enable it in Settings.' });
    }

    // Dedicated rate limit
    const rl = checkRateLimit(`ottobot:${userId}`, OTTOBOT_RATE);
    if (!rl.allowed) return rateLimitReply(reply, rl);

    const { messages } = req.body ?? {};

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

    // Use credential from settings
    const credentialId = settings.credentialId;
    if (!credentialId) {
      return reply.code(422).send({ error: 'OttoBot has no credential assigned. An admin must configure it in Settings.' });
    }

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
    const credential = await getCredential(credentialId, { workspaceId });

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

    let promptTokens = 0;
    let completionTokens = 0;
    const modelUsed = provider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini';

    try {
      if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey });
        const stream = await client.messages.create({
          model: modelUsed,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: safeMessages,
          stream: true,
        });
        for await (const chunk of stream) {
          if (chunk.type === 'message_start' && chunk.message?.usage) {
            promptTokens = chunk.message.usage.input_tokens || 0;
          }
          if (chunk.type === 'message_delta' && chunk.usage) {
            completionTokens = chunk.usage.output_tokens || 0;
          }
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
          model: modelUsed,
          messages:    [{ role: 'system', content: SYSTEM_PROMPT }, ...safeMessages],
          max_tokens:  1024,
          stream:      true,
          stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) send(text);
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens || 0;
            completionTokens = chunk.usage.completion_tokens || 0;
          }
        }
      }

      // Log usage if tokens were recorded
      if (promptTokens > 0 || completionTokens > 0) {
        await db.query(
          `INSERT INTO ottobot_usage (workspace_id, user_id, model, prompt_tokens, completion_tokens)
           VALUES ($1, $2, $3, $4, $5)`,
          [workspaceId, userId, modelUsed, promptTokens, completionTokens]
        ).catch(() => {}); // Fire and forget
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
