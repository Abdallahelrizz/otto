import { getCredential } from '../engine/credentials.js';
import { safeRequestJson } from './service-utils.js';

const HS_BASE = 'https://api.hubapi.com';

export async function hubspotApi({ config, input, workspaceId }) {
  const cred = await getCredential(config.credentialId, { workspaceId });
  const token = cred.data.accessToken ?? cred.data.token;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const op = config.operation ?? 'list_contacts';
  switch (op) {
    case 'list_contacts': {
      const limit = config.limit ?? 10;
      return safeRequestJson(`${HS_BASE}/crm/v3/objects/contacts?limit=${limit}`, { headers });
    }
    case 'get_contact': {
      const contactId = config.contactId ?? input.id;
      return safeRequestJson(`${HS_BASE}/crm/v3/objects/contacts/${contactId}`, { headers });
    }
    case 'create_contact': {
      const properties = config.properties ? JSON.parse(config.properties) : input;
      return safeRequestJson(`${HS_BASE}/crm/v3/objects/contacts`, { method: 'POST', headers, body: JSON.stringify({ properties }) });
    }
    case 'update_contact': {
      const contactId = config.contactId ?? input.id;
      const properties = config.properties ? JSON.parse(config.properties) : input;
      return safeRequestJson(`${HS_BASE}/crm/v3/objects/contacts/${contactId}`, { method: 'PATCH', headers, body: JSON.stringify({ properties }) });
    }
    case 'create_deal': {
      const properties = config.dealProperties ? JSON.parse(config.dealProperties) : input;
      return safeRequestJson(`${HS_BASE}/crm/v3/objects/deals`, { method: 'POST', headers, body: JSON.stringify({ properties }) });
    }
    case 'list_deals': {
      const limit = config.limit ?? 10;
      return safeRequestJson(`${HS_BASE}/crm/v3/objects/deals?limit=${limit}`, { headers });
    }
    default:
      throw new Error(`Unknown HubSpot operation: ${op}`);
  }
}
