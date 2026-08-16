# Contributing to Otto

Thanks for helping build Otto. This guide gets you from clone to green tests.

## Setup

```bash
npm install
npm install --prefix canvas
cp .env.example .env          # fill in the required keys (see README)
npm run migrate               # apply DB migrations
npm run dev                   # backend on :3000
npm run dev --prefix canvas   # canvas on :5173
```

You need Postgres (with pgvector) and Redis. `docker compose up -d postgres redis`
gives you both locally.

## Tests & checks

```bash
# Backend unit tests (no infra needed)
node --test test/services-*.test.js test/redirect-auth.test.js test/expression-sandbox.test.js

# Canvas typecheck
cd canvas && npm run gen:nodes && npx tsc --noEmit
```

CI runs the same checks on every PR. Please make sure both are green before opening one.

## Adding a node

Prefer the **declarative service framework** for REST/API integrations — one descriptor
file plus `npm run gen:nodes`, no hand-written handler/panel. See the "Declarative Service
Nodes" section in the project docs. Only write a custom node when the integration needs
real logic (OAuth refresh, request signing, response-shape pagination).

## Pull requests

- Keep changes focused; one concern per PR.
- Match the surrounding code style (no linter config yet — read the neighbours).
- Add or update a test when you change behaviour.
- Security-sensitive areas (`src/engine/expressions.js`, `src/utils/safe-fetch.js`,
  `src/auth/*`, `src/nodes/code.js`, `src/nodes/postgres-query.js`) get extra scrutiny —
  explain the security reasoning in the PR description.

## Licensing of contributions

Otto is source-available under the [Business Source License 1.1](./LICENSE). By submitting a
contribution, you agree that it is licensed under the same terms as the project.

## Reporting security issues

Do **not** file them as public issues — see [SECURITY.md](./SECURITY.md).
