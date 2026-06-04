# Agent Interfaces

Review Pilot exposes two agent-friendly control surfaces:

- CLI: shell-friendly commands with stable `--json` output.
- MCP server: stdio tools for AI clients that support Model Context Protocol.

Both call the existing Nest API. They do not replace the web Settings UI, and they do not store secrets.

## Authentication

Set the API base URL when the API is not running at the default:

```powershell
$env:REVIEW_PILOT_API_BASE_URL="http://localhost:4000/api"
```

For local agent use, prefer automatic login through an environment variable:

```powershell
$env:REVIEW_PILOT_OWNER_PASSWORD="<owner password>"
```

Alternatively, pass an authenticated owner session cookie and CSRF token:

```powershell
$env:REVIEW_PILOT_COOKIE="rp_owner_session=...; rp_csrf=..."
$env:REVIEW_PILOT_CSRF="..."
```

Avoid passing secrets as CLI flags because shell history is easy to leak.

## CLI

Run from the repository root:

```powershell
pnpm --silent agent:cli -- status --json
pnpm --silent agent:cli -- doctor --json
pnpm --silent agent:cli -- reviews list --status unhandled --json
pnpm --silent agent:cli -- reviews get <reviewId> --json
pnpm --silent agent:cli -- reviews generate <reviewId> --json
pnpm --silent agent:cli -- reviews regenerate <reviewId> --instruction "Make it shorter and warmer" --json
pnpm --silent agent:cli -- reviews publish-test <reviewId> --json
pnpm --silent agent:cli -- reviews mark-handled <reviewId> --json
pnpm --silent agent:cli -- notifications list --status pending --json
pnpm --silent agent:cli -- notifications run-due --json
pnpm --silent agent:cli -- settings bootstrap --json
```

Mutating commands support `--dry-run`:

```powershell
pnpm --silent agent:cli -- reviews generate <reviewId> --dry-run --json
```

Local demo build is also available:

```powershell
pnpm --silent agent:cli -- demo build
```

## MCP Server

Run the stdio MCP server:

```powershell
pnpm --silent agent:mcp
```

After building, an MCP client can also launch the package binary:

```powershell
pnpm --filter @review-pilot/agent exec review-pilot-mcp
```

Example MCP client configuration shape:

```json
{
  "mcpServers": {
    "review-pilot": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "C:/Users/yihui/Documents/GitHub/review-pilot", "agent:mcp"],
      "env": {
        "REVIEW_PILOT_API_BASE_URL": "http://localhost:4000/api",
        "REVIEW_PILOT_OWNER_PASSWORD": "<owner password>"
      }
    }
  }
}
```

Available MCP tools:

- `get_system_status`
- `doctor`
- `list_reviews`
- `get_review`
- `generate_reply`
- `regenerate_reply`
- `publish_test_reply`
- `publish_live_reply`
- `mark_review_handled`
- `list_notification_tasks`
- `get_review_sync_status`
- `run_due_notifications`
- `send_notification_now`
- `cancel_notification`
- `rerun_notification`
- `get_settings_bootstrap`
- `set_publish_mode`

Tool responses use the same envelope:

```json
{
  "ok": true,
  "data": {}
}
```

Failures include a stable error object and optional next actions:

```json
{
  "ok": false,
  "error": {
    "message": "Owner login required",
    "status": 401
  },
  "nextActions": [
    "Set REVIEW_PILOT_OWNER_PASSWORD for automatic login"
  ]
}
```

## Safety Rules

- Secret setup remains in the web Settings UI.
- `publish_test_reply` only publishes internally when Review Pilot test mode is on. It can optionally enable test mode first.
- `publish_live_reply` requires `confirmLive=true`, and the server must have publish test mode disabled.
- CLI live publish requires `--confirm-live`.
- Notification commands may send SMS when real Twilio settings are configured.
