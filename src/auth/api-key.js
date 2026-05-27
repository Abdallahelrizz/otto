import { createHash, randomBytes } from 'crypto';
import { db } from '../db/client.js';

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function hashApiKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey() {
  const key = `otto_${base64url(randomBytes(32))}`;
  return {
    key,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, 12),
  };
}

export function readBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (rest.length || scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export async function getApiKeyAuthContext(req) {
  const token = readBearerToken(req);
  if (!token) return null;

  const { rows } = await db.query(
    `SELECT ak.id AS api_key_id, ak.user_id, ak.workspace_id, ak.name AS api_key_name,
            u.email, u.name AS user_name, w.name AS workspace_name, w.plan
     FROM api_keys ak
     LEFT JOIN users u ON u.id = ak.user_id
     JOIN workspaces w ON w.id = ak.workspace_id
     WHERE ak.key_hash = $1`,
    [hashApiKey(token)]
  );

  if (!rows.length) return null;
  const row = rows[0];

  await db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.api_key_id]).catch(() => {});

  return {
    authMethod: 'api_key',
    apiKeyId: row.api_key_id,
    apiKeyName: row.api_key_name,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    user: row.user_id ? { id: row.user_id, email: row.email, name: row.user_name } : null,
    workspace: { id: row.workspace_id, name: row.workspace_name, plan: row.plan },
  };
}
