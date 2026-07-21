import { Controller, ForbiddenException, Get, Inject, Param, Post, Query, Req, Res, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { ExternalNotificationListQuerySchema } from "@review-pilot/shared";
import type { Response } from "express";
import { NotificationsService } from "../notifications/notifications.service.js";
import { parseBody } from "../validation.js";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { ApiAuditInterceptor } from "./api-audit.interceptor.js";
import { currentEnvironment } from "./api-client.service.js";
import { ExternalApiErrorFilter } from "./api-error.filter.js";
import { ApiIdempotencyService } from "./api-idempotency.service.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { apiData, apiList } from "./api-response.js";
import { RequireApiScopes } from "./api-scope.decorator.js";
import { ApiScopeGuard } from "./api-scope.guard.js";
import { ExternalDataService } from "./external-data.service.js";
import { WebhookService } from "./webhook.service.js";

@Controller("v1")
@UseGuards(ApiKeyGuard, ApiScopeGuard)
@UseInterceptors(ApiAuditInterceptor)
@UseFilters(ExternalApiErrorFilter)
export class ExternalNotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(ExternalDataService) private readonly data: ExternalDataService,
    @Inject(ApiIdempotencyService) private readonly idempotency: ApiIdempotencyService,
    @Inject(WebhookService) private readonly webhooks: WebhookService
  ) {}

  @Get("notification-tasks")
  @RequireApiScopes("notifications:read")
  async list(@Req() request: ExternalApiRequest, @Query() query: unknown) {
    const input = parseBody(ExternalNotificationListQuerySchema, query);
    const result = await this.data.listNotificationTasks(principal(request), { ...input, limit: input.limit ?? 50 });
    return apiList(request, result.items, result.nextCursor);
  }

  @Post("notification-tasks/:reviewId/send-attempts")
  @RequireApiScopes("notifications:send")
  send(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("reviewId") reviewId: string) {
    assertLive(principal(request));
    return this.runReviewTask(request, response, reviewId, "notification.send", () => this.notifications.sendNow(reviewId), true);
  }

  @Post("notification-tasks/:reviewId/cancel")
  @RequireApiScopes("notifications:manage")
  cancel(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("reviewId") reviewId: string) {
    return this.runReviewTask(request, response, reviewId, "notification.cancel", () => this.notifications.cancel(reviewId), false);
  }

  @Post("notification-tasks/:reviewId/rerun")
  @RequireApiScopes("notifications:manage")
  rerun(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("reviewId") reviewId: string) {
    assertLive(principal(request));
    return this.runReviewTask(request, response, reviewId, "notification.rerun", () => this.notifications.rerun(reviewId), true);
  }

  @Post("notification-runs")
  @RequireApiScopes("notifications:send")
  async runDue(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response) {
    const apiPrincipal = principal(request);
    assertLive(apiPrincipal);
    if (!apiPrincipal.allLocations) {
      throw new ForbiddenException("Running all due notifications requires allLocations access");
    }
    const result = await this.idempotency.execute({
      principal: apiPrincipal,
      requestId: request.requestId!,
      idempotencyKey: request.header("idempotency-key"),
      action: "notification.run-due",
      requestBody: {},
      resourceType: "notification-run",
      handler: async () => {
        const queued = await this.notifications.sendDueNotifications("external_api", apiPrincipal.clientId);
        return { data: { accepted: true }, asynchronous: true, queueJobId: queued.jobId };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }

  private async runReviewTask(
    request: ExternalApiRequest,
    response: Response,
    reviewId: string,
    action: string,
    handler: () => Promise<Record<string, unknown>>,
    asynchronous: boolean
  ) {
    const apiPrincipal = principal(request);
    const state = await this.data.getReviewState(apiPrincipal, reviewId);
    const result = await this.idempotency.execute({
      principal: apiPrincipal,
      requestId: request.requestId!,
      idempotencyKey: request.header("idempotency-key"),
      action,
      requestBody: { reviewId },
      resourceType: "review",
      resourceId: reviewId,
      locationId: state.businessLocationId,
      handler: async () => {
        const handled = await handler();
        const queueJobId = typeof handled.jobId === "string" ? handled.jobId : undefined;
        const review = await this.data.getReview(apiPrincipal, reviewId);
        await this.webhooks.emit({ eventType: "notification.updated", resourceType: "review", resourceId: reviewId, resourceVersion: review.updatedAt, data: { notificationStatus: (handled as { notificationStatus?: string }).notificationStatus ?? "pending" } }, apiPrincipal.clientId);
        return { data: handled, asynchronous: asynchronous && Boolean(queueJobId), queueJobId };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }
}

function principal(request: ExternalApiRequest) {
  if (!request.apiPrincipal) throw new Error("API principal missing");
  return request.apiPrincipal;
}

function assertLive(apiPrincipal: ReturnType<typeof principal>) {
  if (currentEnvironment() !== "live" || apiPrincipal.environment !== "live") {
    throw new ForbiddenException("Real notification delivery requires a live deployment and client");
  }
}
