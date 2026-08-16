import { db } from '../db/client.js';
import { clampNumber, embedText, vectorLiteral } from './memory-utils.js';

export async function vectorSearch({ input, config, credential, workspaceId, signal }) {
  const { query, topK = 5, category, minScore } = config;
  const searchQuery = query || String(input?.query ?? input?.text ?? '');
  if (!searchQuery) throw new Error('Vector Search: query is required');

  const embedding = await embedText(searchQuery, credential, signal);
  const limit = clampNumber(topK, 5, 1, 50);
  const params = [vectorLiteral(embedding), workspaceId, limit];
  const categoryClause = category ? `AND category = $${params.push(category)}` : '';
  const minScoreClause = minScore === '' || minScore == null ? '' : `AND 1 - (embedding <=> $1::vector) >= $${params.push(clampNumber(minScore, 0, 0, 1))}`;

  const { rows } = await db.query(
    `SELECT id, content, category, confidence, hit_count,
            1 - (embedding <=> $1::vector) AS similarity
     FROM memory_patterns
     WHERE workspace_id = $2
       AND embedding IS NOT NULL
       ${categoryClause}
       ${minScoreClause}
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    params
  );

  return { results: rows, count: rows.length };
}
