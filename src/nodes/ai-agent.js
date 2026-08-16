/**
 * AI Agent node — LLM with tool-use loop.
 *
 * Config:
 *   provider:     'openai' | 'openrouter' | 'anthropic'
 *   model:        model ID
 *   systemPrompt: string
 *   tools:        [{ name, description, parameters: JSONSchema, handler: string, config: {} }]
 *   maxSteps:     number (default 10, hard cap 100)
 *
 * Returns: { text, steps, usage }
 *   steps: [{ tool, input, output, durationMs }]
 *   usage: { prompt_tokens, completion_tokens, total_tokens }
 */
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { getNodeHandler } from './index.js';

const ABSOLUTE_MAX_STEPS = 100;

function getApiKey(provider, credential) {
  return credential?.data?.value ?? {
    openai:     process.env.OPENAI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    anthropic:  process.env.ANTHROPIC_API_KEY,
  }[provider];
}

async function runTool(toolDef, toolArgs, workspaceId, signal) {
  const handler = getNodeHandler(toolDef.handler ?? toolDef.type ?? 'http_request');
  const config = { ...(toolDef.config ?? {}), ...toolArgs };
  // Forward the signal: an agent tool IS a node handler (often http_request), so
  // without this a cancelled agent would keep issuing tool requests.
  return handler({
    input: toolArgs, rawInputs: [], config, credential: null, workspaceId,
    signal, ctx: { signal },
  });
}

export async function aiAgent({ input, config, credential, workspaceId, signal }) {
  const {
    provider     = 'openai',
    model        = 'gpt-4o-mini',
    systemPrompt = '',
    tools        = [],
    maxSteps     = 10,
  } = config;

  const steps = [];
  const totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const parsedMaxSteps = Number(maxSteps);
  // CORRECTNESS: NaN/zero previously made the agent silently perform no work.
  if (!Number.isInteger(parsedMaxSteps) || parsedMaxSteps < 1) {
    throw new Error('AI Agent: maxSteps must be a positive integer');
  }
  const effectiveMaxSteps = Math.min(parsedMaxSteps, ABSOLUTE_MAX_STEPS);
  const apiKey = getApiKey(provider, credential);
  if (!apiKey) throw new Error(`AI Agent: no API key for provider "${provider}"`);

  if (provider === 'anthropic') {
    return runAnthropicLoop({
      input, systemPrompt, model, apiKey, tools, effectiveMaxSteps, workspaceId, steps, totalUsage, signal,
    });
  }

  return runOpenAILoop({
    input, systemPrompt, model, apiKey, provider, tools, effectiveMaxSteps, workspaceId, steps, totalUsage, signal,
  });
}

// ── OpenAI / OpenRouter tool-use loop ─────────────────────────────────────────

async function runOpenAILoop({ input, systemPrompt, model, apiKey, provider, tools, effectiveMaxSteps, workspaceId, steps, totalUsage, signal }) {
  const client = new OpenAI({
    apiKey,
    ...(provider === 'openrouter' ? { baseURL: 'https://openrouter.ai/api/v1' } : {}),
  });

  const openaiTools = tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? '',
      parameters: t.parameters ?? { type: 'object', properties: {} },
    },
  }));

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: String(systemPrompt) });
  messages.push({ role: 'user', content: JSON.stringify(input) });

  let stepCount = 0;
  let finalText = '';

  while (stepCount < effectiveMaxSteps) {
    // Stop the agent loop on cancel — otherwise it keeps stepping (and paying)
    // after the user cancelled.
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Cancelled by user');
    stepCount++;
    const response = await client.chat.completions.create({
      model,
      messages,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
      tool_choice: openaiTools.length > 0 ? 'auto' : undefined,
    }, { signal });

    const usage = response.usage ?? {};
    totalUsage.prompt_tokens     += usage.prompt_tokens ?? 0;
    totalUsage.completion_tokens += usage.completion_tokens ?? 0;
    totalUsage.total_tokens      += usage.total_tokens ?? 0;

    const choice = response.choices[0];
    const msg = choice.message;
    messages.push(msg);

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      finalText = msg.content ?? '';
      break;
    }

    // Execute each tool call in parallel
    const toolResults = await Promise.all(
      msg.tool_calls.map(async (tc) => {
        const toolDef = tools.find(t => t.name === tc.function.name);
        if (!toolDef) throw new Error(`AI Agent: unknown tool "${tc.function.name}"`);
        const toolArgs = JSON.parse(tc.function.arguments ?? '{}');
        const t0 = Date.now();
        const output = await runTool(toolDef, toolArgs, workspaceId, signal);
        steps.push({ tool: tc.function.name, input: toolArgs, output, durationMs: Date.now() - t0 });
        return { role: 'tool', tool_call_id: tc.id, content: JSON.stringify(output) };
      })
    );

    messages.push(...toolResults);
  }

  return { text: finalText, steps, model, usage: totalUsage };
}

// ── Anthropic tool-use loop ────────────────────────────────────────────────────

async function runAnthropicLoop({ input, systemPrompt, model, apiKey, tools, effectiveMaxSteps, workspaceId, steps, totalUsage, signal }) {
  const client = new Anthropic({ apiKey });

  const anthropicTools = tools.map(t => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.parameters ?? { type: 'object', properties: {} },
  }));

  const messages = [{ role: 'user', content: JSON.stringify(input) }];
  const systemBlock = systemPrompt ? String(systemPrompt) : undefined;

  let stepCount = 0;
  let finalText = '';

  while (stepCount < effectiveMaxSteps) {
    // Stop the agent loop on cancel — otherwise it keeps stepping (and paying)
    // after the user cancelled.
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Cancelled by user');
    stepCount++;
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      messages,
      ...(systemBlock ? { system: systemBlock } : {}),
      ...(anthropicTools.length > 0 ? { tools: anthropicTools } : {}),
    }, { signal });

    const usage = response.usage ?? {};
    totalUsage.prompt_tokens     += usage.input_tokens ?? 0;
    totalUsage.completion_tokens += usage.output_tokens ?? 0;
    totalUsage.total_tokens      += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') {
      finalText = response.content.find(b => b.type === 'text')?.text ?? '';
      break;
    }

    const toolBlocks = response.content.filter(b => b.type === 'tool_use');
    const toolResults = await Promise.all(
      toolBlocks.map(async (tb) => {
        const toolDef = tools.find(t => t.name === tb.name);
        if (!toolDef) throw new Error(`AI Agent: unknown tool "${tb.name}"`);
        const t0 = Date.now();
        const output = await runTool(toolDef, tb.input ?? {}, workspaceId, signal);
        steps.push({ tool: tb.name, input: tb.input, output, durationMs: Date.now() - t0 });
        return { type: 'tool_result', tool_use_id: tb.id, content: JSON.stringify(output) };
      })
    );

    messages.push({ role: 'user', content: toolResults });
  }

  return { text: finalText, steps, model, usage: totalUsage };
}
