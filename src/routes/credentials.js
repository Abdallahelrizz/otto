import pg from 'pg';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import { db } from '../db/client.js';
import { getCredential } from '../engine/credentials.js';
import { encryptCredential } from '../utils/encrypt.js';
import { auditLog } from '../utils/audit.js';
import { redactString, credentialSecrets } from '../utils/redact.js';
import { safeFetch } from '../utils/safe-fetch.js';

const { Pool } = pg;

// Maps n8n-style catalog IDs → canonical short types that the engine understands.
// Applied at save time so stored credentials always use canonical types.
const CATALOG_TO_CANONICAL = {
  // AI providers
  openAiApi:        'openai',
  anthropicApi:     'anthropic',
  openRouterApi:    'openrouter',
  // HTTP auth
  httpHeaderAuth:   'api_key',
  httpBearerAuth:   'bearer_token',
  httpBasicAuth:    'basic',
  httpBasicAuthApi: 'basic',
  httpDigestAuth:   'basic',
  // Email
  resendApi:        'resend',
  // Cloud
  aws:              's3',
  awsS3:            's3',
  // Integration services → generic type that matches node hints
  slackApi:         'api_key',
  slackOAuth2Api:   'bearer_token',
  discordWebhookApi: 'bearer_token',
  discordBotApi:    'api_key',
  telegramApi:      'api_key',
  githubApi:        'api_key',
  githubOAuth2Api:  'bearer_token',
  notionApi:        'api_key',
  notionOAuth2Api:  'bearer_token',
  airtableApi:      'api_key',
  airtableTokenApi: 'api_key',
  stripeApi:        'api_key',
  sendGridApi:      'api_key',
  twilioApi:        'api_key',
  salesforceOAuth2Api: 'bearer_token',
  hubspotApi:       'api_key',
  hubspotOAuth2Api: 'bearer_token',
  linearApi:        'api_key',
  oAuth2Api:        'bearer_token',
  oauthApi:         'bearer_token',
};

// Known canonical short types that we actually validate / test
const KNOWN_CANONICAL_TYPES = new Set([
  'api_key', 'bearer_token', 'basic', 'openai', 'anthropic', 'openrouter',
  'postgres', 'redis', 's3', 'resend', 'smtp',
]);

function normalizeType(type) {
  const value = String(type ?? '').trim();
  // Catalog ID → canonical
  if (CATALOG_TO_CANONICAL[value]) return CATALOG_TO_CANONICAL[value];
  // Legacy aliases
  if (value === 'basic_auth') return 'basic';
  if (value === 'bearer') return 'bearer_token';
  // Unknown catalog IDs default to api_key (generic) rather than passing through raw
  if (!KNOWN_CANONICAL_TYPES.has(value) && value.length > 0) {
    // Preserve postgres/redis/smtp/s3 even if they come in exactly as-is
    if (['postgres', 'redis', 'smtp', 's3'].includes(value)) return value;
    return 'api_key';
  }
  return value;
}

function normalizeData(type, data) {
  const source = data && typeof data === 'object' ? data : {};
  const value = source.value ?? source.key ?? source.apiKey ?? '';

  if (type === 'api_key') {
    // Catalog forms use various field names — normalise them all
    const apiValue = String(
      source.value ?? source.key ?? source.apiKey ?? source.api_key ??
      source.token ?? source.access_token ?? source.accessToken ?? ''
    );
    return { header: String(source.header ?? 'Authorization'), value: apiValue };
  }
  if (type === 'bearer_token') {
    const raw = String(
      source.value ?? source.key ?? source.apiKey ?? source.token ??
      source.access_token ?? source.accessToken ?? ''
    );
    return { value: raw.replace(/^Bearer\s+/i, '') };
  }
  if (type === 'basic') {
    return {
      username: String(source.username ?? source.user ?? ''),
      password: String(source.password ?? source.pass ?? ''),
    };
  }
  if (['openai', 'anthropic', 'openrouter'].includes(type)) {
    return {
      value: String(
        source.value ?? source.key ?? source.apiKey ?? source.api_key ??
        source.token ?? ''
      )
    };
  }
  if (type === 'postgres') {
    // Accept a ready-made connection string, or build one from individual fields
    if (source.connectionString) return { connectionString: String(source.connectionString) };
    const host = String(source.host ?? 'localhost');
    const port = String(source.port ?? '5432');
    const database = String(source.database ?? source.db ?? '');
    const user = String(source.user ?? source.username ?? '');
    const password = String(source.password ?? source.pass ?? '');
    const encoded = encodeURIComponent(password);
    return { connectionString: `postgresql://${user}:${encoded}@${host}:${port}/${database}` };
  }
  if (type === 'redis') {
    if (source.url) return { url: String(source.url) };
    const host = String(source.host ?? 'localhost');
    const port = String(source.port ?? '6379');
    const password = source.password ?? source.pass ?? null;
    const auth = password ? `:${encodeURIComponent(String(password))}@` : '';
    return { url: `redis://${auth}${host}:${port}` };
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
    // Use safeFetch to prevent SSRF — blocks private/reserved IP ranges before the request is made.
    const response = await safeFetch(testUrl, { method: 'GET', headers, signal: controller.signal });
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

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let _catalog = null;
async function getCatalog() {
  if (!_catalog) {
    const catalogPath = path.resolve(__dirname, '../../public/credential-catalog.json');
    const raw = await readFile(catalogPath, 'utf-8');
    const entries = JSON.parse(raw);
    _catalog = new Map(entries.map(e => [e.id, e]));
  }
  return _catalog;
}

export async function credentialRoutes(fastify) {
  fastify.get('/api/v1/credentials/schema/:type', async (req, reply) => {
    const catalog = await getCatalog().catch(() => null);
    if (!catalog) return reply.code(503).send({ error: 'Credential catalog unavailable' });

    const type = req.params.type;
    const entry = catalog.get(type);
    if (!entry) return reply.code(404).send({ error: `Unknown credential type: ${type}` });

    // Return schema without svgContent (it's large and only needed for the UI)
    const { svgContent: _svg, ...schema } = entry;
    return reply.send({ schema });
  });

  fastify.post('/api/v1/credentials', async (req, reply) => {
    const { name, type, data } = req.body ?? {};
    const normalizedType = normalizeType(type);
    if (!name) return reply.code(400).send({ error: 'name is required' });
    if (!normalizedType) return reply.code(400).send({ error: 'type is required' });
    if (!data || typeof data !== 'object') return reply.code(400).send({ error: 'data must be an object' });

    const normalizedData = normalizeData(normalizedType, data);
    const validationError = validateCredentialData(normalizedType, normalizedData);
    if (validationError) return reply.code(400).send({ error: validationError });

    let encrypted;
    try {
      encrypted = encryptCredential(normalizedData);
    } catch (err) {
      req.log.error({ err }, 'credential encryption failed');
      return reply.code(500).send({ error: 'Credential could not be encrypted. Check that CREDENTIAL_ENCRYPTION_KEY is set.' });
    }

    let rows;
    try {
      ({ rows } = await db.query(
        `INSERT INTO credentials (workspace_id, name, type, data)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, type, created_at`,
        [req.auth.workspaceId, name, normalizedType, JSON.stringify(encrypted)]
      ));
    } catch (err) {
      req.log.error({ err }, 'credential insert failed');
      if (err.code === '23505') {
        return reply.code(409).send({ error: `A credential named "${name}" already exists in this workspace.` });
      }
      return reply.code(500).send({ error: 'Failed to save credential. Check the server logs for details.' });
    }

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
      req.log.error({ err }, 'credential test failed');
      // Redact any secret (e.g. password embedded in a connection-string error)
      return reply.send({
        ok: false,
        checked: credential.type,
        error: redactString(err.message, credentialSecrets(credential)),
      });
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
