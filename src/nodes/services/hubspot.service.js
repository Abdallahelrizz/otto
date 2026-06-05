// src/nodes/services/hubspot.service.js
export default {
  type: 'hubspot_api',
  label: 'HubSpot',
  category: 'integrations',
  serviceColor: '#FF7A59',
  base: 'https://api.hubapi.com',
  credential: { catalog: 'hubspotApi', keys: ['accessToken', 'token', 'value'] },
  auth: { kind: 'bearer' },
  defaultOperation: 'list_contacts',
  operations: {
    list_contacts: {
      method: 'GET', path: '/crm/v3/objects/contacts',
      fields: [{ key: 'limit', label: 'Limit', type: 'number' }],
      query: { limit: '{limit}' },
    },
    get_contact: {
      method: 'GET', path: '/crm/v3/objects/contacts/{contactId}',
      fields: [{ key: 'contactId', required: true }],
    },
    create_contact: {
      method: 'POST', path: '/crm/v3/objects/contacts',
      fields: [{ key: 'properties', label: 'Properties (JSON)', type: 'code', json: true, required: true }],
      body: { properties: '{properties}' },
    },
    update_contact: {
      method: 'PATCH', path: '/crm/v3/objects/contacts/{contactId}',
      fields: [
        { key: 'contactId', required: true },
        { key: 'properties', label: 'Properties (JSON)', type: 'code', json: true, required: true },
      ],
      body: { properties: '{properties}' },
    },
    create_deal: {
      method: 'POST', path: '/crm/v3/objects/deals',
      fields: [{ key: 'dealProperties', label: 'Deal properties (JSON)', type: 'code', json: true, required: true }],
      body: { properties: '{dealProperties}' },
    },
    list_deals: {
      method: 'GET', path: '/crm/v3/objects/deals',
      fields: [{ key: 'limit', label: 'Limit', type: 'number' }],
      query: { limit: '{limit}' },
    },
  },
};
