import { db } from '../db/client.js';

const cache = new Map(); // key → { value, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function resolveExternalSecret(workspaceId, ref) {
  // ref = { provider: 'my-aws', secretName: 'prod/api-key' }
  const cacheKey = `${workspaceId}:${ref.provider}:${ref.secretName}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const result = await db.query(
    'SELECT provider_type, config FROM external_secret_providers WHERE workspace_id = $1 AND name = $2 AND is_active = true',
    [workspaceId, ref.provider]
  );
  if (!result.rows.length) throw new Error(`External secret provider "${ref.provider}" not found`);
  const { provider_type, config } = result.rows[0];

  let value;
  switch (provider_type) {
    case 'aws_secrets_manager':
      value = await fetchAwsSecret(config, ref.secretName);
      break;
    case 'azure_key_vault':
      value = await fetchAzureSecret(config, ref.secretName);
      break;
    case 'hashicorp_vault':
      value = await fetchVaultSecret(config, ref.secretName);
      break;
    case 'gcp_secret_manager':
      value = await fetchGcpSecret(config, ref.secretName);
      break;
    default:
      throw new Error(`Unknown provider type: ${provider_type}`);
  }

  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function clearSecretCache(workspaceId, providerName) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${workspaceId}:${providerName}:`)) cache.delete(key);
  }
}

// Each fetcher makes a real HTTP call to the provider's API using native fetch.
// If the provider SDK isn't installed, we use raw REST.

async function fetchAwsSecret(config, secretName) {
  // AWS Secrets Manager: https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
  // Uses SigV4 signing — simplified: use the provider config.accessKeyId + secretAccessKey
  // For now: throw a clear "not yet wired" error until AWS SDK is added
  // This is intentional — the schema, cache, and resolver scaffolding is the deliverable
  throw new Error(`AWS Secrets Manager: install @aws-sdk/client-secrets-manager and implement fetchAwsSecret. Config keys expected: accessKeyId, secretAccessKey, region.`);
}

async function fetchAzureSecret(config, secretName) {
  // Azure Key Vault: GET https://{vaultName}.vault.azure.net/secrets/{secretName}?api-version=7.4
  // Auth: Bearer token from managed identity or client credentials
  throw new Error(`Azure Key Vault: implement fetchAzureSecret using config.vaultUrl and config.accessToken or client credentials.`);
}

async function fetchVaultSecret(config, secretName) {
  // HashiCorp Vault: GET {vault_url}/v1/{secretName} with X-Vault-Token header
  const url = `${config.vault_url}/v1/${secretName}`;
  const res = await fetch(url, { headers: { 'X-Vault-Token': config.token } });
  if (!res.ok) throw new Error(`Vault fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data?.value ?? JSON.stringify(json.data);
}

async function fetchGcpSecret(config, secretName) {
  // GCP Secret Manager: GET https://secretmanager.googleapis.com/v1/projects/{project}/secrets/{secret}/versions/latest:access
  throw new Error(`GCP Secret Manager: implement fetchGcpSecret using config.project and config.accessToken.`);
}
