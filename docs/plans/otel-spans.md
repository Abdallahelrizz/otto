# OpenTelemetry Spans Plan

## 1. Span Hierarchy

```
http.server (Fastify auto-instrumentation)
└── workflow.run  (one per runWorkflow call)
    ├── node.execute  (one per runNode call, children run in parallel)
    │   ├── credential.fetch  (if credential is resolved)
    │   └── http.outbound  (if node calls fetch — requires safeFetch integration)
    └── queue.enqueue  (if runWorkflow dispatches to BullMQ, e.g. error workflow)

queue.worker.job  (root span for BullMQ job processing)
└── workflow.run  (child, links to the enqueueing trace via W3C traceparent)
    └── node.execute ...
```

## 2. SDK Choice

**Recommended: manual span creation with `@opentelemetry/sdk-node` and selective auto-instrumentation.**

Reasons:
- Fastify has an official OTel plugin (`@opentelemetry/instrumentation-fastify`) that auto-instruments HTTP spans — use it so route-level traces come for free.
- `http` and `dns` are auto-instrumented — outbound `fetch` spans come for free once `@opentelemetry/instrumentation-undici` (or `node-fetch`) is added.
- `pg` has `@opentelemetry/instrumentation-pg` — DB query spans come for free.
- Manual spans needed only for: `workflow.run`, `node.execute`, `credential.fetch`.

**Against full auto-instrumentation only:** it produces noisy BullMQ spans with no workflow context. Manual `workflow.run` and `node.execute` spans carry the meaningful attributes.

**Trade-off:** adds ~3 new `@opentelemetry/*` packages to `package.json`. Keep them `optionalDependencies` so the server starts cleanly without them when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset.

## 3. Exporter Configuration

```js
// src/observability/otel.js (new file — loaded once before Fastify)
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

export function initOtel() {
  if (!endpoint) return; // no-op in local dev

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: endpoint }),
    instrumentations: [
      // FastifyInstrumentation, PgInstrumentation, UndiciInstrumentation
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => sdk.shutdown());
}
```

Call `initOtel()` as the very first line in `src/server.js` (before Fastify is created) to ensure auto-instrumentation hooks are registered before any imports.

## 4. Instrumentation Points

| File | Location | Span name | Notes |
|------|----------|-----------|-------|
| `src/server.js` | startup | — | Call `initOtel()` as first statement |
| `src/engine/executor.js` | `runWorkflow` entry | `workflow.run` | Start span; set attrs; end in finally |
| `src/engine/executor.js` | `runNode` entry | `node.execute` | Child span; parallel nodes produce sibling spans |
| `src/engine/credentials.js` | `getCredential` | `credential.fetch` | Child of `node.execute` |
| `src/utils/safe-fetch.js` | `safeFetch` | `http.outbound` | Use `undici` instrumentation instead if possible |
| `src/queue/worker.js` | job handler entry | `queue.worker.job` | Extract W3C traceparent from job data |

## 5. Span Attributes

### `workflow.run`
- `workflow.id`, `execution.id`, `workspace.id`, `trigger.type`, `execution.mode`
- `error` (boolean), `error.message` on failure

### `node.execute`
- `node.id`, `node.name`, `node.type`, `execution.id`
- `node.retry_count`, `node.disabled` (boolean)
- `llm.prompt_tokens`, `llm.completion_tokens`, `llm.total_tokens`, `llm.model` — set from `usage` return value when present
- `error` (boolean), `error.type`, `error.message` on failure

### `credential.fetch`
- `credential.id`, `credential.type` — **never log decrypted values**

### `queue.worker.job`
- `queue.name`, `job.id`, `workflow.id`, `trigger.type`

## 6. BullMQ Trace Propagation

The HTTP endpoint that enqueues a job (`src/routes/executions.js` or `src/routes/webhooks.js`) injects the W3C `traceparent` header into the job data:

```js
import { context, propagation } from '@opentelemetry/api';
const traceHeaders = {};
propagation.inject(context.active(), traceHeaders);
await executionQueue.add('execute', { ...jobData, _traceHeaders: traceHeaders });
```

The BullMQ worker extracts it before starting the root span:

```js
const parentCtx = propagation.extract(ROOT_CONTEXT, job.data._traceHeaders ?? {});
const span = tracer.startSpan('queue.worker.job', {}, parentCtx);
```

This produces linked parent→child traces across process boundaries, visible in Jaeger/Tempo/Honeycomb.

## 7. Fastify Startup Impact

`initOtel()` must be called before `import Fastify from 'fastify'` because auto-instrumentation patches modules at import time. In ESM this requires `initOtel()` at the top of `src/server.js` before any other imports — or (better) a separate `src/server.js` entry shim that calls `initOtel()` and then dynamically imports the real server.

Alternatively: use `--require` / `--import` with the OTel node register (`node --import @opentelemetry/auto-instrumentations-node/register`). This avoids touching the server startup sequence.

## 8. Impact on Existing Code

- `src/engine/executor.js` — add `tracer.startSpan` / `span.end()` at `runWorkflow` and `runNode`. No change to logic.
- `src/server.js` — add `initOtel()` call at top (or use `--import` flag in `package.json` start script).
- `src/engine/credentials.js` — add thin span wrapper around `getCredential`.
- No changes to node handlers, routes, or migrations.

## 9. Implementation Order

1. `npm install --save-optional @opentelemetry/sdk-node @opentelemetry/exporter-trace-otlp-http @opentelemetry/api @opentelemetry/instrumentation-fastify @opentelemetry/instrumentation-pg @opentelemetry/instrumentation-undici`
2. `src/observability/otel.js` — `initOtel()` with conditional no-op
3. `src/server.js` — call `initOtel()` as first import / statement
4. `src/engine/executor.js` — `workflow.run` and `node.execute` spans
5. `src/engine/credentials.js` — `credential.fetch` span
6. `src/queue/worker.js` — W3C trace context extraction + `queue.worker.job` span
7. `src/routes/executions.js` + `src/routes/webhooks.js` — inject trace context into job data
8. `.env.example` — document `OTEL_EXPORTER_OTLP_ENDPOINT`
9. `test/otel-smoke.js` — verify spans are emitted to a mock collector (or just that initOtel doesn't throw)
