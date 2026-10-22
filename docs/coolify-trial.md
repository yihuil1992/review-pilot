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
5. Assign the web service's domain in Coolify, port 3000. When Cloudflare Tunnel
   terminates public TLS, an HTTP origin domain with HTTPS forcing disabled
   allows the tunnel to reach Coolify's HTTP router without redirect loops.
   Point only the new hostname's tunnel route at the Coolify proxy; keep the
   existing GitHub webhook route intact and management callbacks on tailnet.

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
- API readiness checks PostgreSQL and Redis within 1.5 seconds; liveness stays
  independent. Worker operation verification must enqueue and await a job;
  process/container state alone is insufficient.
- Runtime memory caps support a bounded trial, not a production capacity SLA.
  Docker builds should be serialized/offloaded on a shared 4 GiB VM. The
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
