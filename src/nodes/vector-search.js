import OpenAI from 'openai';
import { db } from '../db/client.js';

export async function vectorSearch({ input, config, credential, workspaceId }) {
  const { query, topK = 5 } = config;
  const searchQuery = query || String(input?.query ?? input?.text ?? '');
  if (!searchQuery) throw new Error('Vector Search: query is required');

  const apiKey = credential?.data?.value ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Vector Search: no OpenAI API key for embeddings');

  const client = new OpenAI({ apiKey });
  const embeddingRes = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: String(searchQuery),
  });
  const embedding = embeddingRes.data[0].embedding;

  const { rows } = await db.query(
    `SELECT id, content, category, confidence, hit_count,
            1 - (embedding <=> $1::vector) AS similarity
     FROM memory_patterns
     WHERE workspace_id = $2
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [`[${embedding.join(',')}]`, workspaceId, Number(topK)]
  );

  return { results: rows, count: rows.length };
}
