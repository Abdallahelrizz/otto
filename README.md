# Otto

Otto is an AI-native workflow automation platform with a visual canvas, durable workflow execution, credentials, triggers, integrations, and n8n import support.

## Stack

- Backend: Node.js, Fastify
- Frontend: React, Vite, TypeScript
- Queue: Redis, BullMQ
- Database: Postgres with pgvector

## Local Setup

1. Install dependencies:

```powershell
npm install
npm install --prefix canvas
```

2. Copy the example environment file and fill in real local or hosted service URLs:

```powershell
Copy-Item .env.example .env
```

Required values:

- `DATABASE_URL`
- `REDIS_URL`
- `CREDENTIAL_ENCRYPTION_KEY`

3. Run migrations:

```powershell
npm run migrate
```

4. Start the backend:

```powershell
npm run dev
```

5. Start the canvas:

```powershell
npm run dev --prefix canvas
```

## Repository Notes

- Do not commit `.env` or real secrets.
- Runtime files are stored under `files/` and are ignored.
- Local agent/tooling state such as `.agents/`, `.claude/`, `.external/`, `.playwright-cli/`, and `graphify-out/` is ignored.
- Use `.env.example` when documenting required environment variables.
