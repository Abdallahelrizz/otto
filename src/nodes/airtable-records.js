import { bearerHeaders, credentialValue, parseJson, requestJson } from './service-utils.js';

export async function airtableRecords({ config, credential }) {
  const token = config.token || credentialValue(credential, ['token', 'value', 'apiKey']);
  const {
    operation = 'list',
    baseId,
    tableName,
    recordId,
  } = config;
  if (!baseId) throw new Error('Airtable: baseId is required');
  if (!tableName) throw new Error('Airtable: tableName is required');

  const tablePath = encodeURIComponent(String(tableName));
  const base = `https://api.airtable.com/v0/${baseId}/${tablePath}`;
  let url = base;
  let method = 'GET';
  let body = null;

  switch (operation) {
    case 'list': {
      const params = new URLSearchParams();
      if (config.maxRecords) params.set('maxRecords', String(config.maxRecords));
      if (config.filterByFormula) params.set('filterByFormula', String(config.filterByFormula));
      const qs = params.toString();
      if (qs) url += `?${qs}`;
      break;
    }

    case 'get': {
      if (!recordId) throw new Error('Airtable get: recordId is required');
      url = `${base}/${recordId}`;
      method = 'GET';
      break;
    }

    case 'create': {
      method = 'POST';
      body = { fields: parseJson(config.fieldsJson, {}) };
      break;
    }

    case 'update': {
      if (!recordId) throw new Error('Airtable update: recordId is required');
      method = 'PATCH';
      url = `${base}/${recordId}`;
      body = { fields: parseJson(config.fieldsJson, {}) };
      break;
    }

    case 'delete': {
      if (!recordId) throw new Error('Airtable delete: recordId is required');
      method = 'DELETE';
      url = `${base}/${recordId}`;
      break;
    }

    case 'bulk_create': {
      method = 'POST';
      url = `${base}/bulk`;
      const recordsArray = parseJson(config.recordsJson, []);
      body = { records: recordsArray.map(fields => ({ fields })) };
      break;
    }

    case 'bulk_update': {
      method = 'PATCH';
      url = `${base}/bulk`;
      const recordsArray = parseJson(config.recordsJson, []);
      body = { records: recordsArray };
      break;
    }

    default:
      throw new Error(`Airtable: unknown operation "${operation}"`);
  }

  return requestJson(url, {
    method,
    headers: bearerHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
}
