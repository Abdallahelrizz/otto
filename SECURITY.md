# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report privately to **security@ottoflow.dev** (or open a [GitHub security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)).
Include a description, reproduction steps, and impact. We aim to acknowledge within
3 business days and to ship a fix or mitigation for confirmed high-severity issues
promptly.

## Supported versions

Otto is pre-1.0. Security fixes land on `master` and the latest published container
image. Pin to a released tag for production and watch this repository for advisories.

## Deployment hardening checklist

Otto is safe to self-host single-tenant with defaults. If you expose it to untrusted
users or run it multi-tenant, set the following:

| Variable | Why |
|---|---|
| `CREDENTIAL_ENCRYPTION_KEY`, `API_KEY_PEPPER` | Required. 32-byte hex each (`openssl rand -hex 32`). The server refuses to start without them. |
| `ALLOWED_ORIGINS` | Set explicitly in production. When unset, CORS is restricted to same-origin (it does **not** reflect arbitrary origins). |
| `PISTON_URL` | Point the Code node at your own Piston. The public `emkc.org` fallback is **off by default** and only enabled with `PISTON_ALLOW_PUBLIC=true` (it sends code + input off-box). |
| `POSTGRES_NODE_ALLOW_SYSTEM_DB` | Leave unset. When unset, the Postgres node requires an explicit credential and cannot query Otto's own control-plane database. |
| `METRICS_TOKEN` | Set to require a bearer token on `GET /metrics`. |
| `SSRF_ALLOW_PRIVATE` | Total bypass of the SSRF egress guard — only for trusted internal self-hosted workflows. **Ignored when `OTTO_HOSTED=true`**, so it cannot be enabled in a hosted/multi-tenant build. |
| `OTTO_HOSTED` | Set `true` for multi-tenant/hosted deployments. Disables `SSRF_ALLOW_PRIVATE`. See the multi-tenancy caveat below. |

## Trust model

- Workflow authors are **semi-trusted**: they can run code (Code node → Piston sandbox)
  and expressions. Expressions run in a locked-down `vm` context (no host objects, code
  generation disabled) and node code runs in an isolated Piston container.
- Credentials are AES-256-GCM encrypted at rest and never returned decrypted by the API.
- API keys are HMAC-SHA256 with a server pepper and are workspace-scoped.
- For hard multi-tenant isolation, run untrusted execution workers on separate hosts.

### ⚠️ Multi-tenancy caveat — read before hosting untrusted tenants

Otto is designed for **single-tenant self-hosting**. Two isolation boundaries that a
multi-tenant deployment would have to trust do not currently hold:

- **The expression engine.** Node's `vm` is not a security boundary. The known sandbox
  escape is closed (null-prototype context, results serialized inside the context), but
  `vm` shares a heap and an event loop with the host. A hosted deployment needs a real
  isolate (`isolated-vm` or QuickJS-wasm). One `{{ }}` field in one tenant's workflow
  otherwise threatens every tenant's secrets.
- **The `code` node.** It is only as isolated as your Piston deployment and its network
  segment. Hosting untrusted code needs gVisor or Firecracker, per-tenant egress behind
  `safeFetch`, and per-execution CPU/memory/wall ceilings.

There is also a known availability gap: an expression can schedule work (e.g. a microtask)
that outlives the evaluation timeout and occupies the host event loop. Track this in
`HARDENING.md` item 3.

Do not run Otto multi-tenant against untrusted workflow authors until these are addressed.
