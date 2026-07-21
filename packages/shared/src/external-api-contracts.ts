import { z } from "zod";

export const ApiClientEnvironmentSchema = z.enum(["test", "live"]);

export const ApiScopeSchema = z.enum([
  "system:read",
  "reviews:read",
  "reviews:write",
  "drafts:generate",
  "reviews:publish:test",
  "reviews:publish:live",
  "locations:read",
  "locations:manage",
  "sync:run",
  "notifications:read",
  "notifications:send",
  "notifications:manage",
  "settings:read",
  "publish-mode:manage",
  "operations:read"
]);

export const apiScopes = ApiScopeSchema.options;
export type ApiScope = z.infer<typeof ApiScopeSchema>;

export const CursorPageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
}).strict();

export const ExternalReviewListQuerySchema = CursorPageQuerySchema.extend({
  status: z.enum(["unhandled", "all"]).default("unhandled"),
  locationId: z.string().min(1).optional(),
  severity: z.enum(["green", "yellow", "red"]).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  updatedSince: z.string().datetime().optional()
}).strict();

export const ExternalNotificationListQuerySchema = CursorPageQuerySchema.extend({
  status: z.enum(["pending", "sent", "failed", "canceled", "skipped", "none"]).optional(),
  locationId: z.string().min(1).optional(),
  dueBefore: z.string().datetime().optional(),
  updatedSince: z.string().datetime().optional()
}).strict();

export const ExternalDraftEditBodySchema = z.object({
  body: z.string().trim().min(1).max(4096),
  expectedVersion: z.number().int().positive()
}).strict();

export const ExternalDraftGenerateBodySchema = z.object({
  currentDraftBody: z.string().trim().min(1).max(4096).optional(),
  expectedUpdatedAt: z.string().datetime().optional()
}).strict();

export const ExternalDraftReviseBodySchema = z.object({
  instruction: z.string().trim().min(1).max(1000),
  currentDraftBody: z.string().trim().min(1).max(4096).optional(),
  expectedVersion: z.number().int().positive().optional()
}).strict();

export const ExternalPublishBodySchema = z.object({
  body: z.string().trim().min(1).max(4096),
  mode: z.enum(["test", "live"]),
  confirmLive: z.boolean().default(false),
  expectedUpdatedAt: z.string().datetime().optional()
}).strict();

export const ExternalLocationPatchBodySchema = z.object({
  enabled: z.boolean().optional(),
  notificationPhoneNumber: z.string().max(32).optional()
}).strict().refine((value) => value.enabled !== undefined || value.notificationPhoneNumber !== undefined, {
  message: "At least one supported location field is required"
});

export const ExternalPublishModeBodySchema = z.object({
  publishTestMode: z.boolean(),
  confirmLive: z.boolean().default(false)
}).strict();

export const ApiClientCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  environment: ApiClientEnvironmentSchema,
  scopes: z.array(ApiScopeSchema).min(1),
  allLocations: z.boolean().default(false),
  locationIds: z.array(z.string().min(1)).max(500).default([]),
  expiresAt: z.string().datetime().optional(),
  ownerPassword: z.string().min(1)
}).strict();

export const ApiClientRotateBodySchema = z.object({
  expiresAt: z.string().datetime().optional(),
  ownerPassword: z.string().min(1)
}).strict();

export const OwnerConfirmedBodySchema = z.object({
  ownerPassword: z.string().min(1)
}).strict();

export const WebhookEventTypeSchema = z.enum([
  "review.created",
  "review.updated",
  "draft.ready",
  "publish.succeeded",
  "publish.failed",
  "notification.updated",
  "sync.completed"
]);

export const webhookEventTypes = WebhookEventTypeSchema.options;
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

export const WebhookEndpointCreateBodySchema = z.object({
  apiClientId: z.string().min(1),
  url: z.string().url().refine((value) => value.startsWith("https://"), "Webhook URL must use HTTPS"),
  events: z.array(WebhookEventTypeSchema).min(1),
  ownerPassword: z.string().min(1)
}).strict();

export const WebhookEndpointUpdateBodySchema = z.object({
  url: z.string().url().refine((value) => value.startsWith("https://"), "Webhook URL must use HTTPS").optional(),
  events: z.array(WebhookEventTypeSchema).min(1).optional(),
  active: z.boolean().optional()
}).strict();

export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
  requestId: z.string(),
  errors: z.unknown().optional()
});

export const ApiOperationSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.enum(["queued", "running", "succeeded", "failed", "canceled"]),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  createdAt: z.string().datetime(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  result: z.unknown().nullable(),
  error: z.unknown().nullable()
});

export const WebhookEnvelopeSchema = z.object({
  eventId: z.string(),
  eventType: WebhookEventTypeSchema,
  occurredAt: z.string().datetime(),
  resourceType: z.string(),
  resourceId: z.string(),
  resourceVersion: z.string(),
  data: z.record(z.unknown())
});

export type ApiClientEnvironment = z.infer<typeof ApiClientEnvironmentSchema>;
export type WebhookEnvelope = z.infer<typeof WebhookEnvelopeSchema>;
