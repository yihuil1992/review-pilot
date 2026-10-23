# Production on Coolify

Review Pilot has run in production on Coolify since 2026-10-22. PR #18 is merged;
Coolify now follows `main` with native automatic deployment enabled. Pushes to
`main` use `sh scripts/build-coolify.sh` and `compose.coolify.production.yml`.
The former `codex/coolify-trial` branch name is historical.

The old Railway review-pilot project was retired on 2026-10-22; its provider
recovery grace period ends on 2026-10-24 at 19:28 EDT. Do not restart old writers.
The separate sc-tools-backend project remains active on Railway.

The existing Coolify application retains its database, Redis and Codex state
volumes. Production is explicitly active, Google sync and automatic draft generation
are enabled, and SMS scheduling remains disabled with Twilio unconfigured.
`compose.coolify.yml` is only for separately isolated trials; do not switch the
production application back to it. Keep the preceding working image when deploying.

The selected production hostname is exclusively `https://reviews.shakingcrab.net`.
No old `.com` alias, proxy or redirect is included in the cutover plan.

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
- Twilio is intentionally unconfigured. Do not migrate Twilio environment variables,
  account/sender settings or auth-token secrets. After the database restore, remove
  TwilioConfig and SecretValue rows with scope `twilio` in standby. Production
  notification scheduling stays false; business webhooks remain independent.
- Keep `REVIEW_PILOT_OAUTH_SETUP_ENABLED=false` normally. An explicitly enabled
  setup window permits only the existing OAuth code exchange and userinfo lookup;
  Google business actions, SMS and webhook dispatch remain blocked in standby.
- HTTP-to-HTTPS redirects/HSTS/private-app noindex headers are controlled by the
  image's `PUBLIC_WEB_ORIGIN`, independently of business trial mode.
- Production limits: PostgreSQL512 MiB, Redis384 MiB (maxmemory256 MiB/noeviction),
  API/worker768 MiB, web/init512 MiB. Semantic concurrency1, notifications2,
  webhooks4. Native build remains separately capped at2 GiB/two CPUs. Validate
  runtime headroom with the existing shared workloads; limits are not reservations.

## Integration configuration and historical handoff

- Google callback: `https://reviews.shakingcrab.net/api/google/oauth/callback`.
  Production uses only the `.net` callback. Historical `.com` and Railway callback
  registrations are not used by this deployment; provider cleanup is separate.
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
- Twilio credentials, SMS sending and SMS readiness checks are excluded. Preserve
  historical notification records and existing provider accounts/numbers unchanged.
  A Settings indicator saying Twilio is unconfigured is expected, not a cutover gate.
  Links derive their destination from database publicBaseUrl, which must be changed
  to `.net` after final restore. Previously sent `.com` links do not automatically
  move or redirect. Production and trial WEB_ORIGIN both allow only `.net`.

## Historical cutover sequence — completed on 2026-10-22

The following records the one-time migration. Do not repeat its restore/reset steps
on the active database; the later Railway retirement supersedes its retention steps.

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
   Remove restored Twilio configuration/token rows before leaving standby; do not
   delete historical notification records or business webhook settings.
4. If queues contain unfinished work, preserve/reconcile job IDs, payloads, retry/
   delay state and database idempotency records under the freeze. Do not start an
   empty production queue merely because the earlier inspection was empty.
   No completed/failed job should be replayed automatically.
5. Start target in standby, validate owner and live-key read access, migration
   counts, credentials, Codex and dependencies. Check rendered volume names again.
6. Once old writers/consumers are stopped and data reconciles, set the consumer's
   REVIEW_PILOT_API_BASE to https://reviews.shakingcrab.net and redeploy it. Keep
   the existing `.net` Coolify domain/certificate/tunnel; no `.com` ingress work
   is required. Then explicitly activate target production
   and the intended publish/scheduler settings. Record the first new target write.
7. Perform the approved business acceptance (Google sync, generation, one intended
   publication/business webhook as applicable; no SMS), inspect queue errors and shared
   workload resources. Retain Railway during the agreed observation period.

During the original cutover, rollback before target writes could restore old
routing/settings and resume the old consumer. This is no longer a current recovery
option after Railway retirement. After target writes, freeze both sides and reconcile/transfer the
new data or repair forward before resuming one writer. DNS alone does not recover
new target state. New scheduled/off-host backups and disaster-recovery drills are
excluded by the user's decision; temporary migration exports are still necessary.

## Node runtime (2026-10-22)

Both Docker stages and local `.nvmrc` use Node 24.22.1. Dependency versions, migration files, activation flags and scheduler defaults are unchanged. Coolify builds the reviewed `main` commit with the existing constrained builder and verifies the image revision/platform before replacing containers. Keep Include source commit in build and automatic deployment enabled.
