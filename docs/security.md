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
