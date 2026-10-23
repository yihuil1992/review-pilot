# Security

Review Pilot is single-owner self-hosted software. The deployment owner is the only trust boundary.

## Secrets

- `APP_SECRET_KEY` encrypts Google refresh tokens and Twilio auth tokens at rest.
- `OWNER_SESSION_SECRET` signs owner session cookies and signed review links.
- `.env`, logs, local databases, Codex auth folders, and tunnel state must never be committed.
- The app never returns saved secret plaintext to the browser after initial entry.

Generate secrets before real use:

```bash
openssl rand -base64 32
openssl rand -base64 48
```

## Codex Runtime

The default semantic provider uses the owner's Codex subscription auth through `codex exec`.

- Do not store Codex auth tokens in the database.
- Treat the deployment user's Codex auth directory as a protected secret directory.
- The app auto-detects a semantic workdir under `.agent-session`; keep that directory out of git.
- Keep transcripts short-lived. The default target retention is 7 days.

## Publishing To GitHub

Before pushing this project:

1. Publish only this clean project source tree.
2. Run a secret scan across the source tree and the old prototype folder.
3. Rotate any credential that appeared in historical files, logs, OAuth state, databases, or deployment notes.
4. Keep `.env.example` synthetic and token-free.

## External Providers

Google Business Profile OAuth requires consent screen setup, OAuth credentials, and a Google account that owns or manages the target locations.

Twilio SMS may require sender registration or verification depending on country, number type, and account status.

## External API

- External integrations use independently revocable opaque API keys, never the owner password or browser session.
- Only a hash of each API key is stored. Plaintext is displayed once at creation or rotation.
- API clients are bound to `REVIEW_PILOT_ENV` and explicit scopes plus location grants.
- Test and live deployments should use separate databases. A test client is rejected by a live deployment and vice versa.
- Live Google publishing, real Twilio sends, and disabling publish test mode require live environment checks, dedicated scopes, confirmation, rate-limit capacity, idempotency, and durable audit start.
- Webhook secrets are encrypted with `APP_SECRET_KEY`; outbound bodies are signed and retried by the worker.
- Set explicit production `WEB_ORIGIN` and `TRUST_PROXY`. Network allowlists are defense in depth, not authentication.

See [External API](external-api.md) for scopes, rotation, errors, webhooks, and incident response.

## Dependency security

Zod is pinned to 4.6.7 across all workspace consumers to address
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).
OpenAPI 3.1 schemas use Zod's native JSON Schema 2020-12 conversion, removing
the prototype-extension adapter and its CJS/ESM instance coupling. Contract tests
cover bounded oversized-array rejection, webhook records, sparse patches,
pagination coercion, explicit live confirmation and generated OpenAPI.

Use Node 24.22.1 and pnpm 10.33.0. Install OSV-Scanner 2.7.0 from its
[official release](https://github.com/google/osv-scanner/releases/tag/v2.7.0),
verify the release checksum, and put it on PATH or set `OSV_SCANNER` to its path.

```bash
pnpm test:security
node scripts/security-scan-smoke.mjs
pnpm security:scan
pnpm audit --json
```

The OSV gate scans the entire pnpm lockfile, including development and optional
platform packages. There are no platform filters, severity exclusions, advisory
ignores or dependency overrides. Every finding blocks the check. A tool,
download, network, parsing, empty-report or source-mismatch failure also blocks
it. The runner checks both the scanner exit code and report contents, and removes
stale JSON before scanning. The checked-in empty scanner configuration makes the
policy explicit.

`security-reports/current/` contains full OSV JSON, stdout/stderr and a status
record with the lockfile SHA256. The smoke checks use synthetic, never-installed
package manifests: a vulnerable version must fail, a patched version must pass,
malformed input and a refused proxy must fail. If the patched fixture later
receives an advisory, update it to a verified fixed version; do not weaken the
gate. Local reports are ignored by Git and excluded from Docker builds.

The `Dependency security` GitHub workflow runs on PRs, pushes to `main`,
`yihui/**` and `codex/**`, manual dispatch, and daily at 10:23 UTC. **Scheduled
runs only become active after the workflow enters the default branch.** It uses
read-only repository permissions and uploads the complete scan/control evidence
on success or failure, with 30-day retention. Download failures retain setup
diagnostics and cannot produce a passing scan. The workflow does not deploy.
Passing checks are not enforced merge protection unless repository rules already
require them; this work does not change those rules.

The normal CI additionally runs `pnpm test`, deployment contracts, typecheck,
lint and build. `pnpm test:database` exercises Prisma against a disposable local
PostgreSQL database. It accepts only `DB_TEST_DATABASE_URL` with a loopback host,
user `security_test`, database `review_pilot_security_test`, and no URL options;
it never loads the application `.env`. Do not point this command at real data.

For migration details, before/after evidence and remaining limits, see the
[2026-10-23 dependency review](security/dependency-audit-2026-10-23.md).
