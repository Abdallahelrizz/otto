import OpenAI from 'openai';

export function readOpenAiKey(credential) {
  return credential?.data?.value ?? credential?.data?.apiKey ?? process.env.OPENAI_API_KEY;
}

export async function embedText(text, credential, signal) {
  const input = String(text ?? '').trim();
  if (!input) return null;

  const apiKey = readOpenAiKey(credential);
  if (!apiKey) throw new Error('Memory: no OpenAI API key for embeddings');

  const client = new OpenAI({ apiKey });
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  }, { signal });
  return response.data[0].embedding;
}

export function vectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

export function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
