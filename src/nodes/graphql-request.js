import { credentialValue, parseJson, safeRequestJson } from './service-utils.js';

export async function graphqlRequest({ config, credential }) {
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
  });

  if (result.body?.errors?.length) {
    throw new Error(`GraphQL: ${result.body.errors[0].message ?? 'request failed'}`);
  }

  return result.body;
}
