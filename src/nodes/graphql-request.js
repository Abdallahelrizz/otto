import { credentialValue, parseJson, safeRequestJson } from './service-utils.js';

export async function graphqlRequest({ config, credential, signal }) {
  const { endpoint, query } = config;
  if (!endpoint) throw new Error('GraphQL: endpoint is required');
  if (!query) throw new Error('GraphQL: query is required');

  const token = config.token || credentialValue(credential, ['token', 'value', 'apiKey']);
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers[config.authHeader || 'Authorization'] = String(token).startsWith('Bearer ') ? token : `Bearer ${token}`;

  const result = await safeRequestJson(String(endpoint), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      variables: parseJson(config.variablesJson, {}),
    }),
    signal,
  });

  if (result.body?.errors?.length) {
    // SECURITY: remote GraphQL errors can echo authorization values into persisted errors.
    throw new Error('GraphQL: request returned errors');
  }

  return result.body;
}
