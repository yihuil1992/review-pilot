import { Body, ConflictException, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Query, Req, Res, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import {
  ExternalDraftEditBodySchema,
  ExternalDraftGenerateBodySchema,
  ExternalDraftReviseBodySchema,
  ExternalPublishBodySchema,
  ExternalReviewListQuerySchema,
  type ApiScope
} from "@review-pilot/shared";
import type { Response } from "express";
import { ReviewsService } from "../reviews/reviews.service.js";
import { SettingsService } from "../settings/settings.service.js";
import { parseBody } from "../validation.js";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { ApiAuditInterceptor } from "./api-audit.interceptor.js";
import { currentEnvironment } from "./api-client.service.js";
import { ExternalApiErrorFilter } from "./api-error.filter.js";
import { ApiIdempotencyService } from "./api-idempotency.service.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { ApiRateLimitService } from "./api-rate-limit.service.js";
import { apiData, apiList } from "./api-response.js";
import { RequireApiScopes } from "./api-scope.decorator.js";
import { ApiScopeGuard } from "./api-scope.guard.js";
import { ExternalDataService } from "./external-data.service.js";

@Controller("v1/reviews")
@UseGuards(ApiKeyGuard, ApiScopeGuard)
@UseInterceptors(ApiAuditInterceptor)
@UseFilters(ExternalApiErrorFilter)
export class ExternalReviewsController {
  constructor(
    @Inject(ReviewsService) private readonly reviews: ReviewsService,
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(ExternalDataService) private readonly data: ExternalDataService,
    @Inject(ApiIdempotencyService) private readonly idempotency: ApiIdempotencyService,
    @Inject(ApiRateLimitService) private readonly limits: ApiRateLimitService
  ) {}

  @Get()
  @RequireApiScopes("reviews:read")
  async list(@Req() request: ExternalApiRequest, @Query() query: unknown) {
    const input = parseBody(ExternalReviewListQuerySchema, query);
    const result = await this.data.listReviews(requiredPrincipal(request), { ...input, limit: input.limit ?? 50, status: input.status ?? "unhandled" });
    return apiList(request, result.items, result.nextCursor);
  }

  @Get(":reviewId")
  @RequireApiScopes("reviews:read")
  async get(@Req() request: ExternalApiRequest, @Param("reviewId") reviewId: string) {
    return apiData(request, await this.data.getReview(requiredPrincipal(request), reviewId));
  }

  @Patch(":reviewId/draft")
  @RequireApiScopes("reviews:write")
  async editDraft(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("reviewId") reviewId: string, @Body() body: unknown) {
    const input = parseBody(ExternalDraftEditBodySchema, body);
    const principal = requiredPrincipal(request);
    const locationId = await this.data.getReviewState(principal, reviewId).then((state) => state.businessLocationId);
    const result = await this.idempotency.execute({
      principal,
      requestId: requiredRequestId(request),
      idempotencyKey: request.header("idempotency-key"),
      action: "review.edit-draft",
      requestBody: input,
      resourceType: "review",
      resourceId: reviewId,
      locationId,
      handler: async () => {
        await this.reviews.editLatestDraft(reviewId, input.body, input.expectedVersion);
        const review = await this.data.getReview(principal, reviewId);
        return { data: review };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }

  @Post(":reviewId/draft-generations")
  @RequireApiScopes("drafts:generate")
  async generate(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("reviewId") reviewId: string, @Body() body: unknown) {
    const input = parseBody(ExternalDraftGenerateBodySchema, body ?? {});
    const principal = requiredPrincipal(request);
    const state = await this.data.assertExpectedReviewUpdate(principal, reviewId, input.expectedUpdatedAt);
    const result = await this.idempotency.execute({
      principal,
      requestId: requiredRequestId(request),
      idempotencyKey: request.header("idempotency-key"),
      action: "review.generate-draft",
      requestBody: input,
      resourceType: "review",
      resourceId: reviewId,
      locationId: state.businessLocationId,
      handler: async () => {
        const queued = await this.reviews.generate(reviewId, input.currentDraftBody);
        return {
          data: await this.data.getReview(principal, reviewId),
          asynchronous: true,
          queueJobId: queued.job.queueJobId,
          jobRunId: queued.job.queueJobId
        };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }

  @Post(":reviewId/draft-revisions")
  @RequireApiScopes("drafts:generate")
  async revise(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("reviewId") reviewId: string, @Body() body: unknown) {
    const input = parseBody(ExternalDraftReviseBodySchema, body);
    const principal = requiredPrincipal(request);
    const state = await this.data.getReviewState(principal, reviewId);
    if (input.expectedVersion && state.draft?.version !== input.expectedVersion) {
      throw new ConflictException("Draft changed after the supplied expectedVersion value");
    }
    const result = await this.idempotency.execute({
      principal,
      requestId: requiredRequestId(request),
      idempotencyKey: request.header("idempotency-key"),
      action: "review.revise-draft",
      requestBody: input,
      resourceType: "review",
      resourceId: reviewId,
      locationId: state.businessLocationId,
      handler: async () => {
        const queued = await this.reviews.regenerate(reviewId, input.instruction, input.currentDraftBody);
        return { data: await this.data.getReview(principal, reviewId), asynchronous: true, queueJobId: queued.job.queueJobId, jobRunId: queued.job.queueJobId };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }

  @Post(":reviewId/mark-handled")
  @RequireApiScopes("reviews:write")
  async markHandled(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("reviewId") reviewId: string) {
    const principal = requiredPrincipal(request);
    const state = await this.data.getReviewState(principal, reviewId);
    const result = await this.idempotency.execute({
      principal,
      requestId: requiredRequestId(request),
      idempotencyKey: request.header("idempotency-key"),
      action: "review.mark-handled",
      requestBody: {},
      resourceType: "review",
      resourceId: reviewId,
      locationId: state.businessLocationId,
      handler: async () => {
        await this.reviews.markManualHandled(reviewId, "external_api");
        const review = await this.data.getReview(principal, reviewId);
        return { data: review };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }

  @Post(":reviewId/publish-attempts")
  async publish(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("reviewId") reviewId: string, @Body() body: unknown) {
    const input = parseBody(ExternalPublishBodySchema, body);
    const principal = requiredPrincipal(request);
    const scope: ApiScope = input.mode === "live" ? "reviews:publish:live" : "reviews:publish:test";
    requireScope(principal.scopes, scope);
    await this.limits.consume(principal.clientId, scope, input.mode === "live" ? 10 : 30, 3600, true);
    const testMode = await this.settings.isPublishTestMode();
    if (input.mode === "live" && (currentEnvironment() !== "live" || principal.environment !== "live" || !input.confirmLive || testMode)) {
      throw new ForbiddenException("Live publish requires a live deployment, confirmLive=true, and server test mode disabled");
    }
    if (input.mode === "test" && !testMode) {
      throw new ConflictException("Test publish requires server publish test mode enabled");
    }
    const state = await this.data.assertExpectedReviewUpdate(principal, reviewId, input.expectedUpdatedAt);
    const result = await this.idempotency.execute({
      principal,
      requestId: requiredRequestId(request),
      idempotencyKey: request.header("idempotency-key"),
      action: `review.publish.${input.mode}`,
      requestBody: input,
      resourceType: "review",
      resourceId: reviewId,
      locationId: state.businessLocationId,
      handler: async () => {
        await this.reviews.publish(reviewId, input.body, "external_api");
        return { data: await this.data.getReview(principal, reviewId) };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }
}

function requiredPrincipal(request: ExternalApiRequest) {
  if (!request.apiPrincipal) throw new Error("API principal missing");
  return request.apiPrincipal;
}

function requiredRequestId(request: ExternalApiRequest) {
  if (!request.requestId) throw new Error("Request ID missing");
  return request.requestId;
}

function requireScope(scopes: ApiScope[], required: ApiScope) {
  if (!scopes.includes(required)) throw new ForbiddenException(`Required API scope: ${required}`);
}
