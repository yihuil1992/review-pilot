import { OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import {
  ApiOperationSchema,
  ExternalDraftEditBodySchema,
  ExternalDraftGenerateBodySchema,
  ExternalDraftReviseBodySchema,
  ExternalLocationPatchBodySchema,
  ExternalPublishBodySchema,
  ExternalPublishModeBodySchema,
  ProblemDetailsSchema
} from "@review-pilot/shared";
import { z } from "zod";

extendZodWithOpenApi(z);

export function externalApiDocument() {
  const registry = new OpenAPIRegistry();
  registry.register("ProblemDetails", ProblemDetailsSchema);
  registry.register("ApiOperation", ApiOperationSchema);
  registry.register("DraftEditInput", ExternalDraftEditBodySchema);
  registry.register("DraftGenerateInput", ExternalDraftGenerateBodySchema);
  registry.register("DraftRevisionInput", ExternalDraftReviseBodySchema);
  registry.register("PublishAttemptInput", ExternalPublishBodySchema);
  registry.register("LocationPatchInput", ExternalLocationPatchBodySchema);
  registry.register("PublishModeInput", ExternalPublishModeBodySchema);
  registry.registerComponent("securitySchemes", "BearerAuth", { type: "http", scheme: "bearer", bearerFormat: "ReviewPilotApiKey" });
  const generator = new OpenApiGeneratorV31(registry.definitions);
  const document = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Review Pilot External API",
      version: "1.0.0",
      description: "Versioned machine-to-machine API for owner-controlled internal-system integration."
    },
    servers: [{ url: "/api/v1" }]
  });
  return { ...document, paths: paths() };
}

function paths() {
  return {
    "/openapi.json": { get: operation("Download the OpenAPI contract", ["system:read"]) },
    "/system/status": { get: operation("Read safe system status", ["system:read"]) },
    "/reviews": { get: operation("List reviews", ["reviews:read"], { paginated: true }) },
    "/reviews/{reviewId}": { get: operation("Get a review", ["reviews:read"], { pathId: "reviewId" }) },
    "/reviews/{reviewId}/draft": { patch: operation("Save an edited draft", ["reviews:write"], { pathId: "reviewId", body: "DraftEditInput", idempotent: true }) },
    "/reviews/{reviewId}/draft-generations": { post: operation("Generate a draft", ["drafts:generate"], { pathId: "reviewId", body: "DraftGenerateInput", idempotent: true, accepted: true }) },
    "/reviews/{reviewId}/draft-revisions": { post: operation("Revise a draft", ["drafts:generate"], { pathId: "reviewId", body: "DraftRevisionInput", idempotent: true, accepted: true }) },
    "/reviews/{reviewId}/mark-handled": { post: operation("Mark a review handled", ["reviews:write"], { pathId: "reviewId", idempotent: true }) },
    "/reviews/{reviewId}/publish-attempts": { post: operation("Test or live publish a reply", ["reviews:publish:test", "reviews:publish:live"], { pathId: "reviewId", body: "PublishAttemptInput", idempotent: true }) },
    "/locations": { get: operation("List authorized locations", ["locations:read"]) },
    "/locations/{locationId}": { patch: operation("Update safe location fields", ["locations:manage"], { pathId: "locationId", body: "LocationPatchInput", idempotent: true }) },
    "/locations/{locationId}/sync-runs": { post: operation("Queue a location review sync", ["sync:run"], { pathId: "locationId", idempotent: true, accepted: true }) },
    "/sync/status": { get: operation("Read review-sync scheduler status", ["system:read"]) },
    "/google-accounts": { get: operation("List safe connected-account metadata", ["locations:read"]) },
    "/google-accounts/{accountId}/location-discoveries": { post: operation("Discover locations for a connected account", ["locations:manage"], { pathId: "accountId", idempotent: true }) },
    "/notification-tasks": { get: operation("List notification tasks", ["notifications:read"], { paginated: true }) },
    "/notification-tasks/{reviewId}/send-attempts": { post: operation("Queue real notification delivery", ["notifications:send"], { pathId: "reviewId", idempotent: true, accepted: true }) },
    "/notification-tasks/{reviewId}/cancel": { post: operation("Cancel a notification task", ["notifications:manage"], { pathId: "reviewId", idempotent: true }) },
    "/notification-tasks/{reviewId}/rerun": { post: operation("Rerun a notification task", ["notifications:manage"], { pathId: "reviewId", idempotent: true, accepted: true }) },
    "/notification-runs": { post: operation("Queue all due notifications", ["notifications:send"], { idempotent: true, accepted: true }) },
    "/operations/{operationId}": { get: operation("Read an operation", ["operations:read"], { pathId: "operationId" }) },
    "/settings": {
      get: operation("Read safe configured-state settings", ["settings:read"]),
      patch: operation("Change publish test mode", ["publish-mode:manage"], { body: "PublishModeInput", idempotent: true })
    }
  };
}

function operation(summary: string, scopes: string[], options: { pathId?: string; body?: string; idempotent?: boolean; accepted?: boolean; paginated?: boolean } = {}) {
  const parameters = [
    ...(options.pathId ? [{ name: options.pathId, in: "path", required: true, schema: { type: "string" } }] : []),
    ...(options.idempotent ? [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 200 } }] : []),
    ...(options.paginated ? [
      { name: "cursor", in: "query", required: false, schema: { type: "string" } },
      { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } }
    ] : [])
  ];
  return {
    summary,
    description: `Required scope${scopes.length === 1 ? "" : " (mode dependent)"}: ${scopes.join(" or ")}`,
    security: [{ BearerAuth: [] }],
    parameters,
    ...(options.body ? { requestBody: { required: true, content: { "application/json": { schema: { $ref: `#/components/schemas/${options.body}` } } } } } : {}),
    responses: {
      [options.accepted ? "202" : "200"]: { description: options.accepted ? "Accepted" : "Success", content: { "application/json": { schema: { type: "object" } } } },
      "400": problem("Invalid request"),
      "401": problem("Invalid or inactive bearer token"),
      "403": problem("Missing scope or location grant"),
      "409": problem("State or idempotency conflict"),
      "429": problem("Rate limit exceeded")
    }
  };
}

function problem(description: string) {
  return { description, content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } } };
}
