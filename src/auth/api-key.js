import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { db } from '../db/client.js';
import { auditLog } from '../utils/audit.js';

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function getPepper() {
  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper || pepper.length < 32) throw new Error('API_KEY_PEPPER env var is missing or too short (need 32+ chars)');
  return pepper;
}

export function hashApiKey(key) {
  return createHmac('sha256', getPepper()).update(key).digest('hex');
}

export function generateApiKey() {
  const secret = base64url(randomBytes(32));
  const key = `otto_${secret}`;
  return {
    key,
    keyHash: hashApiKey(key),
    keyPrefix: key.slice(0, 16),
  };
}

export function readBearerToken(req) {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const [scheme, token, ...rest] = header.trim().split(/\s+/);
  if (rest.length || scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

// In-memory dedup: only audit api_key.used once per (keyId, UTC day) per process.
const usedToday = new Map();
function shouldAuditUse(apiKeyId) {
  const day = new Date().toISOString().slice(0, 10);
  const k = `${apiKeyId}:${day}`;
  if (usedToday.has(k)) return false;
  usedToday.set(k, true);
  // Prune old entries periodically to prevent unbounded growth
  if (usedToday.size > 5000) {
    for (const [key] of usedToday) {
      if (!key.endsWith(day)) usedToday.delete(key);
    }
  }
  return true;
}

export async function getApiKeyAuthContext(req) {
  const token = readBearerToken(req);
  if (!token || !token.startsWith('otto_')) return null;

  const prefix = token.slice(0, 16);
  const ip = req.ip ?? req.socket?.remoteAddress ?? null;
  const userAgent = req.headers['user-agent'] ?? null;

  const { rows } = await db.query(
    // NOTE the workspace_members join: without it `role` is undefined, and callers
    // silently disagree about what that means — server.js defaulted to 'editor'
    // (so a viewer's key got write access) while routes/audit.js defaulted to
    // 'viewer' (so the documented `audit:read` scope was unusable). Resolve the
    // real role here, exactly as session auth does in auth/session.js.
    `SELECT ak.id AS api_key_id, ak.user_id, ak.workspace_id, ak.name AS api_key_name,
            ak.key_hash, ak.scopes,
            u.email, u.name AS user_name, w.name AS workspace_name, w.plan,
            wm.role AS member_role
     FROM api_keys ak
     LEFT JOIN users u ON u.id = ak.user_id
     JOIN workspaces w ON w.id = ak.workspace_id
     LEFT JOIN workspace_members wm
       ON wm.workspace_id = ak.workspace_id AND wm.user_id = ak.user_id
     WHERE ak.key_prefix = $1
       AND ak.revoked_at IS NULL
       AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
    [prefix]
  );

  if (!rows.length) {
    await auditLog({
      action: 'api_key.auth_failed',
      metadata: { reason: 'prefix_not_found', prefix },
      ip,
      userAgent,
    });
    return null;
  }

  const row = rows[0];
  let expectedHash;
  try {
    expectedHash = hashApiKey(token);
  } catch {
    return null; // pepper not configured — server boot check should have caught this
  }

  const storedBuf   = Buffer.from(row.key_hash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const valid = storedBuf.length === expectedBuf.length && timingSafeEqual(storedBuf, expectedBuf);

  if (!valid) {
    await auditLog({
      workspaceId: row.workspace_id,
      action: 'api_key.auth_failed',
      metadata: { reason: 'hash_mismatch', prefix },
      ip,
      userAgent,
    });
    return null;
  }

  // Best-effort update — never crash on this
  db.query(
    'UPDATE api_keys SET last_used_at = NOW(), last_used_ip = $2 WHERE id = $1',
    [row.api_key_id, ip]
  ).catch(() => {});

  if (shouldAuditUse(row.api_key_id)) {
    auditLog({
      workspaceId: row.workspace_id,
      userId: row.user_id,
      action: 'api_key.used',
      resourceType: 'api_key',
      resourceId: row.api_key_id,
      metadata: { path: req.url, method: req.method },
      ip,
      userAgent,
    });
  }

  return {
    authMethod: 'api_key',
    apiKeyId: row.api_key_id,
    apiKeyName: row.api_key_name,
    // Default-DENY: a key row with no scopes grants nothing (reissue such keys).
    // A full-access key must carry an explicit ['*'].
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    // An API key can never exceed the role of the user who owns it. Fall back to
    // 'viewer' (least privilege) when the owner has no membership row, rather than
    // letting each caller invent its own default.
    role: row.member_role ?? 'viewer',
    userId: row.user_id,
    workspaceId: row.workspace_id,
    user: row.user_id ? { id: row.user_id, email: row.email, name: row.user_name } : null,
    workspace: { id: row.workspace_id, name: row.workspace_name, plan: row.plan },
  };
}
