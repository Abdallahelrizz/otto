# Otto

Otto is an AI-native workflow orchestrator with a visual canvas, built around parallel
execution and multi-model / multi-agent workflows. Source-available and free to self-host
for your own use (see [License](#license)).

Otto is **not** a drop-in n8n replacement. n8n has hundreds more integrations and years
more operational maturity. Otto is for teams building AI workflows that fan out across
several models or agents and want them self-hosted, observable, and invocable over
API/MCP. If you need integration breadth, use n8n.

## Why Otto

- **True parallel execution** — Otto analyzes the workflow DAG and runs independent
  branches simultaneously with `Promise.all()`, instead of serializing every node.
- **AI-native** — LLM, parallel-AI (fan-out to many models), and agent nodes; a
  pgvector-backed memory system; and **OttoBot**, an in-canvas workflow assistant.
- **Wait / resume** — durable resume tokens, retries, timeouts, and error-workflow
  dispatch for long-running and human-in-the-loop flows. Waiting executions are persisted
  in Postgres and resumable by time, webhook, or approval. Note: Otto is not a durable
  execution engine in the Temporal sense — a process crash mid-node is not replayed, and
  in-flight nodes are not currently abortable. Use idempotent endpoints for side effects.
- **Own your credentials** — AES-256-GCM encrypted at rest, never returned by the API.

## Stack

- Backend: Node.js, Fastify
- Frontend: React, Vite, TypeScript
- Queue: Redis, BullMQ
- Database: Postgres with pgvector
- Code node sandbox: self-hosted Piston

## Features

- **50+ node types** across triggers (webhook / form / chat / schedule), flow control
  (if / filter / merge / set / loop / wait / human-approval / sub-workflow), AI
  (llm_call / parallel_ai / ai_agent), data (postgres / redis / vector / memory),
  files & binary (read / write / list / S3), utilities (crypto / datetime / jwt / code /
  http / graphql / email), and 12+ branded service integrations.
- **Declarative service framework** — add a REST integration with a single descriptor
  file plus `npm run gen:nodes` (no hand-written handler/panel). GitHub and HubSpot ship
  this way.
- **Live execution streaming** over SSE, execution history, and observability summaries.
- **API keys** (HMAC-SHA256, scoped, expiring), **n8n import/export**, workspace
  variables, tags, templates, and an audit log.
- **MCP server (preview)** — a JSON-RPC endpoint exposing five tools (list/run workflow,
  get/list executions, cancel). Not full resource parity with the REST API yet.

## Local setup

You need Postgres (with pgvector) and Redis. `docker compose up -d postgres redis` starts
both locally.

1. Install dependencies:

   ```powershell
   npm install
   npm install --prefix canvas
   ```

2. Create your env file and fill in the required keys:

   ```powershell
   Copy-Item .env.example .env
   ```

   Required:

   - `DATABASE_URL`
   - `REDIS_URL`
   - `CREDENTIAL_ENCRYPTION_KEY` — 32-byte hex (`openssl rand -hex 32`)
   - `API_KEY_PEPPER` — 32-byte hex (`openssl rand -hex 32`)

   The server refuses to start without the two secrets above.

3. Run migrations, then start both processes:

   ```powershell
   npm run migrate
   npm run dev                 # backend on :3000
   npm run dev --prefix canvas # canvas on :5173
   ```

## Docker

```bash
docker compose up --build
```

This starts Postgres (pgvector), Redis, Piston, and Otto. Migrations run automatically on
boot. Set the required secrets in `.env` first.

## Production & security

Otto is safe to self-host single-tenant with defaults. When exposing it to untrusted users
or running multi-tenant, review [SECURITY.md](./SECURITY.md) and set:

| Variable | Effect |
|---|---|
| `ALLOWED_ORIGINS` | Explicit CORS allowlist. Unset in production ⇒ same-origin only (no arbitrary-origin reflection). |
| `PISTON_URL` | Your own Piston for the Code node. The public fallback is off unless `PISTON_ALLOW_PUBLIC=true`. |
| `POSTGRES_NODE_ALLOW_SYSTEM_DB` | Leave unset — the Postgres node then requires a credential and can't touch Otto's own DB. |
| `METRICS_TOKEN` | Require a bearer token on `GET /metrics`. |
| `SSRF_ALLOW_PRIVATE` | Leave unset — setting `true` disables the SSRF egress guard. |

## Tests

```bash
node --test test/services-*.test.js test/redirect-auth.test.js test/expression-sandbox.test.js
cd canvas && npm run gen:nodes && npx tsc --noEmit
```

## Repository notes

- Do not commit `.env` or real secrets.
- Runtime files are stored under `files/` and are ignored.
- Local agent/tooling state (`.agents/`, `.claude/`, `.external/`, `graphify-out/`, …) is ignored.

## License

Otto is **source-available** under the [Business Source License 1.1](./LICENSE) (BSL 1.1).

- **Free** to self-host, read, and modify for your own or your organization's internal use.
- You **may not** offer Otto to third parties as a hosted or managed commercial service that
  competes with the maintainers' offering (e.g. Otto Cloud).
- On the Change Date (2030-07-06), each released version converts to the **Apache License 2.0**.

Need a commercial/hosting arrangement? Contact the maintainer.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
Report vulnerabilities privately per [SECURITY.md](./SECURITY.md).
