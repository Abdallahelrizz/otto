# Otto P0 Self-Host

## Start

1. Copy `.env.example` to `.env`.
2. Set `CREDENTIAL_ENCRYPTION_KEY` to a 32-byte hex value.
3. Run `docker compose up --build`.
4. Open `http://localhost:3000`.
5. Create the first owner account.

## Included Services

- Otto API and canvas on port `3000`
- Postgres with pgvector on port `5432`
- Redis on port `6379`
- Piston sandbox on port `2000`

## P0 Flows

- Create/login owner account.
- Save, load, activate, deactivate, and run workflows.
- Trigger active webhook workflows with `POST /webhooks/:path`.
- Trigger active schedule workflows through BullMQ schedulers.
- Run code nodes through self-hosted Piston.
- Inspect live and historical executions in the bottom execution panel.

## Notes

- Piston is self-hosted only; Otto does not rely on Piston's public API.
- The canvas uses session cookies. API requests from another origin must include credentials.
- Webhooks are public and rate-limited.
