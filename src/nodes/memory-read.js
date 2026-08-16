import { db } from '../db/client.js';
import { clampNumber, embedText, vectorLiteral } from './memory-utils.js';

function normalizeMode(mode) {
  return ['semantic', 'session', 'summary', 'all'].includes(mode) ? mode : 'semantic';
}

async function readPatterns({ workspaceId, query, category, topK, minScore, credential, signal }) {
  const embedding = await embedText(query, credential, signal);
  if (!embedding) return [];

  const params = [vectorLiteral(embedding), workspaceId, topK];
  const categoryClause = category ? `AND category = $${params.push(category)}` : '';
  const minScoreClause = Number.isFinite(minScore) ? `AND 1 - (embedding <=> $1::vector) >= $${params.push(minScore)}` : '';

  const { rows } = await db.query(
    `SELECT id, content, category, confidence, hit_count, last_invoked_at,
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

  if (rows.length) {
    await db.query(
      `UPDATE memory_patterns
       SET hit_count = hit_count + 1, last_invoked_at = NOW()
       WHERE id = ANY($1::uuid[])`,
      [rows.map((row) => row.id)]
    ).catch(() => {});
  }

  return rows;
}

async function readInteractions({ workspaceId, sessionId, limit }) {
  if (!sessionId) return [];
  const { rows } = await db.query(
    `SELECT id, session_id, input, output, confidence, created_at
     FROM memory_interactions
     WHERE workspace_id = $1 AND session_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [workspaceId, sessionId, limit]
  );
  return rows;
}

async function readSummary({ workspaceId, sessionId }) {
  if (!sessionId) return null;
  const { rows } = await db.query(
    `SELECT session_id, summary, turn_count, updated_at
     FROM session_summaries
     WHERE workspace_id = $1 AND session_id = $2`,
    [workspaceId, sessionId]
  );
  return rows[0] ?? null;
}

export async function memoryRead({ input, config, credential, workspaceId, signal }) {
  const mode = normalizeMode(config.mode);
  const query = config.query || input?.query || input?.text || input?.message;
  const sessionId = config.sessionId || input?.sessionId || input?.session_id || 'default';
  const category = String(config.category ?? '').trim();
  const topK = clampNumber(config.topK, 5, 1, 50);
  const minScore = config.minScore === '' || config.minScore == null
    ? null
    : clampNumber(config.minScore, 0, 0, 1);

  const result = {
    mode,
    query: query ?? null,
    sessionId,
    category: category || null,
    patterns: [],
    interactions: [],
    summary: null,
  };

  if (mode === 'semantic' || mode === 'all') {
    result.patterns = await readPatterns({
      workspaceId,
      query,
      category: category || null,
      topK,
      minScore,
      credential,
      signal,
    });
  }

  if (mode === 'session' || mode === 'all') {
    result.interactions = await readInteractions({ workspaceId, sessionId, limit: topK });
  }

  if (mode === 'summary' || mode === 'all') {
    result.summary = await readSummary({ workspaceId, sessionId });
  }

  return {
    ...result,
    count: result.patterns.length + result.interactions.length + (result.summary ? 1 : 0),
  };
}
