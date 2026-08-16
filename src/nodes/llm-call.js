/**
 * LLM Call node — calls any LLM via OpenAI SDK or Anthropic SDK.
 *
 * Config:
 *   provider:     'openai' | 'openrouter' | 'anthropic'
 *   model:        model ID string
 *   systemPrompt: string ({{ }} resolved by executor)
 *   userPrompt:   string ({{ }} resolved by executor)
 *   temperature:  number (default 0.7)
 *   maxTokens:    number (default 1000)
 *
 * Returns: { text, model, usage, finishReason }
 */
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

function getApiKey(provider, credential) {
  return credential?.data?.value ?? {
    openai:     process.env.OPENAI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    anthropic:  process.env.ANTHROPIC_API_KEY,
  }[provider];
}

export async function llmCall({ config, credential, signal }) {
  const {
    provider     = 'openai',
    model        = 'gpt-4o-mini',
    systemPrompt = '',
    userPrompt   = '',
    temperature  = 0.7,
    maxTokens    = 1000,
  } = config;

  const apiKey = getApiKey(provider, credential);
  if (!apiKey) throw new Error(`LLM Call: no API key for provider "${provider}"`);

  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const body = {
      model,
      max_tokens: Number(maxTokens),
      temperature: Number(temperature),
      messages: [{ role: 'user', content: String(userPrompt) }],
    };
    if (systemPrompt) body.system = String(systemPrompt);

    // `signal` aborts the underlying fetch: the socket closes and this promise
    // rejects immediately instead of waiting out a long completion. Note this
    // stops US waiting — a non-streaming completion may still finish provider-side,
    // and tokens already produced are generally still billed.
    const response = await client.messages.create(body, { signal });
    return {
      text: response.content[0]?.text ?? '',
      model: response.model,
      usage: {
        prompt_tokens:     response.usage.input_tokens,
        completion_tokens: response.usage.output_tokens,
        total_tokens:      response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: response.stop_reason,
    };
  }

  // OpenAI + OpenRouter (OpenAI-compatible)
  const client = new OpenAI({
    apiKey,
    ...(provider === 'openrouter' ? { baseURL: 'https://openrouter.ai/api/v1' } : {}),
  });

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: String(systemPrompt) });
  messages.push({ role: 'user', content: String(userPrompt) });

  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: Number(temperature),
    max_tokens: Number(maxTokens),
  }, { signal });

  const choice = response.choices[0];
  return {
    text: choice.message.content ?? '',
    model: response.model,
    usage: response.usage,
    finishReason: choice.finish_reason,
  };
}
