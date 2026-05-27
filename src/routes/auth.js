import { db } from '../db/client.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getAuthContext,
  hashPassword,
  hasConfiguredOwner,
  readSessionToken,
  setSessionCookie,
  verifyPassword,
} from '../auth/session.js';

const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

async function createOwnerWorkspace(client, userId, workspaceName) {
  const { rows: demoRows } = await client.query(
    'SELECT id FROM workspaces WHERE id = $1',
    [DEMO_WORKSPACE_ID]
  );

  if (demoRows.length) {
    await client.query('UPDATE workspaces SET owner_id = $1, name = COALESCE(NULLIF(name, $2), $3) WHERE id = $4', [
      userId,
      'Canvas Workspace',
      workspaceName,
      DEMO_WORKSPACE_ID,
    ]);
    await client.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'`,
      [DEMO_WORKSPACE_ID, userId]
    );
    return DEMO_WORKSPACE_ID;
  }

  const { rows } = await client.query(
    'INSERT INTO workspaces (name, owner_id) VALUES ($1, $2) RETURNING id',
    [workspaceName, userId]
  );
  await client.query(
    'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
    [rows[0].id, userId, 'owner']
  );
  return rows[0].id;
}

function authDependencyError(err) {
  return {
    error: 'Database unavailable',
    code: err?.code ?? 'AUTH_DEPENDENCY_UNAVAILABLE',
    setupRequired: null,
    authenticated: false,
  };
}

export async function authRoutes(fastify) {
  fastify.get('/api/v1/auth/status', async (req, reply) => {
    let setupRequired;
    try {
      setupRequired = !(await hasConfiguredOwner());
    } catch (err) {
      req.log.warn({ err }, 'auth status dependency check failed');
      return reply.code(503).send(authDependencyError(err));
    }

    if (setupRequired) {
      return reply.send({ setupRequired, authenticated: false });
    }

    let auth = null;
    try {
      auth = await getAuthContext(req);
    } catch (err) {
      req.log.warn({ err }, 'auth status session lookup failed');
      return reply.code(503).send(authDependencyError(err));
    }

    return reply.send({
      setupRequired,
      authenticated: Boolean(auth),
      user: auth?.user ?? null,
      workspace: auth?.workspace ?? null,
    });
  });

  fastify.post('/api/v1/auth/setup', async (req, reply) => {
    if (await hasConfiguredOwner()) return reply.code(409).send({ error: 'Owner account already exists' });

    const { email, name = '', password, workspaceName = 'Otto Workspace' } = req.body ?? {};
    if (!validateEmail(email)) return reply.code(400).send({ error: 'Valid email is required' });
    if (!validatePassword(password)) return reply.code(400).send({ error: 'Password must be at least 8 characters' });

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const passwordHash = await hashPassword(password);
      const { rows: userRows } = await client.query(
        `INSERT INTO users (email, name, password_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               password_hash = EXCLUDED.password_hash,
               updated_at = NOW()
         RETURNING id, email, name`,
        [email.toLowerCase(), name, passwordHash]
      );
      const workspaceId = await createOwnerWorkspace(client, userRows[0].id, workspaceName);
      await client.query('COMMIT');

      const session = await createSession({ userId: userRows[0].id, workspaceId });
      setSessionCookie(reply, session.token);
      return reply.code(201).send({
        user: userRows[0],
        workspace: { id: workspaceId, name: workspaceName, plan: 'free' },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  fastify.post('/api/v1/auth/login', async (req, reply) => {
    const { email, password } = req.body ?? {};
    if (!validateEmail(email) || typeof password !== 'string') {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const { rows } = await db.query(
      `SELECT u.id, u.email, u.name, u.password_hash, wm.workspace_id, w.name AS workspace_name, w.plan
       FROM users u
       JOIN workspace_members wm ON wm.user_id = u.id
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE u.email = $1 AND u.password_hash IS NOT NULL
       ORDER BY CASE wm.role WHEN 'owner' THEN 0 ELSE 1 END
       LIMIT 1`,
      [email.toLowerCase()]
    );

    if (!rows.length || !(await verifyPassword(password, rows[0].password_hash))) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const session = await createSession({ userId: rows[0].id, workspaceId: rows[0].workspace_id });
    setSessionCookie(reply, session.token);
    return reply.send({
      user: { id: rows[0].id, email: rows[0].email, name: rows[0].name },
      workspace: { id: rows[0].workspace_id, name: rows[0].workspace_name, plan: rows[0].plan },
    });
  });

  fastify.post('/api/v1/auth/logout', async (req, reply) => {
    await destroySession(readSessionToken(req)).catch((err) => {
      req.log.warn({ err }, 'session destroy failed during logout');
    });
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  fastify.get('/api/v1/auth/me', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'Authentication required' });
    return reply.send({ user: req.auth.user, workspace: req.auth.workspace });
  });
}
