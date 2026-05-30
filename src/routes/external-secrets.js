import { db } from '../db/client.js';
import { clearSecretCache } from '../utils/external-secrets.js';

const VALID_PROVIDER_TYPES = new Set([
  'aws_secrets_manager',
  'azure_key_vault',
  'hashicorp_vault',
  'gcp_secret_manager',
]);

// Strip sensitive config keys from a provider row before returning it to the client
function sanitizeProvider(row) {
  const { config, ...rest } = row;
  const safeConfig = { ...config };
  // Remove common secret fields
  for (const key of ['token', 'accessKeyId', 'secretAccessKey', 'accessToken', 'clientSecret']) {
    if (safeConfig[key] !== undefined) safeConfig[key] = '***';
  }
  return { ...rest, config: safeConfig };
}

export async function externalSecretRoutes(fastify) {
  // GET /api/v1/external-secrets/providers — list providers (no secrets in response)
  fastify.get('/api/v1/external-secrets/providers', async (req, reply) => {
    const workspaceId = req.auth.workspaceId;
    const { rows } = await db.query(
      'SELECT id, workspace_id, name, provider_type, config, is_active, created_at, updated_at FROM external_secret_providers WHERE workspace_id = $1 ORDER BY name',
      [workspaceId]
    );
    return reply.send({ providers: rows.map(sanitizeProvider) });
  });

  // POST /api/v1/external-secrets/providers — create provider
  fastify.post('/api/v1/external-secrets/providers', async (req, reply) => {
    const workspaceId = req.auth.workspaceId;
    const { name, provider_type, config = {} } = req.body ?? {};

    if (!name || typeof name !== 'string' || !name.trim()) {
      return reply.status(400).send({ error: 'name is required' });
    }
    if (!provider_type || !VALID_PROVIDER_TYPES.has(provider_type)) {
      return reply.status(400).send({
        error: `provider_type must be one of: ${[...VALID_PROVIDER_TYPES].join(', ')}`,
      });
    }

    const { rows } = await db.query(
      `INSERT INTO external_secret_providers (workspace_id, name, provider_type, config)
       VALUES ($1, $2, $3, $4)
       RETURNING id, workspace_id, name, provider_type, config, is_active, created_at, updated_at`,
      [workspaceId, name.trim(), provider_type, JSON.stringify(config)]
    );
    return reply.status(201).send({ provider: sanitizeProvider(rows[0]) });
  });

  // PUT /api/v1/external-secrets/providers/:id — update provider
  fastify.put('/api/v1/external-secrets/providers/:id', async (req, reply) => {
    const workspaceId = req.auth.workspaceId;
    const providerId = parseInt(req.params.id, 10);
    if (!Number.isFinite(providerId)) return reply.status(400).send({ error: 'Invalid provider id' });

    const { name, config, is_active } = req.body ?? {};

    // Verify ownership
    const existing = await db.query(
      'SELECT id, name FROM external_secret_providers WHERE id = $1 AND workspace_id = $2',
      [providerId, workspaceId]
    );
    if (!existing.rows.length) return reply.status(404).send({ error: 'Provider not found' });

    const setParts = [];
    const params = [];

    if (name !== undefined) {
      params.push(name.trim());
      setParts.push(`name = $${params.length}`);
    }
    if (config !== undefined) {
      params.push(JSON.stringify(config));
      setParts.push(`config = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(Boolean(is_active));
      setParts.push(`is_active = $${params.length}`);
    }

    if (setParts.length === 0) return reply.status(400).send({ error: 'No fields to update' });

    setParts.push(`updated_at = now()`);
    params.push(providerId);
    params.push(workspaceId);

    const { rows } = await db.query(
      `UPDATE external_secret_providers SET ${setParts.join(', ')}
       WHERE id = $${params.length - 1} AND workspace_id = $${params.length}
       RETURNING id, workspace_id, name, provider_type, config, is_active, created_at, updated_at`,
      params
    );

    // Clear cache for the original provider name in case it changed
    clearSecretCache(workspaceId, existing.rows[0].name);
    if (name && name.trim() !== existing.rows[0].name) {
      clearSecretCache(workspaceId, name.trim());
    }

    return reply.send({ provider: sanitizeProvider(rows[0]) });
  });

  // DELETE /api/v1/external-secrets/providers/:id — delete provider
  fastify.delete('/api/v1/external-secrets/providers/:id', async (req, reply) => {
    const workspaceId = req.auth.workspaceId;
    const providerId = parseInt(req.params.id, 10);
    if (!Number.isFinite(providerId)) return reply.status(400).send({ error: 'Invalid provider id' });

    const existing = await db.query(
      'SELECT id, name FROM external_secret_providers WHERE id = $1 AND workspace_id = $2',
      [providerId, workspaceId]
    );
    if (!existing.rows.length) return reply.status(404).send({ error: 'Provider not found' });

    await db.query(
      'DELETE FROM external_secret_providers WHERE id = $1 AND workspace_id = $2',
      [providerId, workspaceId]
    );

    clearSecretCache(workspaceId, existing.rows[0].name);
    return reply.status(204).send();
  });

  // POST /api/v1/external-secrets/providers/:id/test — test connection
  fastify.post('/api/v1/external-secrets/providers/:id/test', async (req, reply) => {
    const workspaceId = req.auth.workspaceId;
    const providerId = parseInt(req.params.id, 10);
    if (!Number.isFinite(providerId)) return reply.status(400).send({ error: 'Invalid provider id' });

    const { secretName } = req.body ?? {};
    if (!secretName || typeof secretName !== 'string') {
      return reply.status(400).send({ error: 'secretName is required' });
    }

    const existing = await db.query(
      'SELECT id, name FROM external_secret_providers WHERE id = $1 AND workspace_id = $2',
      [providerId, workspaceId]
    );
    if (!existing.rows.length) return reply.status(404).send({ error: 'Provider not found' });

    try {
      const { resolveExternalSecret } = await import('../utils/external-secrets.js');
      await resolveExternalSecret(workspaceId, { provider: existing.rows[0].name, secretName });
      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err }, 'external secret test failed');
      return reply.send({ ok: false, error: 'Secret provider test failed' });
    }
  });
}
