# Dependency security review — 2026-10-23

## Baseline and deployment isolation

The repair branch starts from `main` commit
`41273fed62339ba1d15345e9add57918cdf4c872` (PR #19). PR #18 was already squash
merged as `3d177dccac2ed3d1aaa9edc0d0db8f531c72b184` at 13:19:46 UTC;
`4802199f9ca69a0b51e74e8fabcb7f24981bb321` subsequently documented the move to
`main`. This is a follow-up PR targeting `main`, not a stack on
`codex/coolify-trial`.

Read-only Coolify checks on October 23 confirmed:

- Git Source tracks `main`, commit selection `HEAD`, with webhook auto-deploy.
- Preview deployments are disabled (the UI offers **Enable Preview Deployments**,
  and lists no previews). Old project/environment labels containing “trial” do
  not describe the deployment isolation.
- The latest successful deployment, `5e8wp1rimynkrpnjscmwmmfb`, started at
  13:50:29 UTC and started new containers at 13:52:27 UTC.
- A formatted read-only Docker inspection of the running API, web and worker
  showed the same image ID
  `sha256:621e8ad40c68e0eb007aa2a6985216377fe9cde1bfd83f463909d295ad293c89`
  and image revision `41273fed62339ba1d15345e9add57918cdf4c872` for all three.

These live settings and running-image evidence establish isolation for
`yihui/dependency-security`; draft status alone does not. No production settings,
services, database state, credentials, access rules or deployments were changed.
The original checkout was left unchanged. Internal UI screenshots remain local.

## Scan comparison

OSV-Scanner 2.7.0 was obtained from Google's official release and checksum
verified. Node remained pinned to 24.22.1. The full pnpm lockfile was scanned,
without platform filters or ignored advisories.

| Metric | Baseline | Repaired lockfile |
| --- | ---: | ---: |
| Packages scanned by OSV | 703 | 782 |
| Unique OSV advisory IDs | 95 | 0 |
| Affected package versions | 27 | 0 |
| Affected package names | 24 | 0 |
| Package/advisory pairs | 100 | 0 |
| pnpm audit reported vulnerabilities | 101 | 0 |
| OSV / pnpm audit exit codes | 1 / 1 | 0 / 0 |

The original npm audit breakdown was critical 4, high 42, moderate 49, low 6.
Its 97 advisory records contained 96 unique GHSA IDs, including a repeated Vitest
advisory and one extra ID compared with OSV. The extra
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
for `braces` was withdrawn by the publisher on October 23 and the npm feed caught
up during this work. `braces@3.0.3` remains in the lockfile; this is a withdrawn
advisory, not an independently fixed vulnerability or a local suppression.
Counts across tools therefore must not be interpreted as 101 distinct fixes.

The [complete evidence archive](reports/dependency-security-2026-10-23.zip)
contains full before/after OSV and pnpm audit JSON, both lockfiles, classification,
control scan outputs, and file hashes. Only machine-specific source paths in
JSON were normalized; advisory content was retained. Raw originals and command
logs remain in the ignored local `security-reports/2026-10-23/` directory.
CI retains its full raw JSON and diagnostics separately for 30 days.

## Exposure and duplicate classification

Traversing lockfile importers and transitive dependencies found 21 affected
package versions reachable from production dependency declarations and 6 only
from development declarations. The first group contains 87 unique IDs; the
development-only package paths contain 10 IDs, two of which also occur in the
production group. Thus 8 IDs are exclusively development-path findings.
`classification.json` in the archive preserves every affected version, path,
advisory ID, alias and severity.

Dependency reachability does not establish exploitability. The image currently
copies the complete build tree, so development tool presence cannot simply be
treated as absence from the deployed filesystem.

| Surface | Observed relevance |
| --- | --- |
| Nest/Express, body-parser, qs | API HTTP runtime; prioritized compatible upgrades |
| Next.js | Public web runtime; no custom middleware, Server Actions or next/image usage found, but all advisories retained in policy |
| MCP SDK, Hono | Agent uses stdio, not an HTTP MCP server; HTTP transport findings have reduced direct exposure |
| Multer | Transitive Nest dependency; no upload interceptor/route usage found |
| Prisma tooling, deepmerge-ts | Client generation/migration tooling; CLI remains present in the deployment image |
| PostCSS, Tailwind, shadcn, browserslist and related utilities | Primarily CSS/build/generator processing; shadcn CSS is imported by the web app |
| Vitest, Vite, esbuild, tsx | Test/development tooling; no production Vite dev server |

## Repairs and compatibility

Compatible stable upgrades were applied first, reducing OSV's 95 IDs to 8.
The owner then explicitly approved Next 16 and Prisma 7 to remove the remaining
transitive findings. No `force`, transitive overrides, ignored advisories or
prereleases were used. Targeted direct upgrades are pinned exactly:

- Nest common/core/platform-express 11.2.8 and Express 5.3.0.
- MCP SDK 1.32.1; tsx 4.23.15; Vitest 4.1.12 with an explicit supported Vite
  8.3.5 development peer to avoid retaining the vulnerable auto-selected peer.
- shadcn 4.22.1; Tailwind and its PostCSS plugin 4.3.3.
- Next 16.4.3; Prisma CLI/client/PostgreSQL adapter 7.10.1.

Next uses the official `next build --webpack` option to preserve the existing
build backend and CPU/heap controls. No request API call sites required changes.
Next-generated TypeScript declarations were refreshed. See the
[Next 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16).

Prisma uses the `prisma-client` generator with ignored output under
`packages/db/src/generated/prisma`, `prisma.config.ts` for CLI connection
configuration, and the official `@prisma/adapter-pg` driver. Existing exports and
singleton access remain stable. Schema models and existing migration SQL are
unchanged. A missing `DATABASE_URL` fails before connection instead of falling
back to ambient PostgreSQL settings. The URL's schema selection is retained.
The driver pool is explicitly limited to 10 connections, with a 5-second
connection timeout and 300-second idle timeout; this differs from the previous
Rust engine's CPU-dependent pool sizing. TLS certificate verification has not
been disabled. See the
[Prisma 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

The root test script now builds the database package first: the original command
failed in a clean tree because API/worker tests import its distribution output.
CI now actually runs those tests and an isolated PostgreSQL integration test.

## Verification

All following local checks passed on Node 24.22.1 and pnpm 10.33.0:

- Frozen installation and Prisma client generation.
- Root unit tests: 33 API and 14 worker tests, with mocked providers/database.
- Deployment contracts: 4 tests.
- Typecheck, repository lint (TypeScript checks), and all-package production build.
- Static demo build and constrained web build with one CPU and a 768 MiB heap.
- Next production HTTP smoke: `/`, `/reviews`, `/notifications`, `/settings`,
  `/icon.svg` returned 200. This checks server output, not browser interaction.
- MCP stdio initialization and listing 17 tools; no tools invoked.
- PostgreSQL 18.6 in a dedicated local disposable container: seven existing
  migrations, zero schema drift, JSON/date CRUD, P2002 error mapping, interactive
  rollback, batch commit, raw query, and missing-URL connection rejection.
- Four scanner unit tests plus real vulnerable/patched/malformed/network-failure
  controls. Expected wrapper exits were 1/0/2/2 respectively; all matched.
- Full repaired lockfile scan: 782 packages, no advisories, exit 0; npm audit 0.

Tests did not connect to production or invoke real Google sync/publishing,
Twilio, Discord or Codex inference. Earlier failed checks are retained locally
alongside their successful corrected runs. GitHub Actions results must be
checked on the PR's exact head; they are not inferred from these local checks.

## CI policy and remaining limits

The new OSV workflow covers PRs, main/security branch pushes, manual dispatch and
daily scheduled scans, retaining full evidence even when the gate fails. Every
finding blocks the job. Scanner/download/network/parse/empty-output failures
also fail; stale successful output cannot make a failed invocation green.
The daily schedule becomes effective only after merge into the default branch.
No branch protection or deployment workflow was changed.

Zero reported advisories describes the checked lockfile against the feeds at
scan time. It is not a guarantee against unknown vulnerabilities or an
application security audit. OS packages, base-image CVEs, external services and
the independently distributed Codex executable were not covered by this
lockfile review. Production ARM64 image execution, TLS-connected remote database
behavior, full browser workflows and sustained database load were not tested.
The Prisma pool/driver change should receive normal release review and runtime
observation when deployment is separately authorized.

Production remains on the baseline described above. Merging into `main` would
trigger the existing Coolify deployment; this draft PR does not authorize or
perform that merge/deployment.
