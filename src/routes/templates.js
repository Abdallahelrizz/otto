// Built-in template library — no DB, no auth required.
// Each template is a ready-to-use Otto workflow definition.

// ─── Template definitions ──────────────────────────────────────────────────────

const TEMPLATES = [

  // 1. Webhook → Slack notification
  {
    id: 'webhook-to-slack',
    name: 'Webhook to Slack',
    description: 'Receive an HTTP webhook, format the payload into a message, and post it to a Slack channel. Great for alerts, notifications, and lightweight event routing.',
    category: 'notification',
    tags: ['webhook', 'slack', 'notifications'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'n1',
          type: 'webhook_trigger',
          label: 'Webhook',
          position: { x: 100, y: 200 },
          config: {
            path: 'slack-notify',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 202,
            responseBody: '{\n  "message": "Accepted"\n}',
          },
        },
        {
          id: 'n2',
          type: 'set',
          label: 'Format Message',
          position: { x: 350, y: 200 },
          config: {
            mode: 'set',
            assignments: [
              { key: 'text', value: '*New event:* {{ input.event }} — {{ input.message }}' },
            ],
          },
        },
        {
          id: 'n3',
          type: 'slack_send_message',
          label: 'Send to Slack',
          position: { x: 600, y: 200 },
          config: {
            credentialId: '',
            token: '',
            channel: '#notifications',
            text: '{{ input.text }}',
            blocksJson: '',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'output', target: 'n2', targetHandle: 'input' },
        { id: 'e2', source: 'n2', sourceHandle: 'output', target: 'n3', targetHandle: 'input' },
      ],
    },
  },

  // 2. Form → Notion page
  {
    id: 'form-to-notion',
    name: 'Form to Notion',
    description: 'Capture a public form submission, map the fields, and create a new page in a Notion database. Perfect for lead capture, bug reports, or intake workflows.',
    category: 'automation',
    tags: ['form', 'notion', 'data-capture'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'n1',
          type: 'form_trigger',
          label: 'Form Trigger',
          position: { x: 100, y: 200 },
          config: {
            path: 'intake-form',
            title: 'Intake Form',
            description: 'Fill in the details below.',
            fieldsJson: '[\n  { "name": "name", "label": "Name", "type": "text", "required": true },\n  { "name": "email", "label": "Email", "type": "email", "required": true },\n  { "name": "message", "label": "Message", "type": "textarea" }\n]',
            submitLabel: 'Submit',
            responseMessage: 'Thanks! We got your submission.',
          },
        },
        {
          id: 'n2',
          type: 'set',
          label: 'Map Fields',
          position: { x: 350, y: 200 },
          config: {
            mode: 'set',
            assignments: [
              { key: 'title',   value: '{{ input.name }}' },
              { key: 'email',   value: '{{ input.email }}' },
              { key: 'message', value: '{{ input.message }}' },
            ],
          },
        },
        {
          id: 'n3',
          type: 'notion_api',
          label: 'Create Notion Page',
          position: { x: 600, y: 200 },
          config: {
            credentialId: '',
            token: '',
            operation: 'create_page',
            databaseId: '',
            children: '[\n  {\n    "object": "block",\n    "type": "paragraph",\n    "paragraph": {\n      "rich_text": [{ "type": "text", "text": { "content": "{{ input.message }}" } }]\n    }\n  }\n]',
            body: '{\n  "parent": { "database_id": "YOUR_DATABASE_ID" },\n  "properties": {\n    "Name": { "title": [{ "text": { "content": "{{ input.title }}" } }] },\n    "Email": { "email": "{{ input.email }}" }\n  }\n}',
            method: 'POST',
            path: '/pages',
            notionVersion: '2022-06-28',
            pageId: '',
            blockId: '',
            query: '',
            pageSize: 100,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'output', target: 'n2', targetHandle: 'input' },
        { id: 'e2', source: 'n2', sourceHandle: 'output', target: 'n3', targetHandle: 'input' },
      ],
    },
  },

  // 3. AI content enrichment
  {
    id: 'ai-content-enrichment',
    name: 'AI Content Enrichment',
    description: 'Receive raw content via webhook, send it to an LLM for enrichment (summarise, classify, rewrite), then POST the enriched result back to a callback URL.',
    category: 'ai',
    tags: ['ai', 'webhook', 'llm'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'n1',
          type: 'webhook_trigger',
          label: 'Receive Content',
          position: { x: 100, y: 200 },
          config: {
            path: 'enrich',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 202,
            responseBody: '{\n  "message": "Accepted"\n}',
          },
        },
        {
          id: 'n2',
          type: 'llm_call',
          label: 'Enrich with LLM',
          position: { x: 350, y: 200 },
          config: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: '',
            systemPrompt: 'You are a content enrichment assistant. Given the raw input text, return a JSON object with: summary (1–2 sentences), tags (array of 3–5 keywords), and sentiment ("positive", "neutral", or "negative").',
            userPrompt: '{{ input.content }}',
            temperature: 0.3,
            maxTokens: 500,
          },
        },
        {
          id: 'n3',
          type: 'http_request',
          label: 'POST Result to Callback',
          position: { x: 600, y: 200 },
          config: {
            url: '{{ input.callbackUrl }}',
            method: 'POST',
            headers: [{ key: 'Content-Type', value: 'application/json' }],
            body: '{ "enriched": {{ input.text }}, "originalId": "{{ nodes.n1.id }}" }',
            authType: 'none',
            authKey: '',
            authValue: '',
            authUsername: '',
            authPassword: '',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'output', target: 'n2', targetHandle: 'input' },
        { id: 'e2', source: 'n2', sourceHandle: 'output', target: 'n3', targetHandle: 'input' },
      ],
    },
  },

  // 4. Scheduled data sync
  {
    id: 'scheduled-data-sync',
    name: 'Scheduled Data Sync',
    description: 'Fetch data from an external REST API on a schedule and upsert the results into a Postgres table. A reliable pattern for keeping a local database in sync with a third-party source.',
    category: 'data',
    tags: ['schedule', 'database', 'sync'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'n1',
          type: 'schedule_trigger',
          label: 'Every Hour',
          position: { x: 100, y: 200 },
          config: {
            mode: 'interval',
            every: 60,
            unit: 'minutes',
            cron: '0 * * * *',
            timezone: 'UTC',
          },
        },
        {
          id: 'n2',
          type: 'http_request',
          label: 'Fetch Data',
          position: { x: 350, y: 200 },
          config: {
            url: 'https://api.example.com/records',
            method: 'GET',
            headers: [{ key: 'Accept', value: 'application/json' }],
            body: '',
            authType: 'bearer',
            authKey: 'Authorization',
            authValue: 'YOUR_API_TOKEN',
            authUsername: '',
            authPassword: '',
          },
        },
        {
          id: 'n3',
          type: 'postgres_query',
          label: 'Upsert Records',
          position: { x: 600, y: 200 },
          config: {
            query: 'INSERT INTO synced_records (external_id, data, synced_at)\nVALUES ($1, $2, NOW())\nON CONFLICT (external_id) DO UPDATE\n  SET data = EXCLUDED.data, synced_at = EXCLUDED.synced_at',
            params: '["{{ input.id }}", {{ input }}]',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'output', target: 'n2', targetHandle: 'input' },
        { id: 'e2', source: 'n2', sourceHandle: 'output', target: 'n3', targetHandle: 'input' },
      ],
    },
  },

  // 5. Error-workflow alert
  {
    id: 'error-workflow-alert',
    name: 'Error Workflow Alert',
    description: 'A ready-made error workflow. Receives the error context Otto injects when another workflow fails, formats a human-readable message, and fires a Slack alert. Attach it to any workflow as its error handler.',
    category: 'notification',
    tags: ['error-handling', 'slack', 'alerting'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'n1',
          type: 'webhook_trigger',
          label: 'Error Context',
          position: { x: 100, y: 200 },
          config: {
            path: 'error-handler',
            method: 'POST',
            responseMode: 'empty',
            responseStatus: 204,
            responseBody: '',
          },
        },
        {
          id: 'n2',
          type: 'set',
          label: 'Format Error Message',
          position: { x: 350, y: 200 },
          config: {
            mode: 'set',
            assignments: [
              { key: 'text', value: ':red_circle: *Workflow failed*\n>*Workflow:* {{ input.workflowName }}\n>*Execution:* {{ input.executionId }}\n>*Node:* {{ input.failedNode }}\n>*Error:* {{ input.error }}' },
            ],
          },
        },
        {
          id: 'n3',
          type: 'slack_send_message',
          label: 'Alert on Slack',
          position: { x: 600, y: 200 },
          config: {
            credentialId: '',
            token: '',
            channel: '#alerts',
            text: '{{ input.text }}',
            blocksJson: '',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'output', target: 'n2', targetHandle: 'input' },
        { id: 'e2', source: 'n2', sourceHandle: 'output', target: 'n3', targetHandle: 'input' },
      ],
    },
  },

  // 7. GitHub issue to Slack with AI summary
  {
    id: 'github-issue-to-slack',
    name: 'GitHub Issue to Slack',
    description: 'New GitHub issue notifier with AI summary. Receives a GitHub webhook, uses an LLM to generate a concise issue summary, and posts it to a Slack channel.',
    category: 'devops',
    tags: ['github', 'slack', 'ai', 'devops'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'webhook_trigger',
          label: 'GitHub Webhook',
          position: { x: 100, y: 200 },
          config: {
            path: 'github-issues',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 202,
            responseBody: '{\n  "message": "Accepted"\n}',
          },
        },
        {
          id: 'node-2',
          type: 'llm_call',
          label: 'Summarise Issue',
          position: { x: 380, y: 200 },
          config: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: '',
            systemPrompt: 'You are a concise technical writer. Given a GitHub issue payload, write a 1–2 sentence plain-English summary of what the issue is about and its impact. Return only the summary.',
            userPrompt: 'Title: {{ input.issue.title }}\nBody: {{ input.issue.body }}\nLabels: {{ input.issue.labels }}',
            temperature: 0.3,
            maxTokens: 150,
          },
        },
        {
          id: 'node-3',
          type: 'slack_send_message',
          label: 'Post to Slack',
          position: { x: 660, y: 200 },
          config: {
            credentialId: '',
            token: '',
            channel: '#engineering',
            text: ':github: *New Issue:* <{{ input.issue.html_url }}|{{ input.issue.title }}>\n>{{ nodes.node-2.text }}',
            blocksJson: '',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
      ],
    },
  },

  // 8. Daily standup digest
  {
    id: 'daily-standup-digest',
    name: 'Daily Standup Digest',
    description: 'Daily standup digest sent to your inbox every morning. Fetches open issues from your project tracker, generates a standup summary with an LLM, and emails it to you at 9 AM.',
    category: 'automation',
    tags: ['schedule', 'email', 'ai', 'standup'],
    nodeCount: 4,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'schedule_trigger',
          label: '9 AM Daily',
          position: { x: 100, y: 200 },
          config: {
            mode: 'cron',
            every: 1,
            unit: 'days',
            cron: '0 9 * * *',
            timezone: 'America/New_York',
          },
        },
        {
          id: 'node-2',
          type: 'http_request',
          label: 'Fetch Open Issues',
          position: { x: 360, y: 200 },
          config: {
            url: 'https://api.linear.app/graphql',
            method: 'POST',
            headers: [
              { key: 'Content-Type', value: 'application/json' },
              { key: 'Authorization', value: 'YOUR_LINEAR_API_KEY' },
            ],
            body: '{"query":"{ issues(filter: { state: { type: { in: [\"started\", \"unstarted\"] } } }) { nodes { id title assignee { name } state { name } priority } } }"}',
            authType: 'none',
            authKey: '',
            authValue: '',
            authUsername: '',
            authPassword: '',
          },
        },
        {
          id: 'node-3',
          type: 'llm_call',
          label: 'Generate Standup',
          position: { x: 620, y: 200 },
          config: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: '',
            systemPrompt: 'You are a team standup assistant. Given a list of open issues, write a concise daily standup summary grouped by assignee. Use bullet points. Keep it brief and actionable.',
            userPrompt: 'Open issues: {{ input.data.issues.nodes }}',
            temperature: 0.4,
            maxTokens: 600,
          },
        },
        {
          id: 'node-4',
          type: 'send_email',
          label: 'Email Digest',
          position: { x: 900, y: 200 },
          config: {
            credentialId: '',
            to: 'team@example.com',
            from: 'otto@example.com',
            subject: 'Daily Standup Digest — {{ input.date }}',
            body: '{{ nodes.node-3.text }}',
            isHtml: false,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
        { id: 'e3', source: 'node-3', sourceHandle: 'output', target: 'node-4', targetHandle: 'input' },
      ],
    },
  },

  // 9. Form to HubSpot CRM
  {
    id: 'form-to-hubspot',
    name: 'Form to HubSpot',
    description: 'Capture form submissions directly into HubSpot CRM. Maps form fields and creates a new contact record via the HubSpot API.',
    category: 'automation',
    tags: ['form', 'hubspot', 'crm', 'lead-capture'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'form_trigger',
          label: 'Contact Form',
          position: { x: 100, y: 200 },
          config: {
            path: 'contact-form',
            title: 'Contact Us',
            description: 'Get in touch with our team.',
            fieldsJson: '[\n  { "name": "firstname", "label": "First Name", "type": "text", "required": true },\n  { "name": "lastname", "label": "Last Name", "type": "text", "required": true },\n  { "name": "email", "label": "Email", "type": "email", "required": true },\n  { "name": "company", "label": "Company", "type": "text" },\n  { "name": "message", "label": "Message", "type": "textarea" }\n]',
            submitLabel: 'Send',
            responseMessage: 'Thanks! We will be in touch shortly.',
          },
        },
        {
          id: 'node-2',
          type: 'set',
          label: 'Map CRM Fields',
          position: { x: 370, y: 200 },
          config: {
            mode: 'set',
            assignments: [
              { key: 'firstname', value: '{{ input.firstname }}' },
              { key: 'lastname',  value: '{{ input.lastname }}' },
              { key: 'email',     value: '{{ input.email }}' },
              { key: 'company',   value: '{{ input.company }}' },
            ],
          },
        },
        {
          id: 'node-3',
          type: 'http_request',
          label: 'Create HubSpot Contact',
          position: { x: 640, y: 200 },
          config: {
            url: 'https://api.hubapi.com/crm/v3/objects/contacts',
            method: 'POST',
            headers: [
              { key: 'Content-Type', value: 'application/json' },
            ],
            body: '{\n  "properties": {\n    "firstname": "{{ input.firstname }}",\n    "lastname": "{{ input.lastname }}",\n    "email": "{{ input.email }}",\n    "company": "{{ input.company }}"\n  }\n}',
            authType: 'bearer',
            authKey: 'Authorization',
            authValue: 'YOUR_HUBSPOT_ACCESS_TOKEN',
            authUsername: '',
            authPassword: '',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
      ],
    },
  },

  // 10. Sentiment analysis pipeline
  {
    id: 'sentiment-analysis-pipeline',
    name: 'Sentiment Analysis Pipeline',
    description: 'Analyze sentiment of incoming text and alert on negative signals. Classifies text sentiment with an LLM and fires a Slack alert whenever the score falls below the negative threshold.',
    category: 'ai',
    tags: ['ai', 'sentiment', 'slack', 'alerting'],
    nodeCount: 4,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'webhook_trigger',
          label: 'Receive Text',
          position: { x: 100, y: 250 },
          config: {
            path: 'sentiment-check',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 202,
            responseBody: '{\n  "message": "Accepted"\n}',
          },
        },
        {
          id: 'node-2',
          type: 'llm_call',
          label: 'Analyse Sentiment',
          position: { x: 360, y: 250 },
          config: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: '',
            systemPrompt: 'You are a sentiment analysis engine. Analyse the input text and return a JSON object with two fields: "score" (float 0.0–1.0, where 0.0 is most negative) and "label" (one of: "positive", "neutral", "negative"). Return only valid JSON, no prose.',
            userPrompt: '{{ input.text }}',
            temperature: 0,
            maxTokens: 60,
          },
        },
        {
          id: 'node-3',
          type: 'if',
          label: 'Negative Signal?',
          position: { x: 630, y: 250 },
          config: {
            conditions: [
              { field: 'score', operator: 'less_than', value: '0.3' },
            ],
            logicalOperator: 'AND',
          },
        },
        {
          id: 'node-4',
          type: 'slack_send_message',
          label: 'Alert — Negative Sentiment',
          position: { x: 900, y: 150 },
          config: {
            credentialId: '',
            token: '',
            channel: '#alerts',
            text: ':warning: *Negative sentiment detected* (score: {{ input.score }})\n>{{ nodes.node-1.text }}',
            blocksJson: '',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
        { id: 'e3', source: 'node-3', sourceHandle: 'true',   target: 'node-4', targetHandle: 'input' },
      ],
    },
  },

  // 11. Stripe payment to Notion
  {
    id: 'stripe-payment-to-notion',
    name: 'Stripe Payment to Notion',
    description: 'Log Stripe payment events to a Notion database. Receives Stripe webhook events, extracts key payment fields, and creates a new page in your payments database.',
    category: 'data',
    tags: ['stripe', 'notion', 'payments', 'logging'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'webhook_trigger',
          label: 'Stripe Webhook',
          position: { x: 100, y: 200 },
          config: {
            path: 'stripe-events',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 200,
            responseBody: '{\n  "received": true\n}',
          },
        },
        {
          id: 'node-2',
          type: 'set',
          label: 'Extract Payment Fields',
          position: { x: 370, y: 200 },
          config: {
            mode: 'set',
            assignments: [
              { key: 'amount',    value: '{{ input.data.object.amount_received }}' },
              { key: 'currency',  value: '{{ input.data.object.currency }}' },
              { key: 'customer',  value: '{{ input.data.object.customer }}' },
              { key: 'status',    value: '{{ input.data.object.status }}' },
              { key: 'paymentId', value: '{{ input.data.object.id }}' },
              { key: 'createdAt', value: '{{ input.created }}' },
            ],
          },
        },
        {
          id: 'node-3',
          type: 'notion_api',
          label: 'Log to Notion',
          position: { x: 640, y: 200 },
          config: {
            credentialId: '',
            token: '',
            operation: 'create_page',
            databaseId: 'YOUR_PAYMENTS_DATABASE_ID',
            body: '{\n  "parent": { "database_id": "YOUR_PAYMENTS_DATABASE_ID" },\n  "properties": {\n    "Payment ID": { "title": [{ "text": { "content": "{{ input.paymentId }}" } }] },\n    "Amount": { "number": {{ input.amount }} },\n    "Currency": { "select": { "name": "{{ input.currency }}" } },\n    "Status": { "select": { "name": "{{ input.status }}" } },\n    "Customer": { "rich_text": [{ "text": { "content": "{{ input.customer }}" } }] }\n  }\n}',
            method: 'POST',
            path: '/pages',
            notionVersion: '2022-06-28',
            pageId: '',
            blockId: '',
            query: '',
            pageSize: 100,
            children: '',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
      ],
    },
  },

  // 12. Multi-model comparison
  {
    id: 'multi-model-comparison',
    name: 'Multi-Model Comparison',
    description: 'Compare responses from multiple AI models side by side. Sends the same prompt to GPT-4o and Claude simultaneously, merges the results, and formats a side-by-side comparison.',
    category: 'ai',
    tags: ['ai', 'parallel', 'llm', 'comparison'],
    nodeCount: 5,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'manual_trigger',
          label: 'Manual Trigger',
          position: { x: 100, y: 300 },
          config: {
            sampleData: '{\n  "prompt": "Explain the concept of recursion in simple terms."\n}',
          },
        },
        {
          id: 'node-2',
          type: 'llm_call',
          label: 'GPT-4o',
          position: { x: 380, y: 150 },
          config: {
            provider: 'openai',
            model: 'gpt-4o',
            apiKey: '',
            systemPrompt: 'You are a helpful assistant. Answer clearly and concisely.',
            userPrompt: '{{ input.prompt }}',
            temperature: 0.7,
            maxTokens: 500,
          },
        },
        {
          id: 'node-3',
          type: 'llm_call',
          label: 'Claude Sonnet',
          position: { x: 380, y: 450 },
          config: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            apiKey: '',
            systemPrompt: 'You are a helpful assistant. Answer clearly and concisely.',
            userPrompt: '{{ input.prompt }}',
            temperature: 0.7,
            maxTokens: 500,
          },
        },
        {
          id: 'node-4',
          type: 'merge',
          label: 'Merge Responses',
          position: { x: 660, y: 300 },
          config: {
            mode: 'merge-object',
          },
        },
        {
          id: 'node-5',
          type: 'set',
          label: 'Format Comparison',
          position: { x: 920, y: 300 },
          config: {
            mode: 'set',
            assignments: [
              { key: 'prompt',        value: '{{ nodes.node-1.prompt }}' },
              { key: 'gpt4o',         value: '{{ nodes.node-2.text }}' },
              { key: 'claudeSonnet',  value: '{{ nodes.node-3.text }}' },
              { key: 'gpt4oTokens',   value: '{{ nodes.node-2.usage.total_tokens }}' },
              { key: 'claudeTokens',  value: '{{ nodes.node-3.usage.total_tokens }}' },
            ],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-1', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
        { id: 'e3', source: 'node-2', sourceHandle: 'output', target: 'node-4', targetHandle: 'in1' },
        { id: 'e4', source: 'node-3', sourceHandle: 'output', target: 'node-4', targetHandle: 'in2' },
        { id: 'e5', source: 'node-4', sourceHandle: 'output', target: 'node-5', targetHandle: 'input' },
      ],
    },
  },

  // 13. Database backup alert
  {
    id: 'database-backup-alert',
    name: 'Database Backup Alert',
    description: 'Nightly database health check with email alert. Runs a count query at midnight, and sends an alert email if the record count falls below the expected threshold.',
    category: 'devops',
    tags: ['database', 'schedule', 'alert', 'monitoring'],
    nodeCount: 4,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'schedule_trigger',
          label: 'Midnight Check',
          position: { x: 100, y: 250 },
          config: {
            mode: 'cron',
            every: 1,
            unit: 'days',
            cron: '0 0 * * *',
            timezone: 'UTC',
          },
        },
        {
          id: 'node-2',
          type: 'postgres_query',
          label: 'Count Recent Records',
          position: { x: 360, y: 250 },
          config: {
            query: 'SELECT COUNT(*) AS record_count FROM events WHERE created_at >= NOW() - INTERVAL \'24 hours\'',
            params: '[]',
          },
        },
        {
          id: 'node-3',
          type: 'if',
          label: 'Below Threshold?',
          position: { x: 630, y: 250 },
          config: {
            conditions: [
              { field: 'rows.0.record_count', operator: 'less_than', value: '100' },
            ],
            logicalOperator: 'AND',
          },
        },
        {
          id: 'node-4',
          type: 'send_email',
          label: 'Alert Email',
          position: { x: 900, y: 150 },
          config: {
            credentialId: '',
            to: 'ops@example.com',
            from: 'otto@example.com',
            subject: '[ALERT] Database record count low — {{ input.rows.0.record_count }} records in last 24 h',
            body: 'The nightly database health check detected an unusually low record count.\n\nCount: {{ input.rows.0.record_count }}\nThreshold: 100\n\nPlease investigate immediately.',
            isHtml: false,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
        { id: 'e3', source: 'node-3', sourceHandle: 'true',   target: 'node-4', targetHandle: 'input' },
      ],
    },
  },

  // 14. Customer support triage
  {
    id: 'customer-support-triage',
    name: 'Customer Support Triage',
    description: 'AI-powered support ticket classification and routing. Classifies incoming tickets by type and urgency, escalates high-urgency tickets to Slack, and logs the rest.',
    category: 'ai',
    tags: ['ai', 'support', 'slack', 'triage'],
    nodeCount: 4,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'webhook_trigger',
          label: 'Incoming Ticket',
          position: { x: 100, y: 250 },
          config: {
            path: 'support-triage',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 202,
            responseBody: '{\n  "message": "Accepted"\n}',
          },
        },
        {
          id: 'node-2',
          type: 'llm_call',
          label: 'Classify Ticket',
          position: { x: 360, y: 250 },
          config: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: '',
            systemPrompt: 'You are a customer support triage assistant. Analyse the support ticket and return a JSON object with: "type" (one of: bug, feature, billing, other), "urgency" (integer 1–5 where 5 is most urgent), and "summary" (one sentence). Return only valid JSON.',
            userPrompt: 'Subject: {{ input.subject }}\nMessage: {{ input.message }}\nCustomer: {{ input.customer_email }}',
            temperature: 0,
            maxTokens: 150,
          },
        },
        {
          id: 'node-3',
          type: 'if',
          label: 'High Urgency?',
          position: { x: 630, y: 250 },
          config: {
            conditions: [
              { field: 'urgency', operator: 'greater_than_or_equal', value: '4' },
            ],
            logicalOperator: 'AND',
          },
        },
        {
          id: 'node-4',
          type: 'slack_send_message',
          label: 'Escalate to Slack',
          position: { x: 900, y: 150 },
          config: {
            credentialId: '',
            token: '',
            channel: '#support-urgent',
            text: ':rotating_light: *Urgent Support Ticket* (urgency {{ input.urgency }}/5)\n>*Type:* {{ input.type }}\n>*Summary:* {{ input.summary }}\n>*From:* {{ nodes.node-1.customer_email }}',
            blocksJson: '',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
        { id: 'e3', source: 'node-3', sourceHandle: 'true',   target: 'node-4', targetHandle: 'input' },
      ],
    },
  },

  // 15. Twilio SMS auto-responder
  {
    id: 'twilio-sms-responder',
    name: 'Twilio SMS Auto-Responder',
    description: 'Auto-respond to incoming SMS messages with AI-generated replies. Receives inbound SMS via webhook, generates a context-aware reply with an LLM, and sends it back via Twilio.',
    category: 'communication',
    tags: ['sms', 'twilio', 'ai', 'communication'],
    nodeCount: 3,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'webhook_trigger',
          label: 'Inbound SMS',
          position: { x: 100, y: 200 },
          config: {
            path: 'sms-inbound',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 200,
            responseBody: '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          },
        },
        {
          id: 'node-2',
          type: 'llm_call',
          label: 'Generate Reply',
          position: { x: 370, y: 200 },
          config: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: '',
            systemPrompt: 'You are a friendly business assistant responding to customer SMS messages. Keep replies concise (under 160 characters when possible) and helpful. Never mention that you are an AI.',
            userPrompt: 'Incoming SMS from {{ input.From }}: {{ input.Body }}',
            temperature: 0.5,
            maxTokens: 100,
          },
        },
        {
          id: 'node-3',
          type: 'http_request',
          label: 'Send SMS via Twilio',
          position: { x: 640, y: 200 },
          config: {
            url: 'https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json',
            method: 'POST',
            headers: [
              { key: 'Content-Type', value: 'application/x-www-form-urlencoded' },
            ],
            body: 'To={{ input.From }}&From=YOUR_TWILIO_NUMBER&Body={{ nodes.node-2.text }}',
            authType: 'basic',
            authKey: '',
            authValue: '',
            authUsername: 'YOUR_ACCOUNT_SID',
            authPassword: 'YOUR_AUTH_TOKEN',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
      ],
    },
  },

  // 16. Data enrichment loop
  {
    id: 'data-enrichment-loop',
    name: 'Data Enrichment Loop',
    description: 'Enrich a list of records by calling an external API for each item. Extracts an items array, iterates through it, enriches each record via HTTP, and collects all results.',
    category: 'data',
    tags: ['loop', 'enrichment', 'api', 'data'],
    nodeCount: 5,
    definition: {
      nodes: [
        {
          id: 'node-1',
          type: 'webhook_trigger',
          label: 'Receive Records',
          position: { x: 100, y: 250 },
          config: {
            path: 'enrich-records',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 202,
            responseBody: '{\n  "message": "Accepted"\n}',
          },
        },
        {
          id: 'node-2',
          type: 'set',
          label: 'Extract Items Array',
          position: { x: 360, y: 250 },
          config: {
            mode: 'set',
            assignments: [
              { key: 'items', value: '{{ input.records }}' },
            ],
          },
        },
        {
          id: 'node-3',
          type: 'loop',
          label: 'Loop Over Items',
          position: { x: 620, y: 250 },
          config: {
            arrayPath: 'items',
            maxIterations: 100,
          },
        },
        {
          id: 'node-4',
          type: 'http_request',
          label: 'Enrich Item',
          position: { x: 880, y: 250 },
          config: {
            url: 'https://api.clearbit.com/v2/companies/find?domain={{ input.domain }}',
            method: 'GET',
            headers: [
              { key: 'Authorization', value: 'Bearer YOUR_CLEARBIT_KEY' },
            ],
            body: '',
            authType: 'none',
            authKey: '',
            authValue: '',
            authUsername: '',
            authPassword: '',
          },
        },
        {
          id: 'node-5',
          type: 'merge',
          label: 'Collect Results',
          position: { x: 1140, y: 250 },
          config: {
            mode: 'collect-array',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'node-1', sourceHandle: 'output', target: 'node-2', targetHandle: 'input' },
        { id: 'e2', source: 'node-2', sourceHandle: 'output', target: 'node-3', targetHandle: 'input' },
        { id: 'e3', source: 'node-3', sourceHandle: 'output', target: 'node-4', targetHandle: 'input' },
        { id: 'e4', source: 'node-4', sourceHandle: 'output', target: 'node-5', targetHandle: 'input' },
      ],
    },
  },

  // 6. Parallel AI enrichment — demonstrates Otto's parallel execution
  {
    id: 'parallel-ai-enrichment',
    name: 'Parallel AI Enrichment',
    description: "Send the same content to two LLM calls simultaneously — one for summarisation, one for sentiment analysis — then merge and reshape the results into a single output. Demonstrates Otto's parallel execution capability.",
    category: 'ai',
    tags: ['ai', 'parallel', 'llm'],
    nodeCount: 5,
    definition: {
      nodes: [
        {
          id: 'n1',
          type: 'webhook_trigger',
          label: 'Receive Content',
          position: { x: 100, y: 300 },
          config: {
            path: 'parallel-enrich',
            method: 'POST',
            responseMode: 'accepted',
            responseStatus: 202,
            responseBody: '{\n  "message": "Accepted"\n}',
          },
        },
        {
          id: 'n2',
          type: 'llm_call',
          label: 'Summarise',
          position: { x: 380, y: 150 },
          config: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: '',
            systemPrompt: 'You are a summarisation assistant. Return only a concise 1–2 sentence summary of the input text.',
            userPrompt: '{{ input.content }}',
            temperature: 0.3,
            maxTokens: 200,
          },
        },
        {
          id: 'n3',
          type: 'llm_call',
          label: 'Sentiment Analysis',
          position: { x: 380, y: 450 },
          config: {
            provider: 'openai',
            model: 'gpt-4o-mini',
            apiKey: '',
            systemPrompt: 'You are a sentiment analysis assistant. Classify the sentiment of the input as one of: positive, neutral, or negative. Return only the single word.',
            userPrompt: '{{ input.content }}',
            temperature: 0,
            maxTokens: 10,
          },
        },
        {
          id: 'n4',
          type: 'merge',
          label: 'Merge Results',
          position: { x: 660, y: 300 },
          config: {
            mode: 'merge-object',
          },
        },
        {
          id: 'n5',
          type: 'set',
          label: 'Shape Output',
          position: { x: 900, y: 300 },
          config: {
            mode: 'set',
            assignments: [
              { key: 'summary',   value: '{{ nodes.n2.text }}' },
              { key: 'sentiment', value: '{{ nodes.n3.text }}' },
              { key: 'content',   value: '{{ nodes.n1.content }}' },
            ],
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'n1', sourceHandle: 'output', target: 'n2', targetHandle: 'input' },
        { id: 'e2', source: 'n1', sourceHandle: 'output', target: 'n3', targetHandle: 'input' },
        { id: 'e3', source: 'n2', sourceHandle: 'output', target: 'n4', targetHandle: 'in1' },
        { id: 'e4', source: 'n3', sourceHandle: 'output', target: 'n4', targetHandle: 'in2' },
        { id: 'e5', source: 'n4', sourceHandle: 'output', target: 'n5', targetHandle: 'input' },
      ],
    },
  },

];

// ─── List view (omit definition) ──────────────────────────────────────────────

const TEMPLATES_LIST = TEMPLATES.map(({ id, name, description, category, tags, nodeCount }) => ({
  id, name, description, category, tags, nodeCount,
}));

// ─── Route registration ────────────────────────────────────────────────────────

export async function templateRoutes(fastify) {
  // GET /api/v1/templates — list all templates (no auth required)
  fastify.get('/api/v1/templates', async (_req, reply) => {
    return reply.send({ templates: TEMPLATES_LIST });
  });

  // GET /api/v1/templates/:id — full template with definition (no auth required)
  fastify.get('/api/v1/templates/:id', async (req, reply) => {
    const template = TEMPLATES.find(t => t.id === req.params.id);
    if (!template) {
      return reply.code(404).send({ error: 'Template not found' });
    }
    return reply.send(template);
  });
}
