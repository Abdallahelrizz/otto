import { db } from '../db/client.js';

const INTEGRATIONS = [
  {
    slug: 'slack', name: 'Slack', category: 'messaging',
    description: 'Send messages, post to channels, and trigger workflows from Slack.',
    credential_schema: { fields: [{ key: 'botToken', label: 'Bot Token', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'Send Message', config: { url: 'https://slack.com/api/chat.postMessage', method: 'POST' } }],
  },
  {
    slug: 'discord', name: 'Discord', category: 'messaging',
    description: 'Post messages to Discord channels via webhooks.',
    credential_schema: { fields: [{ key: 'webhookUrl', label: 'Webhook URL', type: 'text' }] },
    node_types: [{ type: 'http_request', label: 'Send Message', config: { url: '{{ credential.webhookUrl }}', method: 'POST' } }],
  },
  {
    slug: 'github', name: 'GitHub', category: 'developer',
    description: 'Create issues, pull requests, and interact with repos.',
    credential_schema: { fields: [{ key: 'value', label: 'Personal Access Token', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'API Request', config: { url: 'https://api.github.com', method: 'GET' } }],
  },
  {
    slug: 'gitlab', name: 'GitLab', category: 'developer',
    description: 'Interact with GitLab repositories and CI/CD pipelines.',
    credential_schema: { fields: [{ key: 'value', label: 'Personal Access Token', type: 'password' }, { key: 'baseUrl', label: 'Base URL', type: 'text' }] },
    node_types: [{ type: 'http_request', label: 'API Request', config: { method: 'GET' } }],
  },
  {
    slug: 'notion', name: 'Notion', category: 'productivity',
    description: 'Read and write Notion databases and pages.',
    credential_schema: { fields: [{ key: 'value', label: 'Integration Token', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'API Request', config: { url: 'https://api.notion.com/v1', method: 'GET' } }],
  },
  {
    slug: 'linear', name: 'Linear', category: 'productivity',
    description: 'Create and update Linear issues and projects.',
    credential_schema: { fields: [{ key: 'value', label: 'API Key', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'GraphQL Query', config: { url: 'https://api.linear.app/graphql', method: 'POST' } }],
  },
  {
    slug: 'asana', name: 'Asana', category: 'productivity',
    description: 'Create tasks and manage Asana projects.',
    credential_schema: { fields: [{ key: 'value', label: 'Access Token', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'API Request', config: { url: 'https://app.asana.com/api/1.0', method: 'GET' } }],
  },
  {
    slug: 'jira', name: 'Jira', category: 'productivity',
    description: 'Create and update Jira issues.',
    credential_schema: { fields: [{ key: 'host', label: 'Jira Host', type: 'text' }, { key: 'email', label: 'Email', type: 'text' }, { key: 'apiToken', label: 'API Token', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'API Request', config: { method: 'GET' } }],
  },
  {
    slug: 'hubspot', name: 'HubSpot', category: 'crm',
    description: 'Manage contacts, deals, and CRM workflows in HubSpot.',
    credential_schema: { fields: [{ key: 'value', label: 'Private App Token', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'API Request', config: { url: 'https://api.hubapi.com', method: 'GET' } }],
  },
  {
    slug: 'stripe', name: 'Stripe', category: 'payments',
    description: 'Handle payments, subscriptions, and customer data.',
    credential_schema: { fields: [{ key: 'value', label: 'Secret Key', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'API Request', config: { url: 'https://api.stripe.com/v1', method: 'GET' } }],
  },
  {
    slug: 'openai', name: 'OpenAI', category: 'ai',
    description: 'Call GPT models, generate embeddings, and use DALL-E.',
    credential_schema: { fields: [{ key: 'value', label: 'API Key', type: 'password' }] },
    node_types: [{ type: 'llm_call', label: 'LLM Call', config: { provider: 'openai' } }, { type: 'vector_search', label: 'Embed + Search', config: {} }],
  },
  {
    slug: 'anthropic', name: 'Anthropic', category: 'ai',
    description: 'Call Claude models via the Anthropic API.',
    credential_schema: { fields: [{ key: 'value', label: 'API Key', type: 'password' }] },
    node_types: [{ type: 'llm_call', label: 'LLM Call', config: { provider: 'anthropic' } }],
  },
  {
    slug: 'postgres', name: 'PostgreSQL', category: 'database',
    description: 'Query and write to PostgreSQL databases.',
    credential_schema: { fields: [{ key: 'connectionString', label: 'Connection String', type: 'password' }] },
    node_types: [{ type: 'postgres_query', label: 'Query', config: {} }],
  },
  {
    slug: 'mysql', name: 'MySQL', category: 'database',
    description: 'Query MySQL databases via HTTP proxy or direct connection.',
    credential_schema: { fields: [{ key: 'host', label: 'Host', type: 'text' }, { key: 'user', label: 'User', type: 'text' }, { key: 'pass', label: 'Password', type: 'password' }, { key: 'database', label: 'Database', type: 'text' }] },
    node_types: [{ type: 'http_request', label: 'Query via Proxy', config: { method: 'POST' } }],
  },
  {
    slug: 'mongodb', name: 'MongoDB', category: 'database',
    description: 'Read and write MongoDB documents via Data API.',
    credential_schema: { fields: [{ key: 'apiKey', label: 'Data API Key', type: 'password' }, { key: 'appId', label: 'App ID', type: 'text' }] },
    node_types: [{ type: 'http_request', label: 'Find Documents', config: { method: 'POST' } }],
  },
  {
    slug: 'redis', name: 'Redis', category: 'database',
    description: 'Get and set values in Redis.',
    credential_schema: { fields: [{ key: 'url', label: 'Redis URL', type: 'text' }] },
    node_types: [{ type: 'redis_get', label: 'Get', config: {} }, { type: 'redis_set', label: 'Set', config: {} }],
  },
  {
    slug: 'supabase', name: 'Supabase', category: 'database',
    description: 'Query Supabase tables and call Edge Functions.',
    credential_schema: { fields: [{ key: 'url', label: 'Project URL', type: 'text' }, { key: 'value', label: 'Service Role Key', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'REST API', config: { method: 'GET' } }, { type: 'postgres_query', label: 'SQL Query', config: {} }],
  },
  {
    slug: 'sendgrid', name: 'SendGrid', category: 'email',
    description: 'Send transactional and marketing emails via SendGrid.',
    credential_schema: { fields: [{ key: 'value', label: 'API Key', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'Send Email', config: { url: 'https://api.sendgrid.com/v3/mail/send', method: 'POST' } }],
  },
  {
    slug: 'twilio', name: 'Twilio', category: 'messaging',
    description: 'Send SMS and make calls via Twilio.',
    credential_schema: { fields: [{ key: 'accountSid', label: 'Account SID', type: 'text' }, { key: 'authToken', label: 'Auth Token', type: 'password' }] },
    node_types: [{ type: 'http_request', label: 'Send SMS', config: { url: 'https://api.twilio.com/2010-04-01/Accounts/{{ credential.accountSid }}/Messages.json', method: 'POST' } }],
  },
  {
    slug: 'resend', name: 'Resend', category: 'email',
    description: 'Send emails via Resend using your domain.',
    credential_schema: { fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }] },
    node_types: [{ type: 'send_email', label: 'Send Email', config: { provider: 'resend' } }],
  },
];

export async function seedIntegrations() {
  let inserted = 0;
  for (const integration of INTEGRATIONS) {
    const { rows } = await db.query(
      `INSERT INTO integrations (slug, name, category, description, credential_schema, node_types, official)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (slug) DO NOTHING
       RETURNING id`,
      [
        integration.slug,
        integration.name,
        integration.category,
        integration.description ?? null,
        JSON.stringify(integration.credential_schema ?? null),
        JSON.stringify(integration.node_types ?? []),
      ]
    );
    if (rows.length) inserted++;
  }
  return { inserted, total: INTEGRATIONS.length };
}
