# Review Pilot

Mobile-first review operations for a single-owner local business.

Review Pilot helps an owner connect Google Business Profile locations, triage unhandled reviews, generate AI reply drafts, test or publish responses, mark reviews handled, and manage Twilio notification tasks from a focused phone-friendly interface.

The product is intentionally narrow: open the app, see what needs attention, handle one review safely, and move on.

## What It Does

- Unified Google review queue across connected locations.
- Optional location filtering inside review workflows.
- Review detail modal optimized for mobile triage.
- AI draft generation and revision through Codex subscription auth.
- Explicit test publish mode so Google is not updated accidentally.
- Handled-state tracking for completed reviews.
- Twilio notification task queue for due sends, retries, cancellations, and follow-up links.
- Production settings UI with masked configured secrets.
- Self-hosted setup for owner-controlled credentials.

## Repository Shape

- `apps/web`: Next.js owner UI, mobile-first with shadcn/ui, Tailwind CSS, lucide-react, and Sonner.
- `apps/api`: NestJS HTTP API, owner auth, settings, Google OAuth, review actions, and Twilio actions.
- `apps/worker`: NestJS worker for sync, semantic generation, notification work, and publish jobs.
- `packages/db`: Prisma schema, migrations, and database client.
- `packages/shared`: shared TypeScript contracts.

## Requirements

- Node.js and pnpm.
- Docker for local Postgres and Redis.
- Google Business Profile OAuth credentials.
- Twilio credentials if notification tasks are used.
- Codex CLI logged in with ChatGPT subscription auth for the default AI path.

PostgreSQL is the supported production database. Redis plus BullMQ coordinates background jobs.

## Local Development

Install dependencies and start local services:

```powershell
pnpm install
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Default local URLs:

- Web: `http://localhost:3217`
- API: `http://localhost:4000/api`
- Postgres: `postgresql://review_pilot:review_pilot@localhost:5433/review_pilot`
- Redis: `redis://localhost:6380`

Copy `.env.example` to `.env` before real use and replace the app/session secrets:

```powershell
Copy-Item .env.example .env
```

The bundled Redis container uses port `6380` to avoid colliding with an existing local Redis.

## First-Run Setup

1. Start Postgres, Redis, API, worker, and web.
2. Open the web app and create the owner password.
3. Save the public base URL in Settings before connecting Google.
4. Save Google OAuth client ID and secret.
5. Connect each Google account and discover locations.
6. Select the Codex model in Settings.
7. Use **Test Codex** to verify the CLI is available.
8. Use **Start browser login** to begin device-code authorization, then open the displayed link in your own browser and enter the code.
9. Refresh login status until Settings reports Codex is logged in.
10. Save Twilio credentials if notification tasks are needed, then validate with a test SMS.

The default semantic path uses Codex subscription auth and does not require `OPENAI_API_KEY`.

## Useful Scripts

```powershell
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm build
pnpm typecheck
pnpm db:generate
pnpm db:migrate
pnpm semantic:spike
```

## Deployment

See [docs/deployment.md](docs/deployment.md) for the supported production profiles.

Recommended first path:

- Run the app on the owner's machine or a persistent server.
- Use a stable HTTPS public URL, such as a named Cloudflare Tunnel.
- Save that public base URL in Settings so Google OAuth callback URLs stay stable.

Avoid serverless for the default semantic engine. Codex auth, worker jobs, and runtime state need a durable environment.

## Security

Secrets are encrypted at rest with `APP_SECRET_KEY`. Owner sessions are signed with `OWNER_SESSION_SECRET`.

Do not rotate either casually after production data exists. Encrypted Google refresh tokens and Twilio auth tokens need the same app key to decrypt.

See [docs/security.md](docs/security.md) for more detail.

## Product And Design Docs

- [PRODUCT.md](PRODUCT.md): product definition, core surfaces, non-goals, and UX principles.
- [DESIGN.md](DESIGN.md): design system, brand rules, component behavior, motion, and implementation notes.

## Project Status

Review Pilot is an early production-focused application. It is public for source visibility, but it is designed for a single-owner self-hosted deployment rather than a hosted multi-tenant SaaS.
