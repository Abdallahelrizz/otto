// Node type registry — exposes what node types exist and their configurations.
// Critical for MCP clients that need to introspect available nodes before drafting workflow JSON.

const NODE_CATEGORIES = {
  webhook_trigger:  { category: 'triggers',  label: 'Webhook Trigger',   description: 'Receives HTTP webhook calls to start a workflow.' },
  manual_trigger:   { category: 'triggers',  label: 'Manual Trigger',    description: 'Starts a workflow manually via the Run button or API.' },
  form_trigger:     { category: 'triggers',  label: 'Form Trigger',      description: 'Starts a workflow when a form is submitted.' },
  chat_trigger:     { category: 'triggers',  label: 'Chat Trigger',      description: 'Starts a workflow from a chat message.' },
  schedule_trigger: { category: 'triggers',  label: 'Schedule Trigger',  description: 'Starts a workflow on a cron schedule.' },
  http_request:     { category: 'core',      label: 'HTTP Request',      description: 'Makes an HTTP request to any URL.' },
  llm_call:         { category: 'ai',        label: 'LLM Call',          description: 'Calls an LLM (OpenAI, Anthropic, OpenRouter) and returns the text response.' },
  parallel_ai:      { category: 'ai',        label: 'Parallel AI',       description: 'Fans out multiple LLM calls simultaneously and collects results.' },
  ai_agent:         { category: 'ai',        label: 'AI Agent',          description: 'Runs a tool-use loop with an LLM agent (max 100 steps).' },
  if:               { category: 'core',      label: 'If',                description: 'Branches the workflow based on a condition.' },
  filter:           { category: 'core',      label: 'Filter',            description: 'Stops execution of the current branch if the condition is false.' },
  merge:            { category: 'core',      label: 'Merge',             description: 'Merges data from multiple branches into one.' },
  set:              { category: 'core',      label: 'Set',               description: 'Sets or transforms data fields.' },
  loop:             { category: 'core',      label: 'Loop',              description: 'Iterates over an array, running downstream nodes for each item.' },
  delay:            { category: 'core',      label: 'Delay',             description: 'Waits for a specified duration before continuing.' },
  wait:             { category: 'core',      label: 'Wait',              description: 'Pauses execution until resumed by an external event.' },
  human_approval:   { category: 'core',      label: 'Human Approval',    description: 'Pauses execution until a human approves or rejects the step.' },
  stop_error:       { category: 'core',      label: 'Stop & Error',      description: 'Stops execution and throws a custom error.' },
  sub_workflow:     { category: 'core',      label: 'Sub-Workflow',      description: 'Runs another workflow and returns its output.' },
  send_email:       { category: 'core',      label: 'Send Email',        description: 'Sends an email via SMTP or Resend.' },
  postgres_query:   { category: 'data',      label: 'Postgres Query',    description: 'Runs a SQL query against a Postgres database.' },
  redis_get:        { category: 'data',      label: 'Redis Get',         description: 'Gets a value from Redis by key.' },
  redis_set:        { category: 'data',      label: 'Redis Set',         description: 'Sets a value in Redis with an optional TTL.' },
  vector_search:    { category: 'data',      label: 'Vector Search',     description: 'Embeds a query and searches for similar vectors in pgvector.' },
  memory_read:      { category: 'ai',        label: 'Memory Read',       description: "Reads patterns from OttoBot's memory store." },
  memory_write:     { category: 'ai',        label: 'Memory Write',      description: "Writes patterns to OttoBot's memory store." },
  read_file:        { category: 'data',      label: 'Read File',         description: 'Reads a file from the local filesystem or binary store.' },
  write_file:       { category: 'data',      label: 'Write File',        description: 'Writes content to a file.' },
  move_binary_data: { category: 'data',      label: 'Move Binary Data',  description: 'Moves binary data between nodes.' },
  list_files:       { category: 'data',      label: 'List Files',        description: 'Lists files in a directory.' },
  binary_metadata:  { category: 'data',      label: 'Binary Metadata',   description: 'Returns metadata about a binary item.' },
  s3_object:        { category: 'data',      label: 'S3 Object',         description: 'Gets, puts, or deletes objects in an S3-compatible bucket.' },
  crypto:           { category: 'core',      label: 'Crypto',            description: 'Hashes, encrypts, or generates random values.' },
  datetime:         { category: 'core',      label: 'Date & Time',       description: 'Formats, parses, and manipulates dates and times.' },
  jwt:              { category: 'core',      label: 'JWT',               description: 'Signs or verifies JSON Web Tokens.' },
  slack_send_message:    { category: 'core', label: 'Slack',             description: 'Sends a message to a Slack channel.' },
  discord_send_message:  { category: 'core', label: 'Discord',           description: 'Sends a message to a Discord channel.' },
  telegram_send_message: { category: 'core', label: 'Telegram',          description: 'Sends a message via Telegram bot.' },
  github_api:       { category: 'core',      label: 'GitHub',            description: 'Calls the GitHub REST API.' },
  notion_api:       { category: 'core',      label: 'Notion',            description: 'Reads and writes Notion pages and databases.' },
  airtable_records: { category: 'data',      label: 'Airtable',          description: 'Lists, creates, updates, or deletes Airtable records.' },
  graphql_request:  { category: 'core',      label: 'GraphQL',           description: 'Executes a GraphQL query or mutation.' },
  stripe_api:       { category: 'core',      label: 'Stripe',            description: 'Calls the Stripe API.' },
  sendgrid_email:   { category: 'core',      label: 'SendGrid',          description: 'Sends an email via SendGrid.' },
  twilio_sms:       { category: 'core',      label: 'Twilio SMS',        description: 'Sends an SMS via Twilio.' },
  salesforce_api:   { category: 'core',      label: 'Salesforce',        description: 'Calls the Salesforce REST API.' },
  hubspot_api:      { category: 'core',      label: 'HubSpot',           description: 'Calls the HubSpot API.' },
  linear_api:       { category: 'core',      label: 'Linear',            description: 'Creates and updates Linear issues.' },
  csv_parse:        { category: 'data',      label: 'CSV Parse',         description: 'Parses a CSV string into an array of objects.' },
  csv_stringify:    { category: 'data',      label: 'CSV Stringify',     description: 'Converts an array of objects to a CSV string.' },
  xml_parse:        { category: 'data',      label: 'XML Parse',         description: 'Parses an XML string into a JSON object.' },
  xml_stringify:    { category: 'data',      label: 'XML Stringify',     description: 'Converts a JSON object to an XML string.' },
  html_extract:     { category: 'data',      label: 'HTML Extract',      description: 'Extracts data from HTML using CSS selectors.' },
  json_transform:   { category: 'data',      label: 'JSON Transform',    description: 'Transforms JSON data using jq-style expressions.' },
  compression:      { category: 'data',      label: 'Compression',       description: 'Compresses or decompresses data (gzip, deflate, brotli).' },
  code:             { category: 'core',      label: 'Code',              description: 'Runs arbitrary JavaScript or Python code in a Piston sandbox.' },
};

const NODE_LIST = Object.entries(NODE_CATEGORIES).map(([type, meta]) => ({ type, ...meta }));

export async function nodeRoutes(fastify) {
  fastify.get('/api/v1/nodes', async (_req, reply) => {
    return reply.send({ nodes: NODE_LIST });
  });

  fastify.get('/api/v1/nodes/:type', async (req, reply) => {
    const meta = NODE_CATEGORIES[req.params.type];
    if (!meta) return reply.code(404).send({ error: `Unknown node type: ${req.params.type}` });
    return reply.send({ node: { type: req.params.type, ...meta } });
  });
}
