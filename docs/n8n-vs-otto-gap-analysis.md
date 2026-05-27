# n8n vs Otto Gap Analysis

Date: 2026-05-25

Compared against:

- Local Otto workspace: `C:\Users\abdal\Desktop\automation`
- Local graph: `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md`
- Referenced n8n repo: `https://github.com/Abdallahelrizz/ottoFromn8n.git`
- n8n commit inspected: `4ba6b99cea7af58207887e084a3b0987cc44b03e` on `master`

Checkout note: the n8n clone fetched successfully, but Windows refused a few very long Playwright fixture paths during checkout. I used the Git tree/object database for inventory counts, so those long-path fixture files do not affect the product/domain comparison.

## Executive Verdict

Otto's repo is an early P0/P1 self-hostable workflow orchestrator whose strongest implemented differentiator is a true parallel DAG executor. The n8n repo is a mature automation platform with a monorepo architecture, hundreds of registered nodes, hundreds of credential types, a full editor, multi-user enterprise surfaces, public API/CLI infrastructure, extensive database schema, config, security, observability, tests, release tooling, and documentation.

If the target is "everything n8n does, plus Otto's AI-era layer", the largest missing areas are:

1. Node and credential ecosystem breadth.
2. n8n-compatible workflow data model, item model, binary data, node parameter schemas, and expression runtime.
3. Full credential/OAuth/external-secret system.
4. Multi-user projects, RBAC, SSO, MFA, API keys, invitation and password flows.
5. Frontend editor depth: node discovery, execution debug UX, credentials UI, settings, data tables, templates, variables, users, projects, versions.
6. Public API, CLI, MCP, SDKs, and community package extensibility.
7. Production hardening: config matrix, migrations, pruning, metrics, log streaming, source control, release tooling, CI and test coverage.

Otto currently has useful seeds for these domains, but most are thin or not wired end-to-end.

## Evidence Snapshot

### Local Otto

- Graph report: 377 nodes, 425 edges, 61 communities.
- Source/doc/config files outside generated/vendor/external folders: 121.
- Backend: `src/`, 48 source files.
- Frontend: `canvas/src/`, 22 source files.
- Backend package: 10 runtime dependencies, no dev dependencies.
- Canvas package: 8 runtime dependencies, 9 dev dependencies.
- API route files: 7 route modules.
- Fastify endpoint registrations found: 27.
- Database schema: 16 `CREATE TABLE` statements, 5 SQL migrations plus migration runner.
- Node registry: 21 registered node type keys, including `manual_trigger` and `placeholder`.
- Canvas node library: 18 visible node definitions in `canvas/src/components/nodes/nodeConfig.ts`.
- Tests: 2 files under `test/`, both Cortex Brain demo/workflow artifacts rather than a full automated suite.

### Referenced n8n Repo

- Tracked files: 19,180.
- Package manifests: 73 package.json files.
- Root package: `n8n-monorepo` version `2.22.0`, Node `>=22.22`, pnpm `>=10.22.0`, Turbo build.
- Major package groups:
  - `packages/nodes-base`: 6,580 files.
  - `packages/frontend`: 3,594 files.
  - `packages/cli`: 2,238 files.
  - `packages/testing`: 1,390 files.
  - `packages/@n8n/nodes-langchain`: 831 files.
  - `packages/@n8n/instance-ai`: 491 files.
  - `packages/@n8n/ai-workflow-builder.ee`: 457 files.
  - `packages/@n8n/db`: 401 files.
- `n8n-nodes-base` package manifest registers 439 node files and 397 credential files.
- `@n8n/nodes-langchain` package manifest registers 119 node files and 38 credential files.
- Node family folders under `packages/nodes-base/nodes`: 307.
- Unique LangChain/AI node names under `packages/@n8n/nodes-langchain/nodes`: 132.
- Credential files under `packages/nodes-base/credentials`: 396 unique names by source scan.
- Backend API controllers: 91 controller files; 417 HTTP route decorators found in primary controller/module paths.
- Database model: 43 entity files, 141 common migrations, 54 Postgres-specific migrations, 56 SQLite-specific migrations.
- Config/env surface: 415 distinct `@Env()` variables found.
- Frontend editor source: 867 `.vue` files and 1,644 `.ts` files under `packages/frontend/editor-ui/src`.
- Test-related files: 4,959 across unit, integration, e2e, performance, evals, node tests, and fixtures.

## Domain Matrix

| Domain | n8n Has | Otto Has | Gap |
|---|---|---|---|
| Product maturity | Public mature automation platform with README positioning, 400+ integrations, 900+ templates, cloud/self-host/community/enterprise story. | Product vision in `CLAUDE.md`, design handoffs, P0/P1/P2 roadmap. | Otto is a working foundation plus roadmap, not a market-complete n8n peer yet. |
| Repo architecture | pnpm/Turbo monorepo with 73 package manifests and many isolated packages. | Two-package app: Node/Fastify backend and React/Vite canvas. | Missing package boundaries for workflow core, UI packages, node SDK, DB package, config, API types, test utilities, extension SDK. |
| Backend framework | Express-based CLI/server package, decorator controllers, TypeScript, DI/decorators, OpenAPI-related dependencies. | Fastify route functions in JS. | Missing typed API layer, controller registry, DTO/schema validation depth, generated API/client contracts. |
| Execution model | Mature regular/queue modes, worker/webhook process modes, execution pruning, recovery, concurrency settings, event bus, wait/resume concepts. | BullMQ queue, worker, schedule trigger, SSE events, true parallel DAG executor. | Otto's parallelism is a real advantage, but it lacks n8n's execution lifecycle breadth, recovery controls, partial execution/debug modes, pause/wait model, and pruning matrix. |
| Workflow data model | `n8n-workflow` package with node types, connections, item data, binary data, parameters, validation, workflow diff/checksum, graph helpers. | Simple `{ nodes, edges }` definition persisted as JSONB. | Missing n8n item arrays, paired items, binary data, pin data, sticky notes, node parameter schema, resource locators, type validation, workflow diff/checksum, graph utility depth. |
| Node ecosystem | 439 base registered nodes plus 119 LangChain registered nodes. | 21 registry keys; 18 visible canvas node definitions. | Otto implements a small core subset. It does not have most n8n application, trigger, transform, file, communication, database, and AI nodes. |
| Credentials | 397 base credential definitions plus 38 LangChain credential definitions, OAuth1/OAuth2 controllers, credential tests, dynamic credentials, external secrets, resolvers. | Generic AES-256-GCM encrypted JSON credential store with create/list/delete API. | Missing hundreds of typed credential schemas, OAuth flows, credential testing, credential sharing, dynamic credentials, external secrets, resolver lifecycle, add/edit UI. |
| Integrations | First-class node packages for hundreds of services and credential types. | 20 seeded integrations, mostly wrappers around generic `http_request`, plus a few first-class nodes. | Otto's "integration browser" is metadata, not real first-class service coverage. |
| Triggers | Webhook, manual, schedule/cron, app triggers, email triggers, chat triggers, form triggers, SSE, local file trigger, error trigger, workflow trigger, service-specific triggers. | Webhook, manual alias, schedule trigger. | Missing most trigger categories and trigger-specific activation/deactivation lifecycle. |
| Webhooks/forms/chat | Production webhook controllers, test/production endpoints, form endpoints, chat trigger/chat hub modules. | `/webhooks/:path` enqueues a workflow; no form/chat endpoints. | Missing form builder/runtime, chat-trigger runtime, webhook test mode, wait webhooks, and richer webhook lifecycle. |
| AI/agents | `@n8n/nodes-langchain`, `@n8n/agents`, `@n8n/instance-ai`, AI workflow builder, chat hub, MCP modules, many model/vector/memory/retriever/tool nodes. | `llm_call`, `ai_agent`, `vector_search`, memory tables, OttoBot stub. | Otto has the direction but not n8n's current AI node breadth. OttoBot memory, multi-agent communication, and parallel AI node are roadmap. |
| Expressions | Secure isolated expression runtime using `isolated-vm`, extensions for arrays/strings/dates/numbers/objects, JMESPath, caching, pool, observability. | Simple `{{ input.path }}` / `{{ nodes.id.path }}` string replacement. | Missing JS expression evaluation, safe globals, item-aware data proxy, helpers, transformations, error classification, and expression observability. |
| Code execution | n8n Code/Function ecosystem plus task-runner packages and Python task runner. | Piston-backed `code` node for node/python runtimes. | Otto has a sandboxed code direction, but lacks n8n's task runner integration, item helpers, binary helpers, package loading behavior, and editor/runtime affordances. |
| Data and binary files | Binary-data entity/table, binary-data controller, file nodes, read/write binary, move binary data, file parsers, spreadsheet/PDF/HTML/XML helpers. | No binary-data model; no file storage abstraction. | This is a major compatibility gap for real automation workflows. |
| Database support | SQLite and Postgres supported by TypeORM/migrations, plus many database nodes. | Postgres for Otto state, Redis queue/cache, pgvector memory, Postgres/Redis workflow nodes. | Missing SQLite deployment mode, MySQL/Mongo/Oracle/MSSQL/Snowflake/etc nodes, richer DB config and migration history. |
| Auth/user management | Owner, users, invitations, password reset, MFA, projects, roles, scopes, API keys, SSO SAML/OIDC, LDAP, provisioning. | Single-owner setup/login/session cookies; workspace scoping. | Missing team/multi-user production auth and enterprise identity surface. |
| Security | Helmet/CSP-style config, CSRF, SSRF protection config, external secrets, encryption key manager, credential redaction, scoped permissions, secure config matrix. | Basic headers, rate limiting for auth/webhooks, encrypted credentials, HttpOnly session cookie. | Missing SSRF guardrails, CSRF, CSP matrix, MFA, SSO, secret providers, key rotation/manager, RBAC, redaction enforcement. |
| Public/programmatic API | Large API/controller surface, API key module, API types package, public API config, OpenAPI tooling. | Internal `/api/v1` for auth/workflows/executions/credentials/import/integrations; API keys table exists but middleware not wired. | Missing public API contract, API key auth, scopes, SDK/client generation, external programmatic surface. |
| CLI | `n8n` binary and CLI package. | CLI is P2 roadmap only. | Missing `otto run/list/logs` and operational CLI. |
| MCP | MCP endpoints/modules, MCP browser packages, registry modules, MCP LangChain nodes. | MCP server is P2 roadmap only. | Missing MCP runtime/server and browser integration. |
| Frontend stack | Vue 3, Vite, Pinia, Vue Flow, Element Plus, n8n design system, stores/rest-api-client/i18n packages. | React 18, React Flow, Zustand, custom CSS/components. | Missing mature design system, i18n layer, reusable stores/client packages, many editor panels and settings pages. |
| Frontend UX surface | Full editor: node browser, node docs/parameters, credentials, executions, users, projects, settings, variables, source control, data tables, tags/folders, templates, debug, AI tools. | Single canvas with sidebar tabs for workflows/node library/history/integrations/models/memory/settings, config panel, bottom panels. | Several tabs are thin; credential add UI, execution tab, test tab, version rollback, settings depth, data tables, users/projects are missing. |
| Observability | Execution stats, insights, event bus, log streaming, metrics/Prometheus, Sentry/OpenTelemetry, workflow statistics, annotations. | Execution/node logs, token columns, SSE endpoint, history tab/execution detail. | Missing metrics dashboard, log streaming, insights, annotations, OpenTelemetry/Sentry integration, retention/pruning controls. |
| Config/env | 415 `@Env()` config variables across database, executions, endpoints, security, AI, logging, metrics, SSO, cache, runners, etc. | 10 env vars in `.env.example`. | Missing config system and operational controls. |
| Deployment | Docker images for n8n/base/engine/runners, devcontainer, many workflows, npm package distribution, queue/main/webhook process modes. | Dockerfile plus docker-compose for Postgres/Redis/Piston/server. | Missing production image matrix, process roles, Helm/K8s-style operational surface, release automation, package distribution. |
| Extensibility | Community packages, node-dev, create-node tooling, workflow SDK, extension SDK, scan-community-package, ESLint community-node rules. | Adding a node requires manual changes in 4-5 files. | Missing plugin/community-node loader, SDK, templates, lint/validation tooling, node packaging strategy. |
| Import/export/templates | n8n templates, import/export and n8n package modules. | n8n import route/UI; JSON export mentioned in toolbar docs but limited. | Importer maps only a small subset and degrades the rest to placeholders; no template library. |
| Tests/QA | 4,959 test-related files, Jest/Vitest/Playwright/performance/evals/containers/benchmarks/visual/storybook workflows. | Cortex Brain demo/workflow only; no broad automated test suite. | Missing unit/integration/e2e/performance/security/visual tests. |
| CI/release/process | Extensive `.github` workflows, CODEOWNERS, issue templates, changelog, release scripts, security workflows. | No comparable CI/release setup visible. | Missing production project governance and release machinery. |
| Legal/community | Sustainable Use License, Enterprise license, contributing guide, code of conduct, security policy, changelog. | No local license/community policy files in Otto root. | Missing legal and community scaffolding for a public/open-source project. |
| Internationalization | Frontend i18n package and translation controller. | No i18n layer. | Missing localization framework. |

## Node and Credential Gap

### Otto Node Registry

The backend registry currently maps these node types:

`webhook_trigger`, `manual_trigger`, `schedule_trigger`, `http_request`, `llm_call`, `ai_agent`, `if`, `filter`, `merge`, `set`, `loop`, `delay`, `sub_workflow`, `send_email`, `postgres_query`, `redis_get`, `redis_set`, `vector_search`, `code`, `placeholder`.

The canvas currently exposes these visible node definitions:

`webhook_trigger`, `schedule_trigger`, `http_request`, `if`, `merge`, `set`, `code`, `delay`, `filter`, `loop`, `sub_workflow`, `send_email`, `llm_call`, `ai_agent`, `vector_search`, `postgres_query`, `redis_get`, `redis_set`.

That means `manual_trigger` and `placeholder` are backend-only concepts. Also, three local untracked files exist but are not wired into the registry or canvas:

- `src/nodes/crypto.js`
- `src/nodes/datetime.js`
- `src/nodes/jwt.js`

`jwt.js` imports `jsonwebtoken`, but the root `package.json` does not list `jsonwebtoken`, so that node would also fail without a dependency install if it were registered.

### n8n Base Nodes Missing From Otto

n8n has 307 base node family folders. Otto has direct or approximate conceptual coverage for only a small subset: Webhook, ManualTrigger, Schedule, HttpRequest, If, Merge, Set, Code/Function/FunctionItem, Wait/Delay, Filter, SplitInBatches/Loop, ExecuteWorkflow/SubWorkflow, EmailSend, Postgres, Redis, and a partial OpenAI/LLM concept.

The following n8n base node families have no first-class Otto equivalent today:

A-C:
ActionNetwork, ActiveCampaign, AcuityScheduling, Adalo, Affinity, AgileCrm, Airtable, Airtop, AiTransform, Amqp, ApiTemplateIo, Asana, Autopilot, Aws, BambooHr, Bannerbear, Baserow, Beeminder, Bitbucket, Bitly, Bitwarden, Box, Brandfetch, Brevo, Bubble, Cal, Calendly, Chargebee, CircleCi, Cisco, Clearbit, ClickUp, Clockify, Cloudflare, Cockpit, Coda, CoinGecko, CompareDatasets, Compression, Contentful, ConvertKit, Copper, Cortex, CrateDb, Cron, Crypto, Currents, CustomerIo.

D-H:
Databricks, DataTable, DateTime, DebugHelper, DeepL, Demio, Dhl, Discord, Discourse, Disqus, Drift, Dropbox, Dropcontact, DynamicCredentialCheck, E2eTest, EditImage, Egoi, Elastic, EmailReadImap, Emelia, ERPNext, ErrorTrigger, Evaluation, Eventbrite, ExecuteCommand, ExecutionData, Facebook, FacebookLeadAds, Figma, FileMaker, Files, Flow, Form, FormIo, Formstack, Freshdesk, Freshservice, FreshworksCrm, Ftp, GetResponse, Ghost, Git, Github, Gitlab, Gong, Google, Gotify, GoToWebinar, Grafana, GraphQL, Grist, Gumroad, HackerNews, HaloPSA, Harvest, HelpScout, HighLevel, HomeAssistant, Html, HtmlExtract, Hubspot, HumanticAI, Hunter.

I-N:
ICalendar, Intercom, Interval, InvoiceNinja, ItemLists, Iterable, Jenkins, JinaAI, Jira, JotForm, Jwt, Kafka, Keap, KoBoToolbox, Ldap, Lemlist, Line, Linear, LingvaNex, LinkedIn, LocalFileTrigger, LoneScale, Magento, Mailcheck, Mailchimp, MailerLite, Mailgun, Mailjet, Mandrill, Markdown, Marketstack, Matrix, Mattermost, Mautic, Medium, MessageAnAgent, MessageBird, Metabase, Microsoft, Mindee, Misp, MistralAI, Mocean, MondayCom, MongoDb, MonicaCrm, MoveBinaryData, MQTT, Msg91, MySql, N8n, N8nTrainingCustomerDatastore, N8nTrainingCustomerMessenger, N8nTrigger, Nasa, Netlify, Netscaler, NextCloud, NocoDB, NoOp, Notion, Npm.

O-S:
Odoo, Okta, OneSimpleApi, Onfleet, OpenThesaurus, OpenWeatherMap, Oracle, Orbit, Oura, Paddle, PagerDuty, PayPal, Peekalink, Perplexity, Phantombuster, PhilipsHue, Pipedrive, Plivo, PostBin, PostHog, Postmark, ProfitWell, Pushbullet, Pushcut, Pushover, QuestDb, QuickBase, QuickBooks, QuickChart, RabbitMQ, Raindrop, ReadBinaryFile, ReadBinaryFiles, ReadPdf, Reddit, RenameKeys, RespondToWebhook, Rocketchat, RssFeedRead, Rundeck, S3, Salesforce, Salesmate, SeaTable, SecurityScorecard, Segment, SendGrid, Sendy, SentryIo, ServiceNow, Shopify, Signl4, Simulate, Slack, Sms77, Snowflake, Splunk, Spotify, SpreadsheetFile, SseTrigger, Ssh, Stackby, StickyNote, StopAndError, Storyblok, Strapi, Strava, Stripe, Supabase, SurveyMonkey, Switch, SyncroMSP.

T-Z:
Taiga, Tapfiliate, Telegram, TheHive, TheHiveProject, TimeSaved, TimescaleDb, Todoist, Toggl, Totp, Transform, TravisCi, Trello, Twake, Twilio, Twist, Twitter, Typeform, UnleashedSoftware, Uplead, UProc, UptimeRobot, UrlScanIo, Venafi, Vero, Vonage, Webflow, Wekan, WhatsApp, Wise, WooCommerce, Wordpress, Workable, WorkflowTrigger, WriteBinaryFile, Wufoo, Xero, Xml, Yourls, Zammad, Zendesk, Zoho, Zoom, Zulip.

### n8n LangChain and AI Nodes Missing From Otto

n8n has 132 unique LangChain/AI node names. Otto has rough conceptual overlap with `LmChatOpenAi`, `LmChatAnthropic`, `LmChatOpenRouter`, `Agent`, `ChainLlm`, `OpenAi`, and `VectorStorePGVector`, but Otto does not expose n8n-compatible versions of those nodes.

Missing LangChain/AI node names:

A-G:
AgentTool, AgentToolV2, AgentToolV3, AgentV1, AgentV2, AgentV3, AlibabaCloud, Anthropic, ChainRetrievalQa, ChainSummarization, ChainSummarizationV1, ChainSummarizationV2, Chat, ChatHubVectorStorePGVector, ChatHubVectorStorePinecone, ChatHubVectorStoreQdrant, ChatTrigger, Code, DocumentBinaryInputLoader, DocumentDefaultDataLoader, DocumentGithubLoader, DocumentJsonInputLoader, EmbeddingsAwsBedrock, EmbeddingsAzureOpenAi, EmbeddingsCohere, EmbeddingsGoogleGemini, EmbeddingsGoogleVertex, EmbeddingsHuggingFaceInference, EmbeddingsLemonade, EmbeddingsMistralCloud, EmbeddingsOllama, EmbeddingsOpenAi, GoogleGemini, Guardrails, GuardrailsV1, GuardrailsV2.

I-M:
InformationExtractor, LmChatAlibabaCloud, LmChatAwsBedrock, LmChatAzureOpenAi, LmChatCohere, LmChatDeepSeek, LmChatGoogleGemini, LmChatGoogleVertex, LmChatGroq, LmChatLemonade, LmChatMinimax, LmChatMistralCloud, LmChatMoonshot, LmChatNvidia, LmChatOllama, LmChatVercelAiGateway, LmChatXAiGrok, LmCohere, LmLemonade, LmOllama, LmOpenAi, LmOpenHuggingFaceInference, ManualChatTrigger, McpClient, McpClientTool, McpRegistryClientTool, McpTrigger, MemoryBufferWindow, MemoryChatRetriever, MemoryManager, MemoryMongoDbChat, MemoryMotorhead, MemoryPostgresChat, MemoryRedisChat, MemoryXata, MemoryZep, MicrosoftAgent365Trigger, MiniMax, ModelSelector, Moonshot.

O-Z:
Ollama, OpenAiAssistant, OpenAiV1, OpenAiV2, OutputParserAutofixing, OutputParserItemList, OutputParserStructured, RerankerCohere, RetrieverContextualCompression, RetrieverMultiQuery, RetrieverVectorStore, RetrieverWorkflow, SentimentAnalysis, TextClassifier, TextSplitterCharacterTextSplitter, TextSplitterRecursiveCharacterTextSplitter, TextSplitterTokenSplitter, ToolCalculator, ToolCode, ToolExecutor, ToolHttpRequest, ToolSearXng, ToolSerpApi, ToolThink, ToolVectorStore, ToolWikipedia, ToolWolframAlpha, ToolWorkflow, ToolWorkflowV1, ToolWorkflowV2, VectorStoreAzureAISearch, VectorStoreChromaDB, VectorStoreInMemory, VectorStoreInMemoryInsert, VectorStoreInMemoryLoad, VectorStoreMilvus, VectorStoreMongoDBAtlas, VectorStorePinecone, VectorStorePineconeInsert, VectorStorePineconeLoad, VectorStoreQdrant, VectorStoreRedis, VectorStoreSupabase, VectorStoreSupabaseInsert, VectorStoreSupabaseLoad, VectorStoreWeaviate, VectorStoreZep, VectorStoreZepInsert, VectorStoreZepLoad.

## Import Compatibility Gap

`src/utils/n8n-importer.js` maps only a small set of n8n type strings:

- Webhook/manual/schedule triggers.
- HTTP request.
- OpenAI/Anthropic/OpenRouter chat model and basic LangChain chain/agent.
- IF, merge, set, code/function/functionItem.
- Wait to delay.
- Filter.
- SplitInBatches to loop.
- ExecuteWorkflow to sub_workflow.
- EmailSend.
- Postgres.
- Redis get/set split by operation.
- Switch decomposed only into a first IF-style placeholder approximation.

Everything else becomes `placeholder`, preserving original type/config but throwing at runtime. This means most real n8n workflows import visually but do not execute in Otto without manual rebuild.

## Domain Details

### 1. Architecture and Package Boundaries

n8n has separate packages for workflow primitives, core runtime, CLI/server, DB, config, permissions, errors, decorators, agents, AI utilities, node SDKs, extension SDKs, frontend packages, testing packages, and design system packages.

Otto keeps these concerns mostly in one backend `src/` tree and one canvas `canvas/src/` tree. This is simpler and faster to move in now, but it means Otto has no independent reusable workflow package, node package SDK, typed API package, or shared frontend package surface.

### 2. Workflow Semantics

n8n workflows are item-based and binary-aware. Many nodes operate over arrays of items, maintain paired-item lineage, and can read/write binary data. Otto currently merges predecessor outputs into a single plain object. That is enough for Cortex-style DAG demos, but it is not compatible with many n8n data and file workflows.

Missing semantic primitives include:

- Item arrays as the default execution data.
- Paired item lineage.
- Binary data references and storage.
- Pin data and manual/test execution data.
- Node parameter schemas with dynamic options.
- Node issues and validation.
- Resource locators.
- Multi-output node behavior beyond Otto's IF handles.
- Wait/resume and callback/webhook-wait semantics.

### 3. Execution and Reliability

Otto's strongest implemented difference is `src/engine/executor.js`: it memoizes a promise per node and awaits dependencies with `Promise.all`, so independent branches run concurrently.

n8n has more execution operations around that core idea:

- Queue/regular execution modes.
- Worker/webhook process commands.
- Recovery intervals and queue recovery batches.
- Pruning policies.
- Execution history/status controllers.
- Partial/debug execution support.
- Workflow activation/deactivation logic.
- Execution annotations/statistics/metadata.
- Event bus and log streaming.

### 4. Credentials and Secrets

Otto encrypts arbitrary credential JSON and avoids returning decrypted data. That is the right baseline.

n8n has the surrounding ecosystem that makes credentials production-grade:

- Hundreds of credential schemas.
- OAuth1 and OAuth2 callback controllers.
- Credential tests.
- Dynamic credential resolvers.
- External secrets providers.
- Credential sharing/project access.
- Credential dependency graph.
- Redaction enforcement.
- Encryption key manager.
- UI flows for creation, editing, testing, and selection.

### 5. Security and Enterprise

Otto currently has:

- Secure-ish session cookie.
- Scrypt password hashing.
- Basic security headers.
- In-memory rate limit for auth/webhooks.
- Workspace scoping in routes.

n8n adds:

- Users, projects, roles, scopes, shared credentials/workflows.
- MFA.
- Password reset.
- Invitations.
- SSO SAML and OIDC.
- LDAP.
- Provisioning.
- API keys with scopes.
- CSRF and richer HTTP security config.
- SSRF protection for HTTP-style nodes.
- External secrets.
- License/enterprise gating.

### 6. Frontend Editor

Otto's canvas is focused and visually customized. n8n's editor is far broader:

- Thousands of source files across editor UI and frontend packages.
- Node creator/browser, search, categories, docs, parameters.
- Credential management and credential selection flows.
- Execution debug surfaces.
- Workflow versions/history.
- Tags, folders, projects, variables.
- Settings, users, security, source control, data tables.
- Templates and dynamic templates.
- AI assistant/workflow builder surfaces.
- i18n and design system packages.

Otto's sidebar already names several of these areas, but many are not fully equivalent yet.

### 7. AI Layer

Otto's vision says "n8n plus AI-era capabilities." Current code implements `llm_call`, `ai_agent`, `vector_search`, pgvector-backed memory tables, and an OttoBot panel stub.

n8n's referenced repo already has substantial AI infrastructure:

- LangChain node package.
- Many model providers.
- Embeddings, rerankers, retrievers, vector stores.
- Agent tools and tool executor.
- MCP client/trigger/tool nodes.
- Memory nodes.
- Output parsers.
- Guardrails.
- Chat triggers/hub.
- Instance AI and AI workflow builder modules.
- Agent runtime package.

Otto's differentiator should therefore not be "has AI nodes". It needs to become "parallel, observable, personal, multi-agent orchestration that n8n cannot express cleanly." Most of that is still roadmap.

### 8. Observability

Otto has execution and node logs, duration fields, token usage columns, a History tab, and SSE endpoint.

n8n has:

- Execution metadata entities.
- Workflow statistics.
- Insights module.
- Event bus.
- Log streaming.
- Metrics config.
- Sentry/OpenTelemetry dependencies.
- Execution annotations and tags.
- Prune/retention settings.

### 9. Extensibility

Otto's own instructions say adding a node requires backend handler, registry entry, canvas node definition, icon mapping, and config panel case.

n8n has:

- `node-dev`.
- `@n8n/create-node`.
- `@n8n/node-cli`.
- `@n8n/workflow-sdk`.
- `@n8n/extension-sdk`.
- Community package loading and scanning.
- ESLint rules for community nodes.
- Templates for generated node packages.

This is the difference between "we can add nodes manually" and "third parties can build a node ecosystem."

### 10. Testing and Quality

Otto needs a real test ladder. Today, the repo mainly has a benchmark/demo workflow.

n8n's repo includes:

- Unit and integration tests.
- Node-specific tests and fixtures.
- Migration tests.
- API/controller tests.
- Frontend Vitest tests.
- Playwright e2e tests.
- Performance packages.
- AI/eval tests.
- Containers/test utilities.
- CI workflows for linting, testing, visual checks, security, releases.

## What Otto Has That n8n Does Not Obviously Have In The Same Way

This report is mainly about what n8n has and Otto lacks, but the reverse differences matter for product direction:

- Otto has a deliberately simple parallel DAG executor in `src/engine/executor.js` as a core behavior, not an optimization around a sequential model.
- Otto's product narrative is explicitly "n8n plus": parallel execution, OttoBot, parallel AI execution, CLI, MCP, API keys.
- Otto already has pgvector memory tables and a `vector_search` node as part of the core schema, although the memory read/write handlers are not wired.
- Otto's current codebase is much smaller and easier to change quickly.
- Otto's visual design direction is custom and focused on AI workflow clarity, not n8n compatibility.

The risk is that these advantages are not enough until the n8n compatibility and platform breadth gaps are closed.

## Priority Order To Close The Biggest Gaps

1. Build an n8n-compatible workflow runtime substrate before adding hundreds of nodes.
   - Item array model.
   - Binary data model.
   - Node parameter schema.
   - Expression runtime.
   - Credential schema/test/OAuth primitives.

2. Replace the current importer with a compatibility report plus executable mappings.
   - Classify imported nodes as exact, partial, placeholder, or unsupported.
   - Preserve all n8n config.
   - Show warnings in UI before save/run.

3. Finish P1 user-critical gaps already listed in `CLAUDE.md`.
   - Credential add/edit UI.
   - SSE execution streaming in canvas.
   - Test input panel.
   - API key auth middleware.
   - Memory read/write handlers.
   - Initial OttoBot suggestions.

4. Implement a top-node wedge instead of chasing all 500+ nodes immediately.
   - Webhook/manual/schedule/http/code/if/switch/merge/set/filter/loop.
   - Slack, Gmail/Google, Notion, GitHub, Discord, Airtable, Postgres, MySQL, MongoDB, Redis, OpenAI, Anthropic.
   - File/binary basics: read/write file, move binary data, PDF/HTML/XML/CSV/spreadsheet parsing.

5. Add platform hardening.
   - RBAC/projects/users.
   - API keys/scopes.
   - OAuth.
   - SSRF protection.
   - CSRF/CSP.
   - Metrics/log streaming/pruning.
   - Automated tests.

6. Then build the "Plus" layer.
   - Parallel AI node.
   - Agent-to-agent communication.
   - OttoBot memory.
   - MCP server.
   - CLI.
   - Observability dashboard.

## Bottom Line

Otto currently proves the core thesis that independent workflow branches can run in parallel and that an AI-focused canvas can feel different. n8n has almost everything else: the node ecosystem, credential ecosystem, editor depth, enterprise controls, API/CLI/config surface, workflow semantics, deployment machinery, and test/release infrastructure.

The biggest strategic lesson from the diff is that Otto should not start by copying n8n file-for-file. It should first implement the compatibility substrate that makes n8n-style nodes possible, then add a focused high-value node wedge, and only then scale toward full n8n breadth while preserving Otto's parallel-first execution model.
