/**
 * LLM Call node — calls any LLM via OpenAI-compatible API or Anthropic.
 *
 * Config:
 *   provider:     'openai' | 'openrouter' | 'anthropic'  (default: openai)
 *   model:        string  (e.g. 'gpt-4o-mini', 'claude-3-5-haiku-20241022')
 *   systemPrompt: string  (supports {{ }} expressions)
 *   userPrompt:   string  (supports {{ }} expressions — already resolved by executor)
 *   temperature:  number  (default: 0.7)
 *   maxTokens:    number  (default: 1000)
 *
 * Credential (optional):
 *   type: api_key  → { value: 'sk-...' }
 *   Falls back to env vars if no credential attached.
 */

const PROVIDER_URLS = {
  openai:      'https://api.openai.com/v1/chat/completions',
  openrouter:  'https://openrouter.ai/api/v1/chat/completions',
  anthropic:   'https://api.anthropic.com/v1/messages',
};

export async function llmCall({ input, config, credential }) {
  const {
    provider = 'openai',
    model = 'gpt-4o-mini',
    systemPrompt = '',
    userPrompt = '',
    temperature = 0.7,
    maxTokens = 1000,
  } = config;

  const apiKey = credential?.data?.value ?? getEnvKey(provider);
  if (!apiKey) throw new Error(`LLM Call: no API key for provider "${provider}"`);

  if (provider === 'anthropic') {
    return callAnthropic({ model, systemPrompt, userPrompt, temperature, maxTokens, apiKey });
  }

  return callOpenAICompat({ provider, model, systemPrompt, userPrompt, temperature, maxTokens, apiKey });
}

async function callOpenAICompat({ provider, model, systemPrompt, userPrompt, temperature, maxTokens, apiKey }) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const res = await fetch(PROVIDER_URLS[provider], {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error (${res.status}): ${err}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0];

  return {
    text: choice?.message?.content ?? '',
    model: json.model,
    usage: json.usage,
    finishReason: choice?.finish_reason,
  };
}

async function callAnthropic({ model, systemPrompt, userPrompt, temperature, maxTokens, apiKey }) {
  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: userPrompt }],
    temperature,
  };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch(PROVIDER_URLS.anthropic, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const json = await res.json();
  return {
    text: json.content?.[0]?.text ?? '',
    model: json.model,
    usage: json.usage,
    finishReason: json.stop_reason,
  };
}

function getEnvKey(provider) {
  return {
    openai:     process.env.OPENAI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    anthropic:  process.env.ANTHROPIC_API_KEY,
  }[provider];
}
