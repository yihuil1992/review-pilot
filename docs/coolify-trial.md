# Coolify parallel trial

`compose.coolify.yml` runs web, API, worker, PostgreSQL 18.6 and Redis 8.2.9,
plus a one-shot Prisma migration service. It is an isolated trial deployment;
Railway remains production. Do not use the development docker-compose.yml.

## Deploy

1. Create a private GitHub App source in Coolify with access only to this repo.
   Create a Git-based Docker Compose application on the trial branch, with
   `/compose.coolify.yml` as its Compose location. Disable PR previews.
2. Set `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `APP_SECRET_KEY` and
   `OWNER_SESSION_SECRET` in Coolify. Generate URL-safe database/Redis passwords.
   Preserve the application encryption key if restoring encrypted settings.
   Never set these secrets as build arguments. `REVIEW_PILOT_IMAGE_TAG` may
   identify a tested image; all application services use the same image.
3. Leave domains empty while restoring a read-only PostgreSQL snapshot into
   the independent database. Stop the trial API/worker/web during restore;
   do not touch the Railway services. Never restore production Redis into
   the parallel trial. Set database `publicBaseUrl` to the trial hostname,
   correct database-stored Codex paths, disable copied webhook endpoints and
   API clients, and remove pending notifications from the trial copy.
4. Start the stack, verify restored owner authentication, dependency readiness
   and a worker queue operation before publishing a domain. The worker state
   volume persists Codex authentication; a new volume requires login or a
   deliberate secure transfer of the existing Codex home.
5. Assign `https://reviews.shakingcrab.net:3000` to web in Coolify. Coolify's
   proxy manages routing and the Let's Encrypt origin certificate. Initially
   route the hostname's HTTP-01 challenge path through the tunnel to port 80.
   Once the certificate is issued, use `https://coolify-proxy:443` for the
   general route with origin server name `reviews.shakingcrab.net` and TLS
   verification enabled. Preserve the HTTP challenge route for renewal.
   Keep the existing GitHub webhook route intact and management callbacks on
   tailnet. The trial web build redirects Cloudflare's original HTTP scheme
   to HTTPS and adds HSTS/noindex headers, since the origin connection itself
   is HTTPS for both kinds of public request.
6. Enable automatic deployment for `codex/coolify-trial` and **Include source
   commit in build**. Use native Coolify custom build command
   `sh scripts/build-coolify.sh` and start command
   `docker compose up -d --no-build`. GitHub push retrieves source, builds and
   deploys entirely on the Coolify host; no workstation image import is needed.

   The shared Colima `coolify` VM has 8 GiB RAM and 4 CPUs. The script creates
   a dedicated `review-pilot-coolify` BuildKit builder on that same Docker host,
   pins BuildKit 0.34.1, caps its total memory at 2 GiB with no extra swap and
   CPU quota at two cores, and verifies those limits before every build.
   `deploy/buildkitd.toml` limits build parallelism to one and applies cache GC
   targets. GC targets are not a hard disk quota; the script requires at least
   4 GiB free before building. Monitor free space as images accumulate.

   All application services share one image, so the script builds it once,
   loads it into the local Docker engine and verifies the source revision and
   ARM64 platform before Compose starts it. It reads only non-secret metadata
   from `/artifacts/build-time.env`, without sourcing the file. If overriding
   `REVIEW_PILOT_IMAGE_TAG`, expose that non-secret value at both build and run
   time. Keep all credentials out of build arguments.

   Node heap and pnpm extraction/lifecycle/network concurrency are also bounded
   in Dockerfile. Application runtime caps alone do not limit build processes.
   The previous off-host workflow was an incident workaround and is superseded
   by this native bounded build path. Keep the preceding working image for code
   rollback; do not recreate volumes or switch production as part of rollback.

## Isolation and limitations

- `REVIEW_PILOT_TRIAL_MODE=true` is fixed for API/worker in this trial Compose.
  It rejects Google, Twilio and webhook fetches before network transmission.
  Scheduler flags are also false; neither setting replaces a separate Redis.
- Reads and edits apply only to the trial copy. Existing signed links/sessions
  need not carry over; the session secret should be independent. A fresh
  owner-less database must not be exposed publicly before private bootstrap.
- Codex calls are not blocked by trial mode. Test only with intentional trial
  inputs, and confirm authentication independently. Installed CLI is not proof
  that generation works.
- Codex CLI is pinned in the root package and lockfile (0.163.0 for this trial).
  Upgrade that dependency and rebuild the image to persist future updates.
  The model picker queries the worker's authenticated CLI through local
  app-server `model/list`, so choices follow its account/client availability.
  Refresh models reloads the catalog without changing the selected model;
  failed discovery preserves existing choices and Custom. No model is silently
  selected on an upgrade. The discovery process has a 15-second timeout.
- API readiness checks PostgreSQL and Redis within 1.5 seconds; liveness stays
  independent. Worker operation verification must enqueue and await a job;
  process/container state alone is insufficient.
- Runtime memory caps support a bounded trial, not a production capacity SLA.
  Docker builds run in a separate capped builder on the shared 8 GiB VM. The
  optional NEXT_BUILD_CPUS setting limits Next.js build parallelism.
- An initialized volume is owned by the node user (uid 1000). Preserve ownership
  when importing state. The database uses PG18's `/var/lib/postgresql` mount.
- The Dockerfile builds Linux-native Prisma and Codex dependencies using the
  lockfile. It retains the workspace toolchain for controlled migrations; image
  size can be optimized later without changing this trial's behavior.

Rollback of this trial means stopping its application and removing only its
new ingress record/route. Never automatically copy trial writes back into
Railway. Production cutover, final sync, backups and single-consumer scheduling
require a separate approved plan.

Production preparation and the separate activation procedure are documented in
[`coolify-production.md`](coolify-production.md). Trial explicitly uses API
environment `test`; copied live clients remain revoked. OAuth setup can be enabled
for a bounded authorization window without enabling business actions.
