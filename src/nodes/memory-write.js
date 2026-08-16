import { db } from '../db/client.js';
import { clampNumber, embedText, vectorLiteral } from './memory-utils.js';

function normalizeMode(mode) {
  return ['pattern', 'interaction', 'summary'].includes(mode) ? mode : 'pattern';
}

function textFrom(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export async function memoryWrite({ input, config, credential, workspaceId, signal }) {
  const mode = normalizeMode(config.mode);
  const sessionId = config.sessionId || input?.sessionId || input?.session_id || 'default';
  const category = String(config.category ?? input?.category ?? 'general').trim() || 'general';
  const confidence = clampNumber(config.confidence ?? input?.confidence, 1, 0, 1);

  if (mode === 'pattern') {
    const content = textFrom(config.content || input?.content || input?.text || input?.message).trim();
    if (!content) throw new Error('Memory Write: content is required');

    const embedding = await embedText(content, credential, signal);
    const { rows } = await db.query(
      `INSERT INTO memory_patterns (workspace_id, content, category, confidence, embedding, last_invoked_at)
       VALUES ($1, $2, $3, $4, $5::vector, NOW())
       RETURNING id, content, category, confidence`,
      [workspaceId, content, category, confidence, vectorLiteral(embedding)]
    );
    return { mode, pattern: rows[0] };
  }

  if (mode === 'interaction') {
    const inputText = textFrom(config.inputText || input?.input || input?.question || input?.message).trim();
    const outputText = textFrom(config.outputText || input?.output || input?.answer || input?.response).trim();
    if (!inputText && !outputText) throw new Error('Memory Write: input or output text is required');

    const embedding = await embedText(`${inputText}\n${outputText}`.trim(), credential, signal);
    const { rows } = await db.query(
      `INSERT INTO memory_interactions (workspace_id, session_id, input, output, confidence, embedding)
       VALUES ($1, $2, $3, $4, $5, $6::vector)
       RETURNING id, session_id, input, output, confidence, created_at`,
      [workspaceId, sessionId, inputText || null, outputText || null, confidence, vectorLiteral(embedding)]
    );
    return { mode, interaction: rows[0] };
  }

  const summary = textFrom(config.summary || input?.summary || input?.text).trim();
  if (!summary) throw new Error('Memory Write: summary is required');

  const { rows } = await db.query(
    `INSERT INTO session_summaries (workspace_id, session_id, summary, turn_count, updated_at)
     VALUES ($1, $2, $3, 1, NOW())
     ON CONFLICT (session_id)
     DO UPDATE SET
       workspace_id = EXCLUDED.workspace_id,
       summary = EXCLUDED.summary,
       turn_count = session_summaries.turn_count + 1,
       updated_at = NOW()
     WHERE session_summaries.workspace_id = EXCLUDED.workspace_id
     RETURNING session_id, summary, turn_count, updated_at`,
    [workspaceId, sessionId, summary]
  );
  if (!rows.length) throw new Error('Memory Write: sessionId already exists in another workspace');
  return { mode, summary: rows[0] };
}
