import pg from 'pg';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import { db } from '../db/client.js';
import { getCredential } from '../engine/credentials.js';
import { encryptCredential } from '../utils/encrypt.js';
import { auditLog } from '../utils/audit.js';

const { Pool } = pg;

function normalizeType(type) {
  const value = String(type ?? '').trim();
  if (value === 'basic_auth') return 'basic';
  if (value === 'bearer') return 'bearer_token';
  return value;
}

function normalizeData(type, data) {
  const source = data && typeof data === 'object' ? data : {};
  const value = source.value ?? source.key ?? source.apiKey ?? '';

  if (type === 'api_key') {
    return { header: source.header || 'Authorization', value: String(value) };
  }
  if (type === 'bearer_token') {
    const token = String(value).replace(/^Bearer\s+/i, '');
    return { value: token };
  }
  if (type === 'basic') {
    return { username: String(source.username ?? ''), password: String(source.password ?? '') };
  }
  if (['openai', 'anthropic', 'openrouter'].includes(type)) {
    return { value: String(value) };
  }
  if (type === 'postgres') {
    return { connectionString: String(source.connectionString ?? value) };
  }
  if (type === 'redis') {
    return { url: String(source.url ?? value) };
  }
  if (type === 's3') {
    return {
      accessKeyId: String(source.accessKeyId ?? source.key ?? source.apiKey ?? ''),
      secretAccessKey: String(source.secretAccessKey ?? source.secret ?? source.password ?? ''),
      sessionToken: String(source.sessionToken ?? ''),
      region: String(source.region ?? 'us-east-1'),
      endpoint: String(source.endpoint ?? ''),
      bucket: String(source.bucket ?? ''),
      forcePathStyle: String(source.forcePathStyle ?? 'true'),
    };
  }
  if (type === 'resend') {
    return { provider: 'resend', apiKey: String(source.apiKey ?? value), value: String(source.apiKey ?? value) };
  }
  if (type === 'smtp') {
    return {
      provider: 'smtp',
      host: String(source.host ?? ''),
      port: String(source.port ?? '587'),
      user: String(source.user ?? ''),
      pass: String(source.pass ?? source.password ?? ''),
    };
  }

  return Object.fromEntries(Object.entries(source).map(([key, val]) => [key, String(val ?? '')]));
}

function validateCredentialData(type, data) {
  if (type === 'api_key' && !data.value) return 'API key value is required';
  if (type === 'bearer_token' && !data.value) return 'Bearer token is required';
  if (type === 'basic' && (!data.username || !data.password)) return 'Username and password are required';
  if (['openai', 'anthropic', 'openrouter'].includes(type) && !data.value) return 'API key value is required';
  if (type === 'postgres' && !data.connectionString) return 'Postgres connection string is required';
  if (type === 'redis' && !data.url) return 'Redis URL is required';
  if (type === 's3' && (!data.accessKeyId || !data.secretAccessKey)) return 'S3 access key and secret are required';
  if (type === 'resend' && !data.apiKey) return 'Resend API key is required';
  if (type === 'smtp' && (!data.host || !data.user || !data.pass)) return 'SMTP host, user, and password are required';
  return null;
}

async function testHttpCredential(credential, testUrl) {
  if (!testUrl) return { ok: true, checked: 'shape' };

  const headers = {};
  if (credential.type === 'api_key') headers[credential.data.header ?? 'Authorization'] = credential.data.value;
  if (credential.type === 'bearer_token') headers.Authorization = `Bearer ${credential.data.value}`;
  if (credential.type === 'basic') {
    headers.Authorization = `Basic ${Buffer.from(`${credential.data.username}:${credential.data.password}`).toString('base64')}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(testUrl, { method: 'GET', headers, signal: controller.signal });
    return { ok: response.ok, checked: 'http', status: response.status };
  } finally {
    clearTimeout(timer);
  }
}

async function testCredential(credential, body = {}) {
  const { type, data } = credential;
  const shapeError = validateCredentialData(type, data);
  if (shapeError) return { ok: false, checked: 'shape', error: shapeError };

  if (['api_key', 'bearer_token', 'basic'].includes(type)) {
    return testHttpCredential(credential, body.testUrl);
  }

  if (type === 'postgres') {
    const pool = new Pool({ connectionString: data.connectionString, max: 1, connectionTimeoutMillis: 5000 });
    try {
      await pool.query('SELECT 1 AS ok');
      return { ok: true, checked: 'postgres' };
    } finally {
      await pool.end().catch(() => {});
    }
  }

  if (type === 'redis') {
    const client = new Redis(data.url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 5000 });
    try {
      await client.connect();
      const pong = await client.ping();
      return { ok: pong === 'PONG', checked: 'redis' };
    } finally {
      client.disconnect();
    }
  }

  if (type === 's3') {
    return { ok: true, checked: 'shape' };
  }

  if (type === 'smtp' || type === 'resend') {
    const transporter = type === 'resend'
      ? nodemailer.createTransport({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: { user: 'resend', pass: data.apiKey },
      })
      : nodemailer.createTransport({
        host: data.host,
        port: Number(data.port ?? 587),
        secure: Number(data.port) === 465,
        auth: { user: data.user, pass: data.pass },
      });
    await transporter.verify();
    return { ok: true, checked: type };
  }

  return { ok: true, checked: 'shape' };
}

export async function credentialRoutes(fastify) {
  fastify.post('/api/v1/credentials', async (req, reply) => {
    const { name, type, data } = req.body ?? {};
    const normalizedType = normalizeType(type);
    if (!name) return reply.code(400).send({ error: 'name is required' });
    if (!normalizedType) return reply.code(400).send({ error: 'type is required' });
    if (!data || typeof data !== 'object') return reply.code(400).send({ error: 'data must be an object' });

    const normalizedData = normalizeData(normalizedType, data);
    const validationError = validateCredentialData(normalizedType, normalizedData);
    if (validationError) return reply.code(400).send({ error: validationError });

    const encrypted = encryptCredential(normalizedData);

    const { rows } = await db.query(
      `INSERT INTO credentials (workspace_id, name, type, data)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, type, created_at`,
      [req.auth.workspaceId, name, normalizedType, JSON.stringify(encrypted)]
    );
    await auditLog({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.userId,
      action: 'credential.create',
      resourceType: 'credential',
      resourceId: rows[0].id,
      metadata: { name, type: normalizedType },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.code(201).send(rows[0]);
  });

  fastify.get('/api/v1/credentials', async (req, reply) => {
    const { rows } = await db.query(
      `SELECT id, name, type, created_at
       FROM credentials
       WHERE workspace_id = $1
       ORDER BY name ASC`,
      [req.auth.workspaceId]
    );
    return reply.send({ credentials: rows });
  });

  fastify.put('/api/v1/credentials/:id', async (req, reply) => {
    const { id } = req.params;
    const { name, type, data } = req.body ?? {};

    const setParts = [];
    const params = [];

    if (name !== undefined) {
      const nextName = String(name).trim();
      if (!nextName) return reply.code(400).send({ error: 'name is required' });
      params.push(nextName);
      setParts.push(`name = $${params.length}`);
    }

    let normalizedType = null;
    if (type !== undefined) {
      normalizedType = normalizeType(type);
      if (!normalizedType) return reply.code(400).send({ error: 'type is required' });
      params.push(normalizedType);
      setParts.push(`type = $${params.length}`);
    }

    if (data !== undefined) {
      if (!data || typeof data !== 'object') return reply.code(400).send({ error: 'data must be an object' });
      if (!normalizedType) {
        const current = await db.query(
          'SELECT type FROM credentials WHERE id = $1 AND workspace_id = $2',
          [id, req.auth.workspaceId]
        );
        if (!current.rows.length) return reply.code(404).send({ error: 'Credential not found' });
        normalizedType = current.rows[0].type;
      }
      const normalizedData = normalizeData(normalizedType, data);
      const validationError = validateCredentialData(normalizedType, normalizedData);
      if (validationError) return reply.code(400).send({ error: validationError });
      params.push(JSON.stringify(encryptCredential(normalizedData)));
      setParts.push(`data = $${params.length}`);
    }

    if (!setParts.length) return reply.code(400).send({ error: 'No changes provided' });

    params.push(id, req.auth.workspaceId);
    const { rows } = await db.query(
      `UPDATE credentials
       SET ${setParts.join(', ')}
       WHERE id = $${params.length - 1} AND workspace_id = $${params.length}
       RETURNING id, name, type, created_at`,
      params
    );
    if (!rows.length) return reply.code(404).send({ error: 'Credential not found' });
    return reply.send(rows[0]);
  });

  fastify.post('/api/v1/credentials/:id/test', async (req, reply) => {
    const credential = await getCredential(req.params.id, {
      workspaceId: req.auth.workspaceId,
      nodeId: 'credential-test',
    });

    try {
      const result = await testCredential(credential, req.body ?? {});
      return reply.send(result);
    } catch (err) {
      return reply.send({ ok: false, checked: credential.type, error: err.message });
    }
  });

  fastify.delete('/api/v1/credentials/:id', async (req, reply) => {
    const { rows } = await db.query(
      'DELETE FROM credentials WHERE id = $1 AND workspace_id = $2 RETURNING id, name, type',
      [req.params.id, req.auth.workspaceId]
    );
    if (!rows.length) return reply.code(404).send({ error: 'Credential not found' });
    await auditLog({
      workspaceId: req.auth.workspaceId,
      userId: req.auth.userId,
      action: 'credential.delete',
      resourceType: 'credential',
      resourceId: rows[0].id,
      metadata: { name: rows[0].name, type: rows[0].type },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return reply.send({ ok: true });
  });
}
