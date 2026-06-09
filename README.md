# Review Pilot

Mobile-first review operations for a single-owner local business.

Review Pilot helps an owner connect Google Business Profile locations, triage unhandled reviews, generate AI reply drafts, test or publish responses, mark reviews handled, and manage Twilio notification tasks from a focused phone-friendly interface.

The product is intentionally narrow: open the app, see what needs attention, handle one review safely, and move on.

## Demo

Try the GitHub Pages demo: [yihuil1992.github.io/review-pilot](https://yihuil1992.github.io/review-pilot/)

The demo is a static frontend preview with sample data. It shows the queue, review actions, notification tasks, and settings UI without calling Google, Twilio, Codex, or the production API.

![Review Pilot demo command center](docs/demo-home.png)

![Review Pilot demo review queue](docs/demo-review-queue.png)

## What It Does

- Unified Google review queue across connected locations.
- Hourly worker sync for new Google reviews across enabled locations.
- Optional location filtering inside review workflows.
- Review detail modal optimized for mobile triage.
- AI draft generation and revision through Codex subscription auth.
- Explicit test publish mode so Google is not updated accidentally.
- Handled-state tracking for completed reviews.
- Twilio notification task queue for due sends, retries, cancellations, and follow-up links.
- Operational Tasks page with Google sync status and notification task controls.
- Production settings UI with masked configured secrets.
- Self-hosted setup for owner-controlled credentials.
- Agent-facing CLI and MCP server for structured AI/tool automation.

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
3. During first-run setup, the API automatically saves that password to `OWNER_PASSWORD.local.md` in the project root. This file is ignored by Git and must never be committed.
4. Save the public base URL in Settings before connecting Google.
5. Save Google OAuth client ID and secret.
6. Connect each Google account and discover locations.
7. Select the Codex model in Settings.
8. Use **Test Codex** to verify the CLI is available.
9. Use **Start browser login** to begin device-code authorization, then open the displayed link in your own browser and enter the code.
10. Refresh login status until Settings reports Codex is logged in.
11. Save Twilio credentials if notification tasks are needed, add each location's notification phone number, then validate with a test SMS.

With the worker running, enabled Google locations are checked for new reviews about once per hour. The Tasks page shows the latest sync result, next expected scan, location count, and any sync error.

The default semantic path uses Codex subscription auth and does not require `OPENAI_API_KEY`.

## Useful Scripts

```powershell
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm --silent agent:cli -- status --json
pnpm --silent agent:mcp
pnpm demo:build
pnpm build
pnpm typecheck
pnpm db:generate
pnpm db:migrate
pnpm semantic:spike
```

`pnpm demo:build` matches the GitHub Pages workflow: static export, demo data, and the `/review-pilot` base path.

## Agent Interfaces

Review Pilot includes a thin CLI and stdio MCP server for AI agents and automation. They call the existing API and keep sensitive setup in the web Settings UI.

```powershell
$env:REVIEW_PILOT_API_BASE_URL="http://localhost:4000/api"
$env:REVIEW_PILOT_OWNER_PASSWORD="<owner password>"
pnpm --silent agent:cli -- reviews list --json
pnpm --silent agent:mcp
```

See [docs/agent-interfaces.md](docs/agent-interfaces.md) for command examples, MCP tools, auth options, and safety rules.

## Deployment

See [docs/deployment.md](docs/deployment.md) for the supported production profiles.

Recommended first path:

- Run the app on the owner's machine or a persistent server.
- Use a stable HTTPS public URL, such as a named Cloudflare Tunnel.
- Save that public base URL in Settings so Google OAuth callback URLs stay stable.

Railway is also supported when you want to use Railway-provided domains instead of a DNS tunnel. See [docs/railway.md](docs/railway.md) for the three-service Railway profile, Postgres/Redis variables, same-origin API proxy, and Codex persistent-volume setup.

Avoid serverless for the default semantic engine. Codex auth, worker jobs, and runtime state need a durable environment.

## Security

Secrets are encrypted at rest with `APP_SECRET_KEY`. Owner sessions are signed with `OWNER_SESSION_SECRET`.

Do not rotate either casually after production data exists. Encrypted Google refresh tokens and Twilio auth tokens need the same app key to decrypt.

`OWNER_PASSWORD.local.md` is reserved for a private local owner-password reminder and is listed in `.gitignore`. Keep it on the deployment machine only.

Set `OWNER_PASSWORD_NOTE_PATH` if the deployment should write this reminder somewhere outside the project root.

See [docs/security.md](docs/security.md) for more detail.

## Product And Design Docs

- [PRODUCT.md](PRODUCT.md): product definition, core surfaces, non-goals, and UX principles.
- [DESIGN.md](DESIGN.md): design system, brand rules, component behavior, motion, and implementation notes.

## Project Status

Review Pilot is an early production-focused application. It is public for source visibility, but it is designed for a single-owner self-hosted deployment rather than a hosted multi-tenant SaaS.
