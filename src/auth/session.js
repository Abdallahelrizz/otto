import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';
import { db } from '../db/client.js';

const scrypt = promisify(scryptCb);

const COOKIE_NAME = 'otto_session';
const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 7);
const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

function base64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        if (idx === -1) return [part, ''];
        try {
          return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
        } catch {
          // A malformed percent escape previously turned an unauthenticated cookie into a 500.
          return [part.slice(0, idx), ''];
        }
      })
  );
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  const secure = process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true';
  return [
    `${COOKIE_NAME}=`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : null,
  ].filter(Boolean);
}

export function setSessionCookie(reply, token) {
  const parts = cookieOptions();
  parts[0] = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  reply.header('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(reply) {
  reply.header('Set-Cookie', cookieOptions(0).join('; '));
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${base64url(salt)}$${base64url(derived)}`;
}

export async function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.startsWith('scrypt$')) return false;
  const parts = storedHash.split('$');
  if (parts.length !== 3 || !parts[1] || !parts[2]) return false;
  const [, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  // Malformed hashes previously controlled scrypt's output allocation and could throw.
  if (salt.length !== 16 || expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function hasConfiguredOwner() {
  const { rows } = await db.query(
    'SELECT EXISTS (SELECT 1 FROM users WHERE password_hash IS NOT NULL) AS configured'
  );
  return Boolean(rows[0]?.configured);
}

export async function createSession({ userId, workspaceId }) {
  const token = base64url(randomBytes(32));
  const tokenHash = hashToken(token);
  const { rows } = await db.query(
    `INSERT INTO sessions (user_id, workspace_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4::TEXT || ' days')::INTERVAL)
     RETURNING id`,
    [userId, workspaceId, tokenHash, String(SESSION_DAYS)]
  );
  return { token, sessionId: rows[0].id };
}

export async function destroySession(token) {
  if (!token) return;
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export function readSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie ?? '');
  return cookies[COOKIE_NAME] ?? null;
}

export async function getAuthContext(req) {
  const token = readSessionToken(req);
  if (!token) return null;

  const { rows } = await db.query(
    `SELECT s.id AS session_id, s.user_id, s.workspace_id, u.email, u.name,
            w.name AS workspace_name, w.plan, w.ottobot_settings,
            wm.role AS member_role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN workspaces w ON w.id = s.workspace_id
     -- A removed member's surviving session previously fell back to owner privileges.
     JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.user_id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashToken(token)]
  );

  if (!rows.length) return null;

  await db.query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [rows[0].session_id]).catch(() => {});

  return {
    authMethod: 'session',
    sessionId: rows[0].session_id,
    userId: rows[0].user_id,
    workspaceId: rows[0].workspace_id,
    role: rows[0].member_role,
    user: { id: rows[0].user_id, email: rows[0].email, name: rows[0].name },
    workspace: { id: rows[0].workspace_id, name: rows[0].workspace_name, plan: rows[0].plan, ottobot_settings: rows[0].ottobot_settings },
  };
}

export async function requireAuth(req, reply) {
  const auth = await getAuthContext(req);
  if (!auth) {
    return reply.code(401).send({ error: 'Authentication required' });
  }
  req.auth = auth;
}

export async function cleanupExpiredSessions() {
  await db.query('DELETE FROM sessions WHERE expires_at <= NOW()');
}
