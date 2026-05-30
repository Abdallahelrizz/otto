export const VALID_SCOPES = new Set([
  '*', // full access — back-compat for pre-scope keys

  // Workflows
  'workflows:read',
  'workflows:write',       // create / update / delete
  'workflows:activate',    // activate / deactivate (triggers schedules + webhooks)
  'workflows:execute',     // POST /execute, POST /workflows/:id/execute
  'workflows:archive',     // archive / unarchive
  'workflows:versions:read',

  // Executions
  'executions:read',       // list, get, SSE stream
  'executions:write',      // delete / prune
  'executions:retry',
  'executions:stop',

  // Node type registry — critical for MCP clients introspecting what nodes exist
  'nodes:read',

  // Credentials — read never returns decrypted data
  'credentials:read',
  'credentials:write',
  'credentials:test',
  'credentials:schema:read',

  // Tags
  'tags:read',
  'tags:write',

  // Variables
  'variables:read',
  'variables:write',

  // Integrations / community packages
  'integrations:read',
  'integrations:write',

  // Observability / insights
  'observability:read',
  'audit:read',

  // Memory (OttoBot context)
  'memory:read',
  'memory:write',

  // Binary data
  'binary_data:read',
  'binary_data:write',

  // Approvals (human-in-the-loop)
  'approvals:read',
  'approvals:write',

  // Evaluations
  'evaluations:read',
  'evaluations:write',

  // Templates
  'templates:read',

  // External secrets
  'external_secrets:read',

  // Import / Export
  'import:write',
  'export:read',

  // Expression preview (live resolve in NDV)
  'expressions:preview',

  // OttoBot AI assistant
  'ottobot:invoke',

  // MCP invocation
  'mcp:invoke',

  // Workspace admin — gated by session role too; even `*` API keys cannot escalate
  'workspace:members:read',
  'workspace:members:write',
]);

// [pathRegex, method, requiredScope]
// Ordered from most-specific to least-specific. resolveScope() returns the first match.
const SCOPE_MAP = [
  // Executions — specific actions before general list
  [/^\/api\/v1\/executions\/[^/]+\/retry$/, 'POST',   'executions:retry'],
  [/^\/api\/v1\/executions\/[^/]+\/stop$/, 'POST',    'executions:stop'],
  [/^\/api\/v1\/executions\/[^/]+\/cancel$/, 'POST',  'executions:stop'],
  [/^\/api\/v1\/executions\/[^/]+\/stream$/, 'GET',   'executions:read'],
  [/^\/api\/v1\/executions\/[^/]+$/, 'GET',           'executions:read'],
  [/^\/api\/v1\/executions$/, 'GET',                  'executions:read'],
  [/^\/api\/v1\/executions/, 'DELETE',                'executions:write'],

  // Execute workflow
  [/^\/api\/v1\/execute$/, 'POST',                    'workflows:execute'],
  [/^\/api\/v1\/workflows\/[^/]+\/execute$/, 'POST',  'workflows:execute'],

  // Workflow actions before general CRUD
  [/^\/api\/v1\/workflows\/[^/]+\/activate$/, 'POST',   'workflows:activate'],
  [/^\/api\/v1\/workflows\/[^/]+\/deactivate$/, 'POST', 'workflows:activate'],
  [/^\/api\/v1\/workflows\/[^/]+\/archive$/, 'POST',    'workflows:archive'],
  [/^\/api\/v1\/workflows\/[^/]+\/unarchive$/, 'POST',  'workflows:archive'],
  [/^\/api\/v1\/workflows\/[^/]+\/versions/, 'GET',     'workflows:versions:read'],
  [/^\/api\/v1\/workflows\/[^/]+\/duplicate$/, 'POST',  'workflows:write'],
  [/^\/api\/v1\/workflows$/, 'GET',                   'workflows:read'],
  [/^\/api\/v1\/workflows\/[^/]+$/, 'GET',            'workflows:read'],
  [/^\/api\/v1\/workflows$/, 'POST',                  'workflows:write'],
  [/^\/api\/v1\/workflows\/[^/]+$/, 'PUT',            'workflows:write'],
  [/^\/api\/v1\/workflows\/[^/]+$/, 'DELETE',         'workflows:write'],

  // Nodes registry
  [/^\/api\/v1\/nodes/, 'GET',                        'nodes:read'],

  // Credentials — schema and test before general CRUD
  [/^\/api\/v1\/credentials\/schema\//, 'GET',        'credentials:schema:read'],
  [/^\/api\/v1\/credentials\/[^/]+\/test$/, 'POST',   'credentials:test'],
  [/^\/api\/v1\/credentials$/, 'GET',                 'credentials:read'],
  [/^\/api\/v1\/credentials\/[^/]+$/, 'GET',          'credentials:read'],
  [/^\/api\/v1\/credentials$/, 'POST',                'credentials:write'],
  [/^\/api\/v1\/credentials\/[^/]+$/, ['PUT', 'DELETE'], 'credentials:write'],

  // Tags
  [/^\/api\/v1\/tags/, 'GET',                         'tags:read'],
  [/^\/api\/v1\/tags/, ['POST', 'PUT', 'DELETE'],     'tags:write'],

  // Variables
  [/^\/api\/v1\/variables/, 'GET',                    'variables:read'],
  [/^\/api\/v1\/variables/, ['POST', 'PUT', 'DELETE'], 'variables:write'],

  // Integrations
  [/^\/api\/v1\/integrations/, 'GET',                 'integrations:read'],
  [/^\/api\/v1\/integrations/, ['POST', 'DELETE'],    'integrations:write'],

  // Observability
  [/^\/api\/v1\/observability/, 'GET',                'observability:read'],

  // Usage / spend — reads share the observability scope; writes are session-only (enforced in-route)
  [/^\/api\/v1\/usage/, 'GET',                        'observability:read'],

  // Audit
  [/^\/api\/v1\/audit/, 'GET',                        'audit:read'],

  // Memory
  [/^\/api\/v1\/memory/, 'GET',                       'memory:read'],
  [/^\/api\/v1\/memory/, ['POST', 'PUT', 'DELETE'],   'memory:write'],

  // Binary data
  [/^\/api\/v1\/binary/, 'GET',                       'binary_data:read'],
  [/^\/api\/v1\/binary/, 'POST',                      'binary_data:write'],

  // Approvals
  [/^\/api\/v1\/approvals/, 'GET',                    'approvals:read'],
  [/^\/api\/v1\/approvals/, ['POST', 'PUT', 'PATCH'], 'approvals:write'],

  // Evaluations
  [/^\/api\/v1\/evaluations/, 'GET',                  'evaluations:read'],
  [/^\/api\/v1\/evaluations/, ['POST', 'PUT', 'DELETE'], 'evaluations:write'],

  // Templates
  [/^\/api\/v1\/templates/, 'GET',                    'templates:read'],

  // External secrets
  [/^\/api\/v1\/external-secrets/, 'GET',             'external_secrets:read'],

  // Expression preview
  [/^\/api\/v1\/expressions\/preview$/, 'POST',       'expressions:preview'],

  // OttoBot
  [/^\/api\/v1\/ottobot\/chat$/, 'POST',              'ottobot:invoke'],
  [/^\/api\/v1\/ottobot\/credentials$/, 'GET',        'ottobot:invoke'],

  // Import / Export
  [/^\/api\/v1\/import/, 'POST',                      'import:write'],
  [/^\/api\/v1\/export/, 'GET',                       'export:read'],

  // MCP
  [/^\/api\/v1\/mcp/, null,                           'mcp:invoke'],

  // Workspace members
  [/^\/api\/v1\/workspace\/members/, 'GET',           'workspace:members:read'],
  [/^\/api\/v1\/workspace\/members/, ['POST', 'PUT', 'DELETE', 'PATCH'], 'workspace:members:write'],
];

export function resolveScope(pathname, method) {
  for (const [pathRegex, methods, scope] of SCOPE_MAP) {
    if (!pathRegex.test(pathname)) continue;
    if (methods === null) return scope; // method-agnostic
    if (Array.isArray(methods)) {
      if (methods.includes(method)) return scope;
    } else {
      if (methods === method) return scope;
    }
  }
  return null; // unmatched path — no scope required (e.g. health, auth)
}
