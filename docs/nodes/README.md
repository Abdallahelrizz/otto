# Otto Node Reference

Nodes are the building blocks of Otto workflows. Each node has a type string used in workflow JSON, a category that controls its shape and color on the canvas, optional config fields, and an output object passed to downstream nodes. Most text fields support `{{ }}` expression templates — see [Expression context](#expression-context) at the bottom of this page.

---

## Category index

| Category | Nodes |
|----------|-------|
| [Triggers](#triggers) | `webhook_trigger`, `manual_trigger`, `form_trigger`, `chat_trigger`, `schedule_trigger` |
| [Core logic](#core-logic) | `if`, `merge`, `set`, `filter`, `loop`, `delay`, `sub_workflow`, `code`, `send_email`, `datetime`, `crypto`, `jwt` |
| [AI](#ai) | `llm_call`, `ai_agent`, `vector_search`, `memory_read`, `memory_write` |
| [Services](#services) | `slack_send_message`, `discord_send_message`, `telegram_send_message`, `github_api`, `notion_api`, `airtable_records`, `graphql_request` |
| [Data / HTTP](#data--http) | `http_request`, `postgres_query`, `redis_get`, `redis_set` |
| [Transform](#transform) | `csv_parse`, `csv_stringify`, `xml_parse`, `xml_stringify`, `html_extract`, `json_transform`, `compression` |
| [Files / Storage](#files--storage) | `read_file`, `write_file`, `move_binary_data`, `list_files`, `binary_metadata`, `s3_object` |
| [Special](#special) | `placeholder` |

---

## Triggers

Trigger nodes start a workflow. They have no input handles — they fire when an external event arrives and pass the event payload downstream.

### `webhook_trigger`

| | |
|---|---|
| **Name** | Webhook |
| **Description** | Receives an HTTP request at a configured path and starts the workflow with the request payload as output. |
| **Key config fields** | `path` (string) — URL path suffix, e.g. `my-webhook`; `method` (GET\|POST\|PUT\|PATCH\|DELETE\|ANY); `responseMode` (accepted\|custom\|empty); `responseStatus` (number); `responseBody` (code) |
| **Credential** | None |
| **Output shape** | The raw request payload (body + query params merged), passed through as-is. |

**Notes:** Requests are enqueued via BullMQ and return 202 immediately. The workflow runs asynchronously. Register a webhook at `POST /webhooks/<path>`.

---

### `manual_trigger`

| | |
|---|---|
| **Name** | Manual Trigger |
| **Description** | Starts a workflow from the canvas Run button or the `POST /api/v1/execute` endpoint. |
| **Key config fields** | None |
| **Credential** | None |
| **Output shape** | Whatever payload was passed to the execute endpoint, or `{}` for canvas runs. |

**Notes:** Internally aliased to the same handler as `webhook_trigger`.

---

### `form_trigger`

| | |
|---|---|
| **Name** | Form Trigger |
| **Description** | Exposes a public HTML form at `/forms/<path>`; each submission starts the workflow with the form data. |
| **Key config fields** | `path` (string); `title` (string); `description` (textarea); `fieldsJson` (code — JSON array of field definitions); `submitLabel` (string); `responseMessage` (string) |
| **Credential** | None |
| **Output shape** | The submitted form data passed through as input. |

**Notes:** `fieldsJson` example: `[{ "name": "email", "label": "Email", "type": "email", "required": true }]`.

---

### `chat_trigger`

| | |
|---|---|
| **Name** | Chat Trigger |
| **Description** | Starts a workflow from a chat-style message POST at `/chat/<path>`. |
| **Key config fields** | `path` (string); `sessionField` (string — request field containing session ID); `messageField` (string — request field containing the message); `welcomeText` (textarea); `responseMessage` (string) |
| **Credential** | None |
| **Output shape** | The raw request payload passed through as input. |

---

### `schedule_trigger`

| | |
|---|---|
| **Name** | Schedule |
| **Description** | Runs the workflow on a durable schedule driven by BullMQ job schedulers; activates automatically when the workflow's `active` flag is set to `true`. |
| **Key config fields** | `mode` (interval\|cron); `every` (number — for interval mode); `unit` (minutes\|hours\|days); `cron` (string — cron expression for cron mode); `timezone` (IANA timezone string) |
| **Credential** | None |
| **Output shape** | `{}` (empty object — no external payload). |

**Notes:** BullMQ reconciles active workflows on server boot, so schedules survive restarts.

---

## Core logic

Core nodes control flow, transform data, and execute code. They use the neutral (gray) visual style on the canvas.

### `if`

| | |
|---|---|
| **Name** | IF Condition |
| **Description** | Evaluates one or more conditions and routes data to either the `true` or `false` output handle. |
| **Key config fields** | `conditions` (array of `{ left, operator, right }` — see operators below); `combinator` (and\|or) |
| **Credential** | None |
| **Output shape** | `{ _ifBranches: { true: data\|SKIP, false: data\|SKIP } }` — consumed by the executor; downstream nodes receive the live branch's data and a SKIP sentinel on the dead branch. |

**Supported operators:** `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `startsWith`, `endsWith`, `isEmpty`, `isNotEmpty`.

`left` is a dot-path into `input`, e.g. `confidence` or `user.role`. `right` is compared as a string/number.

---

### `merge`

| | |
|---|---|
| **Name** | Merge |
| **Description** | Waits for all incoming branches to complete and combines their outputs. Skipped branches (inactive IF sides) are excluded automatically. |
| **Key config fields** | `mode` (merge-object\|collect-array) |
| **Credential** | None |
| **Output shape** | **merge-object:** a single flat object with all branch outputs shallow-merged. **collect-array:** `{ items: [{ source: nodeId, data: {...} }], count }` |

**Notes:** Accepts up to 3 input handles (`in1`, `in2`, `in3`). Use `collect-array` mode when you need to preserve per-source identity.

---

### `set`

| | |
|---|---|
| **Name** | Set / Transform |
| **Description** | Builds a new output object by assigning fields from expressions; optionally merges the result onto the input. |
| **Key config fields** | `mode` (set\|merge); `assignments` (array of `{ key, value }` pairs — `value` supports `{{ }}` expressions) |
| **Credential** | None |
| **Output shape** | An object containing only the assigned fields (`set` mode) or the input object extended with the assigned fields (`merge` mode). |

**Expression context:** `value` fields are resolved before the handler runs, so `{{ input.name }}` works directly.

---

### `filter`

| | |
|---|---|
| **Name** | Filter |
| **Description** | Passes data through if conditions match; emits a SKIP sentinel if conditions fail, stopping all downstream nodes on that branch. |
| **Key config fields** | `conditions` (same structure as IF node); `combinator` (and\|or) |
| **Credential** | None |
| **Output shape** | Input data unchanged (on pass) or SKIP (on fail). |

---

### `loop`

| | |
|---|---|
| **Name** | Loop |
| **Description** | Iterates over an array and emits one item at a time on the `loop` output; after all items, signals completion on the `done` output. |
| **Key config fields** | `over` (string — dot-path to array in input, e.g. `input.items`); `limit` (number — max iterations, hard cap 1000) |
| **Credential** | None |
| **Output shape** | `{ items: [...], count }` — each element is an item wrapper with `json`, `binary`, and `pairedItem` fields. |

**Notes:** Default `over` value is `input` (treat the entire input as the array). Maximum 100 iterations by default.

---

### `delay`

| | |
|---|---|
| **Name** | Delay |
| **Description** | Pauses workflow execution for a fixed amount of time before passing data through. |
| **Key config fields** | `amount` (number); `unit` (ms\|s\|m) |
| **Credential** | None |
| **Output shape** | Input data unchanged. |

**Notes:** Maximum delay is 5 minutes (300 000 ms) regardless of config.

---

### `sub_workflow`

| | |
|---|---|
| **Name** | Sub-workflow |
| **Description** | Calls another saved workflow synchronously and returns its merged final output. |
| **Key config fields** | `workflowId` (string — UUID of the target workflow) |
| **Credential** | None |
| **Output shape** | Merged outputs of all leaf nodes in the sub-workflow, plus `_subExecutionId` (UUID of the nested execution). |

**Notes:** Maximum recursion depth is 5. The sub-workflow runs in the same workspace.

---

### `code`

| | |
|---|---|
| **Name** | Code |
| **Description** | Runs arbitrary code in a sandboxed Piston container; supports JavaScript (Node 18), Python 3.11, and Bash. |
| **Key config fields** | `language` (javascript\|python\|bash); `version` (string, e.g. `18.x`); `code` (code); `timeoutMs` (number, 100–30 000, default 5 000); `memoryLimitMb` (number, 16–512, default 128); `stdinMode` (json\|raw) |
| **Credential** | None |
| **Output shape** | `{ language, version, stdout, stderr, output, exitCode, signal, result }` — `result` is the JSON-parsed stdout if parseable, otherwise the raw string. |

**Notes:** In JavaScript mode, the code is automatically wrapped so `input` is available as a variable. Return a value with `return myData;`. Requires a running Piston instance (`PISTON_URL` env var).

---

### `send_email`

| | |
|---|---|
| **Name** | Send Email |
| **Description** | Sends an email via nodemailer using an SMTP credential or the Resend SMTP gateway. |
| **Key config fields** | `to` (string — recipient address, supports `{{ }}`); `subject` (string, supports `{{ }}`); `body` (textarea — plain text body); `html` (HTML body, optional) |
| **Credential** | Required — `smtp` type with `{ host, port, user, pass }` or `{ provider: 'resend', apiKey }` |
| **Output shape** | `{ messageId, accepted }` |

---

### `datetime`

| | |
|---|---|
| **Name** | DateTime |
| **Description** | Parses, formats, adds to, subtracts from, or diffs dates; can also convert to a timezone. |
| **Key config fields** | `operation` (now\|format\|parse\|add\|subtract\|diff\|toTimezone); `value` (string — date input, supports `{{ }}`); `inputFormat` (auto\|iso\|unix\|unixMs); `outputFormat` (iso\|unix\|unixMs\|locale or custom pattern like `YYYY-MM-DD`); `addAmount` (number); `addUnit` (seconds\|minutes\|hours\|days\|weeks\|months\|years); `diffUnit` (same options); `timezone` (IANA string) |
| **Credential** | None |
| **Output shape** | `{ result, timestamp, iso }` — `result` is the formatted value, `timestamp` is epoch ms, `iso` is ISO 8601. For `diff`: `{ result, unit, a, b, timestamp, iso }`. For `toTimezone`: `{ result, timestamp, iso, timezone }`. |

**Notes:** Custom output format tokens: `YYYY`, `MM`, `MMM`, `DD`, `HH`, `mm`, `ss`. For `diff`, supply dates in `input.a` and `input.b` (or a comma-separated `value`).

---

### `crypto`

| | |
|---|---|
| **Name** | Crypto |
| **Description** | Hashes, HMACs, encodes, decodes, or generates secure random values. |
| **Key config fields** | `operation` (md5\|sha1\|sha256\|sha512\|hmac-sha256\|hmac-sha512\|base64-encode\|base64-decode\|uuid\|random-bytes); `value` (string — data to process, supports `{{ }}`); `secret` (string — HMAC key, required for HMAC ops); `encoding` (hex\|base64 — hash output encoding); `length` (number — byte length for `random-bytes`, default 16) |
| **Credential** | None |
| **Output shape** | `{ result, operation }` — `result` is the hash/encoded string or UUID. |

---

### `jwt`

| | |
|---|---|
| **Name** | JWT |
| **Description** | Signs, verifies, or decodes JSON Web Tokens using HMAC algorithms. |
| **Key config fields** | `operation` (sign\|verify\|decode); `payload` (code — JSON payload object for `sign`); `token` (textarea — JWT string for `verify`/`decode`, supports `{{ }}`); `secret` (string — signing/verification secret); `algorithm` (HS256\|HS384\|HS512); `expiresIn` (string — e.g. `1h`, `7d`, or number of seconds) |
| **Credential** | None |
| **Output shape** | **sign:** `{ token, algorithm, expiresAt }`. **verify:** `{ valid, expired, payload, header, error }`. **decode:** `{ payload, header }`. |

---

## AI

AI nodes call language models, manage tool-use agents, and read/write semantic memory. They use the amber visual style on the canvas.

### `llm_call`

| | |
|---|---|
| **Name** | LLM Call |
| **Description** | Makes a single call to any language model (OpenAI, Anthropic, or any OpenRouter model) and returns the generated text. |
| **Key config fields** | `provider` (openai\|anthropic\|openrouter); `model` (string — model ID, e.g. `gpt-4o`, `claude-opus-4-5`); `systemPrompt` (textarea, supports `{{ }}`); `userPrompt` (textarea, supports `{{ }}`); `temperature` (number 0–1, default 0.7); `maxTokens` (number, default 1000) |
| **Credential** | Optional — `api_key` credential for the provider; falls back to `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENROUTER_API_KEY` env vars. |
| **Output shape** | `{ text, model, usage: { prompt_tokens, completion_tokens, total_tokens }, finishReason }` |

**Expression context:** Both `systemPrompt` and `userPrompt` are resolved before the API call, so `{{ input.userMessage }}` works directly.

---

### `ai_agent`

| | |
|---|---|
| **Name** | AI Agent |
| **Description** | An autonomous LLM agent that calls tools (other Otto node types) in a loop until it reaches a final answer. |
| **Key config fields** | `provider` (openai\|anthropic\|openrouter); `model` (string, default `gpt-4o`); `systemPrompt` (textarea, supports `{{ }}`); `tools` (array of `{ id, name, type, description, parameters, config }` — `type` must be a registered node type); `maxSteps` (number, default 10, hard cap 100) |
| **Credential** | Optional — same fallback as `llm_call`. |
| **Output shape** | `{ text, steps: [{ tool, input, output, durationMs }], model, usage: { prompt_tokens, completion_tokens, total_tokens } }` |

**Notes:** Each tool call is executed as a real Otto node handler. Multiple tool calls within a single LLM turn are executed in parallel (`Promise.all`).

---

### `vector_search`

| | |
|---|---|
| **Name** | Vector Search |
| **Description** | Embeds a query with OpenAI and finds semantically similar entries in `memory_patterns` using pgvector cosine similarity. |
| **Key config fields** | `query` (string — text to search, supports `{{ }}`); `collection` (string — currently unused; searches `memory_patterns`); `topK` (number — number of results, 1–50, default 5); `category` (string — optional filter); `minScore` (number 0–1 — optional minimum similarity threshold) |
| **Credential** | Optional — OpenAI credential for embedding; falls back to `OPENAI_API_KEY`. |
| **Output shape** | `{ results: [{ id, content, category, confidence, hit_count, similarity }], count }` |

---

### `memory_read`

| | |
|---|---|
| **Name** | Memory Read |
| **Description** | Retrieves semantic patterns, session interactions, or session summaries from the memory subsystem. |
| **Key config fields** | `mode` (semantic\|session\|summary\|all); `query` (string — text query for semantic mode, supports `{{ }}`); `sessionId` (string, supports `{{ }}`); `category` (string — optional filter for semantic mode); `topK` (number 1–50); `minScore` (number 0–1) |
| **Credential** | Optional — OpenAI credential for embedding (semantic/all modes). |
| **Output shape** | `{ mode, query, sessionId, category, patterns: [...], interactions: [...], summary: {...}\|null, count }` |

---

### `memory_write`

| | |
|---|---|
| **Name** | Memory Write |
| **Description** | Persists a pattern, interaction pair, or session summary to the memory subsystem; embeds text automatically. |
| **Key config fields** | `mode` (pattern\|interaction\|summary); `content` (string — text to store, for `pattern` mode, supports `{{ }}`); `category` (string, default `general`); `sessionId` (string, supports `{{ }}`); `inputText` / `outputText` (strings for `interaction` mode); `summary` (string for `summary` mode); `confidence` (number 0–1, default 1) |
| **Credential** | Optional — OpenAI credential for embedding. |
| **Output shape** | **pattern:** `{ mode, pattern: { id, content, category, confidence } }`. **interaction:** `{ mode, interaction: { id, session_id, input, output, confidence, created_at } }`. **summary:** `{ mode, summary: { session_id, summary, turn_count, updated_at } }`. |

---

## Services

Service nodes interact with external platforms. Each requires a credential or an inline token override.

### `slack_send_message`

| | |
|---|---|
| **Name** | Slack Send Message |
| **Description** | Posts a message to a Slack channel using the Slack Web API (`chat.postMessage`). |
| **Key config fields** | `credentialId` (string — credential UUID); `token` (string — bot token override); `channel` (string — channel ID or name, e.g. `#general`); `text` (textarea, supports `{{ }}`); `blocksJson` (code — optional Block Kit JSON array) |
| **Credential** | `slack` type with `{ botToken }` (or `token`/`apiKey`). |
| **Output shape** | The full Slack API response body (includes `ts`, `channel`, `message`, etc.). |

---

### `discord_send_message`

| | |
|---|---|
| **Name** | Discord Send Message |
| **Description** | Sends a message through a Discord webhook URL. |
| **Key config fields** | `credentialId` (string); `webhookUrl` (string — full Discord webhook URL override); `content` (textarea — message text, supports `{{ }}`); `username` (string — display name override); `embedsJson` (code — optional Discord embeds JSON array) |
| **Credential** | `discord` type with `{ webhookUrl }`. |
| **Output shape** | `{ ok: true, statusCode, body }` |

---

### `telegram_send_message`

| | |
|---|---|
| **Name** | Telegram Send Message |
| **Description** | Sends a message via the Telegram Bot API (`sendMessage`). |
| **Key config fields** | `credentialId` (string); `botToken` (string — bot token override); `chatId` (string — target chat/group/channel ID, supports `{{ }}`); `text` (textarea, supports `{{ }}`); `parseMode` (none\|MarkdownV2\|HTML) |
| **Credential** | `telegram` type with `{ botToken }`. |
| **Output shape** | The Telegram API response body (includes `ok`, `result.message_id`, etc.). |

---

### `github_api`

| | |
|---|---|
| **Name** | GitHub API |
| **Description** | Calls any GitHub REST API endpoint with automatic authentication and versioned headers. |
| **Key config fields** | `credentialId` (string); `token` (string — token override); `method` (GET\|POST\|PUT\|PATCH\|DELETE); `path` (string — API path, e.g. `/repos/owner/repo/issues`, supports `{{ }}`); `body` (code — JSON request body) |
| **Credential** | `github` type with `{ token }` (Personal Access Token). |
| **Output shape** | `{ statusCode, headers, body }` — `body` is the parsed GitHub API response. |

---

### `notion_api`

| | |
|---|---|
| **Name** | Notion API |
| **Description** | Calls any Notion API endpoint with the versioned `Notion-Version` header. |
| **Key config fields** | `credentialId` (string); `token` (string — integration token override); `method` (GET\|POST\|PATCH\|DELETE); `path` (string — API path, e.g. `/pages`, supports `{{ }}`); `body` (code — JSON request body); `notionVersion` (string, default `2022-06-28`) |
| **Credential** | `notion` type with `{ token }` (Notion integration secret). |
| **Output shape** | `{ statusCode, headers, body }` — `body` is the parsed Notion API response. |

---

### `airtable_records`

| | |
|---|---|
| **Name** | Airtable Records |
| **Description** | Lists, creates, updates, or deletes records in an Airtable base. |
| **Key config fields** | `credentialId` (string); `token` (string — personal access token override); `operation` (list\|create\|update\|delete); `baseId` (string, required); `tableName` (string, required); `recordId` (string — required for update/delete); `fieldsJson` (code — JSON object of field values for create/update); `filterByFormula` (string — Airtable formula for list); `maxRecords` (number, default 100) |
| **Credential** | `airtable` type with `{ token }`. |
| **Output shape** | The raw Airtable API response body (`records` array for list, single record object for create/update, `deleted: true` for delete). |

---

### `graphql_request`

| | |
|---|---|
| **Name** | GraphQL Request |
| **Description** | Executes a GraphQL query or mutation against any endpoint. |
| **Key config fields** | `credentialId` (string); `endpoint` (string — GraphQL endpoint URL, required); `authHeader` (string — header name for token, default `Authorization`); `token` (string — bearer token override); `query` (code — GraphQL query or mutation); `variablesJson` (code — JSON variables object) |
| **Credential** | Optional — credential with `{ token }` for authenticated APIs. |
| **Output shape** | The parsed GraphQL response body (includes `data` and possibly `errors`). Throws on GraphQL errors. |

---

## Data / HTTP

### `http_request`

| | |
|---|---|
| **Name** | HTTP Request |
| **Description** | Calls any REST API endpoint with configurable method, headers, body, and authentication; auto-parses JSON responses. |
| **Key config fields** | `url` (string — full URL, required, supports `{{ }}`); `method` (GET\|POST\|PUT\|PATCH\|DELETE, default GET); `headers` (object or array of `{ key, value }` pairs); `body` (object or string — auto-encoded as JSON if object); `timeout` (number — ms, default 30 000); `authType` (none\|api_key\|bearer\|basic); `authKey` / `authValue` / `authUsername` / `authPassword` (inline auth fallbacks) |
| **Credential** | Optional — `api_key`, `bearer_token`, or `basic`/`basic_auth` credential type. |
| **Output shape** | `{ statusCode, headers, body }` — `body` is JSON-parsed when possible, otherwise raw text. Throws on non-2xx. |

**Expression context:** `url` and any `{{ }}` expressions in `headers` or `body` values are resolved before the request is made.

---

### `postgres_query`

| | |
|---|---|
| **Name** | Postgres Query |
| **Description** | Executes a parameterised SQL query against a Postgres database with a 30-second statement timeout. |
| **Key config fields** | `query` (code — SQL with `$1`, `$2`, … placeholders, required); `params` (code — JSON array of parameter values, default `[]`) |
| **Credential** | Optional — `postgres` type with `{ connectionString }`. Falls back to the Otto instance database (`DATABASE_URL`). |
| **Output shape** | `{ rows: [...], rowCount }` |

**Expression context:** Parameter values in `params` array can be `{{ }}` expressions evaluated before the query runs.

---

### `redis_get`

| | |
|---|---|
| **Name** | Redis Get |
| **Description** | Reads a value from Redis by key. |
| **Key config fields** | `key` (string — Redis key, supports `{{ }}`) |
| **Credential** | Optional — `redis` type with `{ url }`. Falls back to `REDIS_URL` env var. |
| **Output shape** | `{ key, value, found }` — `value` is the raw string or `null` if missing; `found` is a boolean. |

---

### `redis_set`

| | |
|---|---|
| **Name** | Redis Set |
| **Description** | Writes a value to Redis by key with an optional TTL. |
| **Key config fields** | `key` (string — Redis key, supports `{{ }}`); `value` (string — value to store, supports `{{ }}`); `ttl` (number — expiry in seconds; omit or 0 for no expiry) |
| **Credential** | Optional — same as `redis_get`. |
| **Output shape** | `{ key, ok: true }` |

---

## Transform

Transform nodes convert data between formats. All text input fields support `{{ }}` expressions.

### `csv_parse`

| | |
|---|---|
| **Name** | CSV Parse |
| **Description** | Converts CSV text into an array of row objects. |
| **Key config fields** | `text` (textarea — CSV text, supports `{{ }}`); `sourceField` (string — fallback input field name, default `data`); `delimiter` (string, default `,`); `hasHeader` (true\|false); `trim` (true\|false); `columns` (string — comma-separated column names when no header row) |
| **Credential** | None |
| **Output shape** | `{ rows: [...], items: [...], columns: [...], count }` |

---

### `csv_stringify`

| | |
|---|---|
| **Name** | CSV Stringify |
| **Description** | Converts an array of objects into CSV text. |
| **Key config fields** | `value` (textarea — rows array, supports `{{ }}`); `sourceField` (string — fallback input field, default `rows`); `delimiter` (string, default `,`); `includeHeader` (true\|false); `columns` (string — comma-separated column names to include) |
| **Credential** | None |
| **Output shape** | `{ csv, columns: [...], count }` |

---

### `xml_parse`

| | |
|---|---|
| **Name** | XML Parse |
| **Description** | Converts XML text into a JSON object using a lightweight built-in parser (no external dependencies). |
| **Key config fields** | `text` (textarea — XML text, supports `{{ }}`); `sourceField` (string — fallback input field, default `data`) |
| **Credential** | None |
| **Output shape** | `{ result: {...}, ...spread of result keys }` — attributes appear under `$`, text content under `_text`. |

---

### `xml_stringify`

| | |
|---|---|
| **Name** | XML Stringify |
| **Description** | Converts a JSON object back into XML text. |
| **Key config fields** | `value` (code — JSON value, supports `{{ }}`); `sourceField` (string — fallback input field, default `data`); `rootName` (string — root element tag name, default `root`) |
| **Credential** | None |
| **Output shape** | `{ xml }` |

---

### `html_extract`

| | |
|---|---|
| **Name** | HTML Extract |
| **Description** | Extracts text, inner HTML, or an attribute value from HTML using a CSS-style selector. |
| **Key config fields** | `html` (textarea — HTML to parse, supports `{{ }}`); `sourceField` (string — fallback input field, default `html`); `selector` (string — CSS selector, e.g. `h1`, `#main`, `.title`); `attribute` (text\|html\|href\|src\|content); `multiple` (false\|true — return first match or all matches) |
| **Credential** | None |
| **Output shape** | `{ result, matches: [...], count }` — `result` is a single string (`multiple: false`) or an array (`multiple: true`). |

---

### `json_transform`

| | |
|---|---|
| **Name** | JSON Transform |
| **Description** | Gets, sets, picks, omits, parses, stringifies, or merges JSON with dot-path addressing. |
| **Key config fields** | `operation` (get\|set\|pick\|omit\|parse\|stringify\|merge); `value` (code — source JSON, supports `{{ }}`); `sourceField` (string — fallback input field); `path` (string — dot-path for get/set/omit); `paths` (string — comma-separated dot-paths for pick/omit); `setValue` (code — value for set/merge); `space` (number — indentation for stringify, default 2) |
| **Credential** | None |
| **Output shape** | `{ result }` — `result` is the transformed value. For `get`, also returns `{ value }` alias. |

---

### `compression`

| | |
|---|---|
| **Name** | Compression |
| **Description** | Gzips, gunzips, deflates, or inflates a text or binary payload using Node.js built-in `zlib`. |
| **Key config fields** | `operation` (gzip\|gunzip\|deflate\|inflate); `value` (textarea — data to compress/decompress, supports `{{ }}`); `sourceField` (string — fallback input field, default `data`); `inputEncoding` (utf8\|base64); `outputEncoding` (base64\|utf8) |
| **Credential** | None |
| **Output shape** | `{ result, operation, inputEncoding, outputEncoding }` |

---

## Files / Storage

File nodes read and write binary data within the workspace file area. Binary data is stored as references (not inline) and passed between nodes via a `binary` property map.

### `read_file`

| | |
|---|---|
| **Name** | Read File |
| **Description** | Reads a workspace file and stores it as binary data, returning a reference. |
| **Key config fields** | `path` (string — workspace-relative file path, required); `binaryProperty` (string — property name on the output `binary` map, default `data`); `mimeType` (string — MIME type override) |
| **Credential** | None |
| **Output shape** | `{ fileName, mimeType, sizeBytes, binary: { [binaryProperty]: binaryRef } }` |

---

### `write_file`

| | |
|---|---|
| **Name** | Write File |
| **Description** | Writes binary data from the `binary` map to a workspace file path. |
| **Key config fields** | `path` (string — destination workspace file path); `binaryProperty` (string — property name on `input.binary` to read from, default `data`) |
| **Credential** | None |
| **Output shape** | `{ fileName, path, sizeBytes }` |

---

### `move_binary_data`

| | |
|---|---|
| **Name** | Move Binary Data |
| **Description** | Converts a JSON text field to a binary reference (`json_to_binary`) or extracts binary data back into a JSON text field (`binary_to_json`). |
| **Key config fields** | `mode` (json_to_binary\|binary_to_json); `sourceField` (string — JSON field to read, for `json_to_binary`); `targetField` (string — JSON field to write, for `binary_to_json`); `binaryProperty` (string — binary map key, default `data`); `fileName` (string); `mimeType` (string); `encoding` (utf8\|base64) |
| **Credential** | None |
| **Output shape** | **json_to_binary:** input extended with `binary: { [binaryProperty]: ref }`. **binary_to_json:** input with the target field set to the text content. |

---

### `list_files`

| | |
|---|---|
| **Name** | List Files |
| **Description** | Lists files in a workspace directory, with optional recursive traversal and glob pattern filtering. |
| **Key config fields** | `path` (string — workspace directory to list, default `.`); `pattern` (string — glob pattern, default `*`); `recursive` (false\|true); `includeDirectories` (false\|true); `maxDepth` (number, 0–20, default 5); `limit` (number, 1–1000, default 250) |
| **Credential** | None |
| **Output shape** | `{ path, files: [...], items: [...], count, truncated }` — each file object includes `name`, `path`, `size`, `mimeType`, `isDirectory`, `modifiedAt`. |

---

### `binary_metadata`

| | |
|---|---|
| **Name** | Binary Metadata |
| **Description** | Inspects binary data references without downloading file content; can also list recent binary uploads. |
| **Key config fields** | `source` (input\|id\|recent); `binaryProperty` (string — input property to inspect, default `data`); `binaryId` (string — UUID for `id` mode); `lookup` (true\|false — query database for full metadata); `limit` (number — max results for `recent` mode, 1–250, default 50); `fileNameContains` (string — filter for `recent`); `mimeType` (string — MIME type filter for `recent`) |
| **Credential** | None |
| **Output shape** | `{ source, binaryProperty, found, binary: { id, fileName, mimeType, sizeBytes, metadata, createdAt } }`. For `recent`: `{ source, binaries: [...], items: [...], count }`. |

---

### `s3_object`

| | |
|---|---|
| **Name** | S3 Object |
| **Description** | Lists, uploads (put), downloads (get), inspects metadata (head), or deletes objects in any S3-compatible storage (AWS S3, MinIO, R2, etc.). Implements AWS Signature Version 4 signing natively. |
| **Key config fields** | `operation` (list\|get\|put\|head\|delete); `credentialId` (string); `endpoint` (string — endpoint URL override for non-AWS providers); `region` (string, default `us-east-1`); `bucket` (string, required); `key` (string — object key, required except for `list`); `prefix` (string — key prefix filter for `list`); `maxKeys` (number, 1–1000, default 100); `sourceMode` (text\|binary — for `put`); `value` (textarea — upload text content); `binaryProperty` (string — binary map key for binary upload/download); `contentType` (string); `forcePathStyle` (true\|false) |
| **Credential** | `s3` type with `{ accessKeyId, secretAccessKey, region, endpoint, bucket }`. Also reads `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_ENDPOINT`, `S3_BUCKET` env vars. |
| **Output shape** | **list:** `{ bucket, prefix, objects: [{ key, lastModified, eTag, size, storageClass }], count, nextContinuationToken, isTruncated }`. **get:** `{ bucket, key, fileName, binary: { [binaryProperty]: ref }, eTag, contentType, contentLength, lastModified }`. **put:** `{ bucket, key, ok: true, status, eTag, ... }`. **head:** `{ bucket, key, found: true, eTag, contentType, contentLength, lastModified }`. **delete:** `{ bucket, key, deleted: true, status }`. |

---

## Special

### `placeholder`

| | |
|---|---|
| **Name** | Unsupported n8n Node |
| **Description** | A non-executable stand-in created by the n8n importer when a node type has no Otto equivalent yet. Always throws at runtime. |
| **Key config fields** | `n8nOriginalType` (string — the original n8n node type, set automatically by the importer) |
| **Credential** | None |
| **Output shape** | Never returns — throws `Placeholder node — no handler for "<type>". Map or replace this node before running.` |

**Notes:** Replace placeholder nodes with a real Otto node type before running the workflow.

---

## Expression context

Most string config fields support `{{ }}` template expressions. Expressions are resolved by the executor before the node handler runs.

| Syntax | Resolves to |
|--------|-------------|
| `{{ input.field }}` | Dot-path into the merged output of all upstream nodes. |
| `{{ input.a.b.c }}` | Nested dot-path, e.g. `{{ input.user.address.city }}`. |
| `{{ nodes.nodeId.field }}` | Dot-path into the output of a specific previously-executed node by its node ID. |

Expressions recurse into nested objects and arrays, so they work inside JSON strings, URL paths, and any text field.

**Example:** A Set node with `value: "Hello {{ input.name }}, your score is {{ nodes.llm1.text }}"` produces a string with both values substituted.
