# External API

Review Pilot exposes a versioned machine-to-machine API at `/api/v1`. It is intended for an owner-controlled internal management system. Existing browser, signed-link, CLI, MCP, Google callback, and Twilio callback routes remain separate.

## Production Posture

- Terminate HTTPS at a trusted ingress.
- Restrict source networks with a private route, VPN, Cloudflare Access, mTLS, or an IP allowlist when practical.
- Keep application authentication enabled even on private networks.
- Set `REVIEW_PILOT_ENV=test` on an isolated staging deployment and `REVIEW_PILOT_ENV=live` on production. Test and live deployments should use separate databases.
- Set an explicit comma-separated `WEB_ORIGIN`; production no longer reflects arbitrary credentialed browser origins.
- Set `TRUST_PROXY` only when every direct request comes through a trusted proxy.

## Create A Client

Open **Settings → External API** while logged in as the owner. Choose read-only or full operations, choose the location grants, confirm the owner password, and create the credential.

The plaintext key is shown once. Store it in the internal system's secret manager. Review Pilot stores only a SHA-256 hash. Rotation creates a second key on the same stable client identity so operation visibility, idempotency, and rate accounting continue during cutover. Revoke the old key after the caller switches.

Keys look like `rp_live_<public-id>.<random-secret>`. Send the key as a bearer token:

```http
Authorization: Bearer rp_live_...
Accept: application/json
```

Never send owner passwords, owner cookies, or API keys in query parameters.

## Scopes

| Scope | Capability |
| --- | --- |
| `system:read` | Safe readiness and OpenAPI contract |
| `reviews:read` | Review list and detail |
| `reviews:write` | Draft edit and mark handled |
| `drafts:generate` | AI draft generation and revision |
| `reviews:publish:test` | Test-mode publish attempts |
| `reviews:publish:live` | Confirmed live Google publish attempts |
| `locations:read` | Locations and connected-account summaries |
| `locations:manage` | Safe location fields and location discovery |
| `sync:run` | Queue location review sync |
| `notifications:read` | Notification task list |
| `notifications:send` | Real notification sends on live deployments |
| `notifications:manage` | Cancel and rerun notification tasks |
| `settings:read` | Safe configured-state booleans |
| `publish-mode:manage` | Explicit publish test-mode changes |
| `operations:read` | Client-owned asynchronous operations |

Scopes and location grants are both enforced. An object ID does not bypass location authorization. `allLocations=false` with no grants means no location-backed access. `allLocations=true` intentionally includes locations connected later.

## Contract

Download the authenticated OpenAPI 3.1 contract:

```http
GET /api/v1/openapi.json
Authorization: Bearer <key with system:read>
```

All responses include `X-Request-Id`. A valid caller-provided ID is propagated. Successful resources use a `data` envelope; lists also include `page.nextCursor`. Dates are UTC RFC 3339 strings and IDs are opaque.

List endpoints use cursor pagination:

```http
GET /api/v1/reviews?limit=50&status=unhandled&locationId=...
GET /api/v1/reviews?limit=50&cursor=<nextCursor>
```

Do not modify or interpret cursors.

## Writes And Idempotency

Every mutation requires an `Idempotency-Key` between 8 and 200 characters:

```http
POST /api/v1/reviews/{reviewId}/draft-generations
Authorization: Bearer ...
Idempotency-Key: internal-review-123-generate-v1
Content-Type: application/json

{}
```

The key is scoped to the stable API client and action. Identical retries replay the stored acceptance/result. Reusing a key with a different body returns `409`. Keys are retained for 48 hours, with a documented minimum guarantee of 24 hours.

Queued work returns `202` plus an operation. Poll it with a key on the same client identity:

```http
GET /api/v1/operations/{operationId}
```

Statuses are `queued`, `running`, `succeeded`, `failed`, and `canceled`. Safe results and errors are returned; worker transcripts and prompts are not.

## Live Side Effects

Live Google publishing requires a live deployment/client, `reviews:publish:live`, server test mode disabled, `mode: "live"`, `confirmLive: true`, valid workflow state, an idempotency key, rate-limit capacity, and a durable audit-start record. Test publishing requires server test mode enabled and never toggles it automatically.

Real Twilio delivery requires a live deployment/client and `notifications:send`. Running every due notification also requires `allLocations=true`, because it is a cross-location operation.

## Errors

Errors use `application/problem+json` following RFC 9457:

```json
{
  "type": "https://review-pilot.local/problems/conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "Idempotency-Key was already used with a different request",
  "instance": "/api/v1/reviews/123/draft-generations",
  "code": "conflict",
  "requestId": "..."
}
```

Use the HTTP status and stable `code` for program logic. Preserve `requestId` in internal-system logs. Respect `Retry-After` on `429` responses.

## Webhooks

Owner-session endpoints under `/api/integrations/webhooks` create and manage webhook destinations. Webhook secrets are displayed once and encrypted at rest. Supported events are `review.created`, `review.updated`, `draft.ready`, `publish.succeeded`, `publish.failed`, `notification.updated`, and `sync.completed`.

Deliveries are at least once. Deduplicate by `eventId`. Review Pilot retries with exponential backoff and retains delivery status for 30 days.

Resource events are delivered only to active, non-revoked API Clients authorized
for the resource's business location. Clients with `allLocations=true` receive
events for current and future locations; otherwise an explicit location grant is
required. Event delivery also respects API Client scopes: Review, Draft, and Publish
events require `reviews:read`; notification events require `notifications:read`;
and sync completion requires `sync:run`.

| Event | Trigger |
| --- | --- |
| `review.created` | Google sync persists a newly discovered review. |
| `review.updated` | Persisted Google review fields actually change, or an owner/external workflow explicitly edits the draft or marks the review handled. Periodic sightings with no changed fields do not emit this event. |
| `draft.ready` | Automatic, owner, signed-link, or external API draft generation finishes and the draft is persisted. AI queue time is not the notification severity delay. |
| `publish.succeeded` | An owner, signed-link, or external API publish attempt succeeds. |
| `publish.failed` | A valid owner, signed-link, or external API publish attempt fails after processing begins. |
| `notification.updated` | Notification scheduling or state changes, including send, skip, retry failure, terminal failure, cancellation, and rerun. The payload is a minimal status projection and does not include signed owner links or Twilio provider details. |
| `sync.completed` | A scheduled location sync succeeds, or an external API location-sync operation succeeds for its initiating client. |

```text
X-Review-Pilot-Delivery: <delivery-id>
X-Review-Pilot-Timestamp: <unix-seconds>
X-Review-Pilot-Signature: v1=<base64url-hmac>
```

Verify `HMAC-SHA256(secret, timestamp + "." + rawRequestBody)` with constant-time comparison, reject timestamps outside the consumer's replay window, and parse JSON only after verification.

TypeScript consumers may use `verifyWebhookSignature` from `@review-pilot/shared` against the exact raw request body.

## TypeScript Client

`@review-pilot/shared` exports `ReviewPilotExternalApiClient` as a thin fetch-based client. Its base URL is the Review Pilot origin, not the `/api/v1` path:

```ts
import { ReviewPilotExternalApiClient } from "@review-pilot/shared";

const client = new ReviewPilotExternalApiClient({
  baseUrl: "https://reviews.example.com",
  apiKey: process.env.REVIEW_PILOT_API_KEY!
});

const reviews = await client.listReviews({ status: "unhandled", limit: 50 });
```

## Rollout And Incident Response

1. Integrate against an isolated test deployment and test credential.
2. Create a production read-only credential and verify pagination, filters, and object grants.
3. Add low-risk write scopes.
4. Exercise test publishing.
5. Grant live publish/notification scopes only when the internal system has explicit confirmation UX and idempotent retries.
6. Start with one location grant, inspect API audit and operation results, then expand.

If a key may be exposed, revoke that credential immediately in Settings, rotate the client, replace the caller secret, and review `ApiAuditEvent` records by credential prefix/request ID. Revocation is authoritative on the next request.
