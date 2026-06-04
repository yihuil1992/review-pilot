# Deployment

Review Pilot has one codebase and two production profiles.

For Railway, use the dedicated profile in [docs/railway.md](railway.md). It keeps the app on Railway-provided domains, uses Railway Postgres/Redis, proxies `/api/*` through the web service, and stores Codex auth on a persistent Railway volume.

## Mac Public Profile

This is the recommended first production path because Codex subscription auth naturally lives on the owner's Mac.

Run locally:

```powershell
pnpm install
docker compose up -d postgres redis
$env:DATABASE_URL="postgresql://review_pilot:review_pilot@localhost:5433/review_pilot"
pnpm db:migrate
pnpm dev
```

Run Codex login in the same macOS user account that starts the worker:

```bash
codex login
codex exec --skip-git-repo-check --ephemeral --sandbox read-only -m gpt-5.4 "Return JSON: {\"ok\":true}"
```

The Settings page can also start the official Codex device-code login flow. Use it when you want a browser-driven setup:

1. Select the Codex model.
2. Select **Test Codex** to verify that the CLI is available on the server.
3. Select **Start browser login**.
4. Open the displayed link and enter the code.
5. Select **Check login** until it reports ChatGPT login.

Use a stable HTTPS tunnel:

- Cloudflare Tunnel: best default when you own or can manage DNS. Stable named tunnel URLs fit Google OAuth redirect URIs.
- Tailscale Funnel: good for personal infrastructure, but check domain and access constraints before using it for client callbacks.
- ngrok free: useful for testing, but changing public URLs cause OAuth redirect and webhook churn.

Set the public base URL in Settings. The app shows the Google redirect URI derived from that value.

## Server Public Profile

Use a VPS or persistent-volume host. Avoid serverless for the default semantic engine because Codex auth and semantic jobs need durable runtime state.

Required persistent data:

- PostgreSQL volume or managed Postgres.
- Redis or managed Redis.
- The deployment user's Codex auth directory. The app auto-detects the standard home path.
- The semantic runtime workdir. The app auto-creates a default under `.agent-session`.
- `.env` with stable `APP_SECRET_KEY` and `OWNER_SESSION_SECRET`.

Use a process manager such as Docker Compose, pm2, systemd, or launchd-equivalent supervision. All services should restart on failure.

## Backups

Back up Postgres and the deployment secrets together.

```bash
pg_dump "$DATABASE_URL" > review-pilot-$(date +%Y%m%d).sql
```

Keep `APP_SECRET_KEY` with the backup. Without it, encrypted Google refresh tokens and Twilio auth tokens cannot be decrypted.

## Callback Checklist

- Public base URL uses HTTPS.
- Google OAuth redirect URI exactly matches `/api/google/oauth/callback`.
- Twilio does not require an inbound webhook for the default product path; it only sends outbound SMS links.
- If the tunnel URL changes, update Settings and the Google/Twilio consoles before syncing or testing.
