# Review Pilot

Production-first, single-owner, self-hosted Google Business Profile review handling.

## Shape

- `apps/web`: mobile-first Next.js owner UI.
- `apps/api`: NestJS HTTP API, OAuth callbacks, and outbound Twilio notification actions.
- `apps/worker`: NestJS worker for sync, semantic generation, and publish jobs.
- `packages/db`: Prisma schema and database client.
- `packages/shared`: shared TypeScript and Zod contracts.

## Production Defaults

- PostgreSQL is the supported production database.
- Redis + BullMQ coordinates background jobs.
- Codex subscription auth is the default semantic engine path.
- OpenAI Platform API keys are optional fallback, not the primary path.

## First Risk To Burn Down

Before building the full workflow, run the semantic runtime spike and confirm the local deployment can produce strict JSON through Codex subscription auth.

## Local Services

```powershell
pnpm install
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The default local database URL is:

```text
postgresql://review_pilot:review_pilot@localhost:5433/review_pilot
```

The bundled Redis container is exposed on localhost port `6380` to avoid colliding with an existing local Redis. Set `REDIS_URL=redis://localhost:6380` when using the compose Redis service.

Copy `.env.example` to `.env` and replace the app/session secrets before real use.

## First-Run Setup

1. Start Postgres, Redis, API, worker, and web.
2. Open the web app and create the owner password.
3. Save the public base URL before connecting Google or Twilio.
4. Select the Codex model in Settings. Use **Test Codex** to verify that the CLI is installed and logged in, then use the Settings page Codex login controls or run `codex login` manually in the same user account that runs the app.
5. Save Google OAuth client ID/secret, then connect each Google account.
6. Discover locations and sync reviews.
7. Save Twilio credentials, validate them, and send a test SMS.

The semantic path uses Codex subscription auth. It does not require `OPENAI_API_KEY` for the default provider.

## Public Deployment

See [docs/deployment.md](docs/deployment.md) for the Mac public and server public profiles. The recommended first path is a named Cloudflare Tunnel because it gives a stable HTTPS callback URL for Google OAuth while keeping Codex auth on the owner's Mac.

## Security

Secrets are encrypted at rest with `APP_SECRET_KEY`; owner sessions are signed with `OWNER_SESSION_SECRET`. Do not rotate either casually after production data exists, because encrypted OAuth/Twilio secrets need the same app key to decrypt. See [docs/security.md](docs/security.md).
