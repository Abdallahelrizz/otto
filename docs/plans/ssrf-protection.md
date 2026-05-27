# SSRF Protection Plan

## 1. Threat Model

A workflow author (or an injected expression value) can point `http_request`, `graphql_request`, or any vendor-API node at an internal address. In a cloud/Docker deployment the attacker can reach:

- Cloud metadata APIs (`169.254.169.254` — AWS/GCP/Azure instance metadata, IAM credentials)
- Internal services not exposed externally (`localhost:5432` Postgres, `localhost:6379` Redis, sidecar containers)
- RFC1918 LAN hosts (`10.x`, `172.16–31.x`, `192.168.x`)
- Link-local (`169.254.0.0/16`, `fe80::/10`)

Impact: credential exfiltration, internal API abuse, data destruction.

## 2. Which Nodes Need Protection

| File | Outbound fetch? | Risk |
|------|----------------|------|
| `src/nodes/http-request.js` | Yes — `fetch(url, ...)` (line ~69) | High — URL is user-supplied |
| `src/nodes/graphql-request.js` | Yes — `fetch(url, ...)` | High — URL is user-supplied |
| `src/nodes/service-utils.js` — `requestJson` | Yes — used by Slack, GitHub, Notion, Airtable, Discord, Telegram | Medium — URL partially user-supplied (path injection) |
| `src/nodes/llm-call.js` | Yes — OpenAI/OpenRouter/Anthropic SDKs | Low — base URL is hardcoded in SDK; config only selects model |
| `src/nodes/send-email.js` | Yes — nodemailer SMTP | Low — host is credential-backed, not free-form expression |
| `src/nodes/vector-search.js` | No — uses pg pool | None |

**Immediate priority:** `http-request.js` and `graphql-request.js` — these take a fully free-form URL from user config/expressions.

## 3. `src/utils/safe-fetch.js` — Design

Create a wrapper around `fetch` that resolves the hostname to an IP before making the request, then rejects if the IP falls in a blocked range.

```js
import dns from 'dns/promises';
import net from 'net';

const BLOCKED_CIDRS = [
  ['127.0.0.0', 8],   // loopback
  ['10.0.0.0', 8],    // RFC1918
  ['172.16.0.0', 12], // RFC1918
  ['192.168.0.0', 16],// RFC1918
  ['169.254.0.0', 16],// link-local / cloud metadata
  ['0.0.0.0', 8],
  ['::1', 128],       // IPv6 loopback
  ['fc00::', 7],      // IPv6 unique local
  ['fe80::', 10],     // IPv6 link-local
];

function ipToLong(ip) { /* convert IPv4 string to 32-bit int */ }
function cidrBlocked(ip) { /* check against BLOCKED_CIDRS */ }

export async function safeFetch(url, options = {}) {
  if (process.env.SSRF_ALLOW_PRIVATE === 'true') {
    return fetch(url, options);
  }

  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`SSRF: invalid URL: ${url}`);
  }

  // If hostname is already an IP, check it directly
  if (net.isIP(hostname)) {
    if (cidrBlocked(hostname)) {
      throw new SsrfBlockedError(`Blocked: direct IP address in private range: ${hostname}`);
    }
  } else {
    const { address } = await dns.lookup(hostname, { family: 4 }).catch(async () =>
      dns.lookup(hostname, { family: 6 })
    );
    if (cidrBlocked(address)) {
      throw new SsrfBlockedError(`Blocked: ${hostname} resolves to private IP ${address}`);
    }
  }

  // Follow redirect check: use redirect:'manual', check Location header IP
  const resp = await fetch(url, { ...options, redirect: 'manual' });
  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get('location');
    if (location) return safeFetch(location, options); // recursive — inherits SSRF check
  }
  return resp;
}

class SsrfBlockedError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'SsrfBlockedError';
    this.code = 'SSRF_BLOCKED';
  }
}
```

## 4. Allow-List Override

`SSRF_ALLOW_PRIVATE=true` env var skips all checks. Document this for self-hosted deployments where calling internal microservices is intentional. Default: `false` (safe).

## 5. Redirect Risk

Standard `fetch` follows redirects silently. A public URL like `http://attacker.com/redirect` could return `301 → http://169.254.169.254/`. The plan above uses `redirect: 'manual'` and recursively calls `safeFetch` on the Location header — every hop is checked.

## 6. Error UX

When SSRF is blocked, throw `SsrfBlockedError` with `code: 'SSRF_BLOCKED'`. The executor's `continueOnError` and logging paths already handle any error type — the node will fail with a clear message: `"Blocked: <hostname> resolves to private IP <ip>"`. This is distinct from a `TypeError` or HTTP error.

Do NOT expose the resolved private IP in SSE events or execution logs visible to other workspace members — just the hostname.

## 7. Testing

Write `test/ssrf-smoke.js`:
- Assert `safeFetch('http://127.0.0.1/test')` rejects with `SsrfBlockedError`
- Assert `safeFetch('http://169.254.169.254/')` rejects
- Assert `safeFetch('http://10.0.0.1/')` rejects
- Assert `SSRF_ALLOW_PRIVATE=true` allows the above (skip in CI where no actual request is made — mock the DNS lookup)
- Mock DNS to return `10.0.0.1` for a hostname and assert rejection

## 8. Migration Path

- `safeFetch` is additive — only `http-request.js` and `graphql-request.js` need to swap `fetch` → `safeFetch`.
- `service-utils.js` `requestJson` uses hardcoded vendor base URLs (Slack: `slack.com`, GitHub: `api.github.com`, Notion: `api.notion.com`). These are low risk — attacker can only inject path components, not full hostnames. Protect in a future pass.
- No workflow JSON shape changes. Existing workflows work unchanged unless they were calling private IPs.

## 9. Implementation Order

1. `src/utils/safe-fetch.js` — new file, SSRF-safe fetch wrapper
2. `src/nodes/http-request.js` — swap `fetch` at line ~69 for `safeFetch`
3. `src/nodes/graphql-request.js` — same swap
4. `test/ssrf-smoke.js` — smoke test
5. `.env.example` — document `SSRF_ALLOW_PRIVATE=false`
6. `docs/nodes/README.md` — note SSRF protection in http_request and graphql_request entries
