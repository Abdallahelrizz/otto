import { getCredential } from '../engine/credentials.js';
import { safeRequestJson } from './service-utils.js';

const SF_API_VERSION = 'v59.0';

export async function salesforceApi({ config, input, workspaceId, signal }) {
  const cred = await getCredential(config.credentialId, { workspaceId });
  const instanceUrl = cred.data.instanceUrl ?? config.instanceUrl; // e.g. https://myorg.salesforce.com
  const token = cred.data.accessToken ?? cred.data.token;
  const base = `${instanceUrl}/services/data/${SF_API_VERSION}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const op = config.operation ?? 'query';
  switch (op) {
    case 'query': {
      // SOQL query
      const soql = config.soql ?? 'SELECT Id, Name FROM Account LIMIT 10';
      return safeRequestJson(`${base}/query?q=${encodeURIComponent(soql)}`, { headers, signal });
    }
    case 'get_record': {
      const sobject = config.sobject ?? 'Account';
      const recordId = config.recordId ?? input.id;
      return safeRequestJson(`${base}/sobjects/${sobject}/${recordId}`, { headers, signal });
    }
    case 'create_record': {
      const sobject = config.sobject ?? 'Account';
      const fields = config.fields ? JSON.parse(config.fields) : input;
      return safeRequestJson(`${base}/sobjects/${sobject}`, { method: 'POST', headers, body: JSON.stringify(fields), signal });
    }
    case 'update_record': {
      const sobject = config.sobject ?? 'Account';
      const recordId = config.recordId ?? input.id;
      const fields = config.fields ? JSON.parse(config.fields) : input;
      await safeRequestJson(`${base}/sobjects/${sobject}/${recordId}`, { method: 'PATCH', headers, body: JSON.stringify(fields), signal });
      return { updated: true, id: recordId };
    }
    case 'delete_record': {
      const sobject = config.sobject ?? 'Account';
      const recordId = config.recordId ?? input.id;
      await safeRequestJson(`${base}/sobjects/${sobject}/${recordId}`, { method: 'DELETE', headers, signal });
      return { deleted: true, id: recordId };
    }
    default:
      throw new Error(`Unknown Salesforce operation: ${op}`);
  }
}
