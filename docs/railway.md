# Railway Deployment

This profile runs Review Pilot as three Railway services plus managed Postgres and Redis:

- `web`: Next.js owner UI and same-origin `/api/*` proxy.
- `api`: NestJS HTTP API, owner auth, Google OAuth callbacks, Twilio actions, and queue producers.
- `worker`: NestJS background scheduler for Google review sync, due notification jobs, and Codex semantic generation.
- `Postgres`: production database.
- `Redis`: BullMQ coordination.

The public URL should be the `web` Railway domain. The browser calls `/api/*` on that same domain, and Next rewrites those requests to the private Railway API service. This keeps owner cookies and Google OAuth callbacks on one public origin.

## Why This Shape

Railway supports pnpm shared monorepos by deploying each package as its own service with package-specific build and start commands. Review Pilot uses that model through the `railway.toml` files in `apps/web`, `apps/api`, and `apps/worker`.

Railway private networking gives each service an internal `railway.internal` DNS name. The web service can proxy server-side requests to `api.railway.internal`, but browser-side JavaScript cannot call private-network URLs directly. That is why the web app should use `NEXT_PUBLIC_API_BASE_URL=/api` and `API_PROXY_URL=http://api.railway.internal:4000`.

Codex stores auth and local state under `CODEX_HOME`. On Railway, attach a persistent volume to the worker service and set the Codex directories inside that volume so device-code login survives restarts and deploys. The API forwards Settings-page Codex test/login requests to the worker through Redis, so the authorization cache is written by the same service that later runs `codex exec`.

## Import Layout

Import the GitHub repo into Railway and create these services:

| Railway service | Source config | Build command | Start command |
| --- | --- | --- | --- |
| `web` | `/apps/web/railway.toml` | `pnpm build:web` | `pnpm --filter @review-pilot/web start` |
| `api` | `/apps/api/railway.toml` | `pnpm build:api` | `pnpm --filter @review-pilot/api start` |
| `worker` | `/apps/worker/railway.toml` | `pnpm build:worker` | `pnpm --filter @review-pilot/worker start` |

If Railway auto-imports the monorepo services, make sure each service is using the matching config file above. Keep the service names `web`, `api`, and `worker`; the documented private URL assumes the API service is named `api`.

Add Railway Postgres and Redis services in the same project/environment.

## Variables

Set these on both `api` and `worker`:

```text
NODE_ENV=production
APP_SECRET_KEY=<stable 32-byte base64 or hex key>
OWNER_SESSION_SECRET=<stable random session secret>
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
API_PORT=4000
PORT=4000
HOSTNAME=::
CODEX_MODEL=gpt-5.4
CODEX_HOME=/app/review-pilot-state/codex-home
CODEX_WORKDIR=/app/review-pilot-state/codex-workdir
```

Set these on `api`:

```text
WEB_ORIGIN=https://<web-service-domain>
OWNER_PASSWORD_NOTE_PATH=/tmp/OWNER_PASSWORD.local.md
```

Set these on `web`:

```text
NODE_ENV=production
NEXT_PUBLIC_API_BASE_URL=/api
API_PROXY_URL=http://api.railway.internal:4000
```

Use Railway reference variables for `DATABASE_URL` and `REDIS_URL` when available so they stay attached to the managed database services.

## Persistent Codex State

Attach a Railway volume to the `worker` service at:

```text
/app/review-pilot-state
```

Then use the `CODEX_HOME`, `CODEX_WORKDIR`, and `OWNER_PASSWORD_NOTE_PATH` values above.

The app also falls back to Railway's `RAILWAY_VOLUME_MOUNT_PATH` when a volume is attached and explicit Codex paths are not set. Explicit paths are still recommended because they make Settings and logs easier to reason about. Set the same `CODEX_HOME` and `CODEX_WORKDIR` values on `api` as configuration defaults, but the actual mounted storage only needs to exist on `worker`.

The `@openai/codex` package is a runtime dependency, so Railway installs the `codex` binary with the app. After the API and worker services are live:

1. Open the `web` public URL.
2. Create the owner password.
3. Save the public base URL as the `web` Railway domain.
4. Open Settings -> AI runtime.
5. Save the Codex model and paths if needed.
6. Select **Test Codex**.
7. Select **Start browser login**, open the device-code link, and complete ChatGPT login.
8. Select **Check login** until the runtime is ready.

Codex auth is intentionally tied to the worker service volume because the worker is the only service that runs `codex login` and `codex exec`. Keep `worker` at one replica unless you intentionally design shared Codex state for multiple workers.

## Google OAuth

Use the `web` Railway domain as the public base URL in Settings:

```text
https://<web-service-domain>
```

The app will derive the Google callback:

```text
https://<web-service-domain>/api/google/oauth/callback
```

Add that exact callback URL to the Google Cloud OAuth client. The request reaches the web service first, then the Next rewrite forwards it to the API service over Railway private networking.

## Deployment Checks

Before pushing a deployment change:

```powershell
pnpm build:api
pnpm build:web
pnpm build:worker
pnpm typecheck
```

After Railway deploys:

- `https://<web-service-domain>/` renders the owner UI.
- `https://<web-service-domain>/api/health` returns API health through the web proxy.
- Settings -> public base URL is the web Railway domain.
- Settings -> Test Codex reports Codex installed and logged in after device-code login. This check is executed by the worker through Redis, not by the API container.
- Tasks page shows sync scheduler status after worker startup.

## Notes

- `pnpm db:deploy` runs as a Railway pre-deploy step for both `api` and `worker`. Prisma migration deploy is safe to rerun and keeps fresh environments from starting without schema.
- Do not rotate `APP_SECRET_KEY` after saving Google/Twilio secrets unless you also plan a secret migration.
- Keep `NEXT_PUBLIC_DEMO_MODE` unset for production.
- If you expose the API service publicly for debugging, keep `WEB_ORIGIN` locked to the web domain.
