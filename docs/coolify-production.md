# Production preparation and cutover

Railway remains production until the cutover is separately approved. Use
`compose.coolify.production.yml` for the future production deployment; keep
`compose.coolify.yml` for the parallel trial. Both use the same native ARM64 image,
application service names and volume keys. On the existing Coolify application,
verify its rendered volume names before changing the Compose path so data/state
are retained. Do not merge main while Railway deployments still follow it.

## Configuration

- Keep the private GitHub App, `.net` domain, HTTPS tunnel route and HTTP-01
  challenge route. Build with `sh scripts/build-coolify.sh`, Include source commit
  enabled, and start with `docker compose up -d --no-build`.
- Set `REVIEW_PILOT_IMAGE_TAG=coolify-production` at both build/runtime when
  selecting production Compose. Trial continues to use `coolify-trial`.
- Preserve the source `APP_SECRET_KEY` and `OWNER_SESSION_SECRET`, plus the
  target's persistent Codex state. The session secret also signs existing SMS
  review links; the trial's independent secret must not replace it at cutover.
  The database's `publicBaseUrl` and `codex` settings take precedence over defaults.
- Production sets `REVIEW_PILOT_ENV=live`. `REVIEW_PILOT_PRODUCTION_ACTIVE` defaults
  to `false`: its entrypoint forces trial guards and all schedulers off. Only the
  exact value `true` enables production effects; invalid values fail startup.
  Individual scheduler flags can remain disabled even after activation.
- Keep `REVIEW_PILOT_OAUTH_SETUP_ENABLED=false` normally. An explicitly enabled
  setup window permits only the existing OAuth code exchange and userinfo lookup;
  Google business actions, SMS and webhook dispatch remain blocked in standby.
- HTTP-to-HTTPS redirects/HSTS/private-app noindex headers are controlled by the
  image's `PUBLIC_WEB_ORIGIN`, independently of business trial mode.
- Production limits: PostgreSQL512 MiB, Redis384 MiB (maxmemory256 MiB/noeviction),
  API/worker768 MiB, web/init512 MiB. Semantic concurrency1, notifications2,
  webhooks4. Native build remains separately capped at2 GiB/two CPUs. Validate
  runtime headroom with the existing shared workloads; limits are not reservations.

## Integration handoff

- Google callback: `https://reviews.shakingcrab.net/api/google/oauth/callback`.
  Preserve the old `.com` and Railway callback registrations while retaining them.
  A stale source Google grant must not overwrite a refreshed target grant during
  final restore; preserve the relevant GoogleAccount/SecretValue rows securely and
  merge by googleUserId/scope/key. Do not assume the restored token remains usable.
- `sc-tools-backend` uses `REVIEW_PILOT_API_BASE` (without `/api/v1`) and
  `REVIEW_PILOT_API_KEY`. Its client appends `/api/v1`. Preserve active credential
  records/hashes and client scopes in the final database; switch only the base URL
  after the target is ready. No key rotation is required for hostname migration.
- Its business callback remains `/webhook/review-pilot` on the existing backend.
  Preserve endpoint IDs, signing secret and delivery/event idempotency records.
  A real test delivery can send Discord notifications; do not use it as a safe
  connectivity check before cutover.
- Twilio sending uses the restored account credentials and sender. Signed review
  link migration also requires the original session-signing secret. Recheck the
  restored token: if source credentials are stale and the target has a verified
  token for the same account/sender, preserve that token during the final import.
  No SMS is sent by credential verification. Signed review
  links derive their destination from database publicBaseUrl. Old `.com` links
  need an agreed ingress redirect/proxy plan; changing the new publicBaseUrl alone
  does not move existing links or API consumers.
  Prefer an old-domain alias/proxy that preserves API Authorization headers;
  cross-origin redirects can strip credentials. Do not change old-domain routing
  until the approved cutover.

## Maintenance sequence — prepare, do not execute yet

1. Pin reviewed source/image, record source/target versions and state, reserve a
   short maintenance window. Keep Railway resources; prevent either platform's
   auto-deploy from unexpectedly restarting an old production consumer.
2. Freeze all review writes/producers, including external API callers and manual
   owner actions. Drain in-flight work, stop the old worker gracefully, and recheck
   PostgreSQL pending operations plus Redis waiting/active/delayed/prioritized work.
3. Export/transfer the final consistent PostgreSQL state; reconcile schema and all
   tables. Retain encryption material. Apply `.net` publicBaseUrl and target Codex
   paths; preserve a newly refreshed target Google grant. Remove trial-only fixtures
   via replacement of the database, not by merging the trial copy into production.
4. If queues contain unfinished work, preserve/reconcile job IDs, payloads, retry/
   delay state and database idempotency records under the freeze. Do not start an
   empty production queue merely because the earlier inspection was empty.
   No completed/failed job should be replayed automatically.
5. Start target in standby, validate owner and live-key read access, migration
   counts, credentials, Codex and dependencies. Check rendered volume names again.
6. Once old writers/consumers are stopped and data reconciles, switch consumers
   and the agreed public entry paths, then explicitly activate target production
   and the intended publish/scheduler settings. Record the first new target write.
7. Perform the approved business acceptance (Google sync, generation, one intended
   publication/notification/webhook as applicable), inspect queue errors and shared
   workload resources. Retain Railway during the agreed observation period.

Before target writes, rollback can restore old routing/settings and resume the
old consumer. After target writes, freeze both sides and reconcile/transfer the
new data or repair forward before resuming one writer. DNS alone does not recover
new target state. New scheduled/off-host backups and disaster-recovery drills are
excluded by the user's decision; temporary migration exports are still necessary.
