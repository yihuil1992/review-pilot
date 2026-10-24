# Docker deployment

The repository contains portable application code and an example stack. Keep your
production Compose file, domains, private network names, volume mappings, limits
and credentials in your deployment platform or private infrastructure repository.

## Image and runtime roles

`ghcr.io/yihuil1992/review-pilot:main` contains the latest successfully tested main
revision for Linux AMD64 and ARM64. Use `:sha-<full-commit>` to pin or roll back a
release. The same image provides API, worker, migration and web processes:

| Role | Command |
| --- | --- |
| API | `node apps/api/dist/apps/api/src/main.js` |
| Worker | `node apps/worker/dist/apps/worker/src/main.js` |
| Migration | `pnpm db:deploy` |
| Web, working directory `/app/apps/web` | `node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000` |

For a local build: `docker build --build-arg SOURCE_REVISION=$(git rev-parse HEAD) -t review-pilot:local .`

## Configure a deployment

Start from [`compose.example.yml`](../compose.example.yml). Copy it to your private
deployment settings and supply environment variables separately. Use URL-safe
database/Redis passwords because the example embeds them in connection URLs.

- `APP_SECRET_KEY` and `OWNER_SESSION_SECRET` must remain stable across upgrades.
- `PUBLIC_WEB_ORIGIN` is the public HTTPS origin. Set the same browser origin in
  API `WEB_ORIGIN` and save the public base URL in owner Settings for OAuth/links.
- `API_PROXY_URL` is the API origin reachable from the web container. It and
  `PUBLIC_WEB_ORIGIN` are read at runtime: one image works across deployments.
- Start in standby (`REVIEW_PILOT_PRODUCTION_ACTIVE=false`). Activate explicitly
  after configuration/restore is validated. Preserve individual scheduler flags;
  notification scheduling defaults off. Do not run overlapping production workers.
- Webhooks use HTTPS by default. For a trusted internal receiver, set
  `WEBHOOK_ALLOWED_HTTP_URLS` on both API and worker to a JSON array of exact HTTP
  endpoint URLs, then edit the endpoint in owner Settings. Authentication/signatures
  still apply. Unlisted HTTP URLs and redirects are rejected at delivery time.

The example publishes web only on loopback. Place your HTTPS reverse proxy in
front of it; databases and API need no host-published ports. Only trust forwarding
headers supplied by your ingress. The web server preserves same-origin `/api`
requests, uses the configured origin for HTTP-to-HTTPS redirects indicated by
Cloudflare's `cf-visitor`, and applies HSTS/noindex headers for a configured HTTPS
origin. Other ingress providers should enforce HTTPS at their edge.

## Persistent data and upgrades

Preserve PostgreSQL, Redis persistence and `/app/review-pilot-state`. The latter
contains Codex authentication/workspace state and the private owner-password note.
Back up databases together with their encryption material. Never commit these files.

When moving an existing stack, explicitly map its verified volume names instead
of accepting newly generated empty volumes. Stop/drain existing producers before
another stack mounts production data. Retain queue state and scheduler settings;
do not replay completed jobs. Validate readiness and authenticated reads after an
upgrade. A previous application image cannot undo database schema or business writes.

## Coolify and automatic deployment

Choose **Docker Compose Empty** and paste your private production definition.
Keep values in Coolify's Environment Variables. The saved Service owns this
definition; it does not read this repository's example on future deployments.

The Container image workflow builds both architectures, requires the exact commit's
CI and dependency-security checks, and publishes immutable revision tags. Only
the current main revision advances `:main`. A successful release optionally POSTs
to `DEPLOY_WEBHOOK_URL` using `DEPLOY_WEBHOOK_TOKEN`; configure both as encrypted
GitHub Actions secrets. These are deployment-platform credentials, never application
secrets. For Coolify use its authenticated deploy endpoint for the intended Service
and an appropriately restricted deploy token. The management UI need not be public.

Configure the private Compose image with `pull_policy: always` when following
`:main`, or update an immutable revision tag through your deployment automation.
Test the full build-to-deploy flow and preserve graceful shutdown/drain behavior
for the workload. Keep production limits, topology and recovery records private.
