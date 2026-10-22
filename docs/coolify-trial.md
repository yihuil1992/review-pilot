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
6. Keep automatic deployment disabled on this shared 4 GiB VM until a bounded
   build path is capacity-validated. A native build hit global OOM during
   dependency installation, also killing a Coolify job worker. Compose build
   serialization alone does not cap BuildKit or installation memory. Build the
   clean trial commit on a separate Linux ARM64 Docker host instead:

   ```sh
   revision=$(git rev-parse HEAD)
   test -z "$(git status --porcelain)"
   docker build --platform linux/arm64 --build-arg SOURCE_REVISION="$revision" \
     --build-arg REVIEW_PILOT_TRIAL_MODE=true --build-arg API_PROXY_URL=http://api:4000 \
     -t "review-pilot:$revision" -t review-pilot:coolify-trial .
   ```

   Import the image through `docker save` / `docker load` into the remote
   `colima-coolify` context, retaining the preceding image for rollback. In
   Coolify use the custom build command below to require an imported image
   whose source revision matches the checked-out trial commit. Enable Coolify's
   **Include source commit in build** setting so `/artifacts/build-time.env` contains the actual
   `SOURCE_COMMIT`. The script reads only that field without sourcing the
   credentials file; Coolify removes `.git` before running the build command:

   ```sh
   sh scripts/verify-trial-image.sh
   ```

   Then deploy through Coolify with start command `docker compose up -d --no-build`.
   Coolify still owns source retrieval, Compose, environment, domains and
   persistent volumes. A missing or mismatched image must fail before startup;
   importing an image alone does not deploy it. The Dockerfile bounds Node heap
   before dependency installation, pins pnpm tarball workers to one and reduces
   lifecycle/network concurrency, but those
   settings do not prove shared-VM build capacity. Re-enable automatic builds
   only after a separately verified build-server or resource-isolated path.

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
  Docker builds are currently offloaded from the shared 4 GiB VM. The
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
