import { Body, Controller, Get, Inject, Param, Patch, Post, Req, Res, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { ExternalLocationPatchBodySchema } from "@review-pilot/shared";
import type { Response } from "express";
import { GoogleService } from "../google/google.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { parseBody } from "../validation.js";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { ApiAuditInterceptor } from "./api-audit.interceptor.js";
import { ExternalApiErrorFilter } from "./api-error.filter.js";
import { ApiIdempotencyService } from "./api-idempotency.service.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { apiData, apiList } from "./api-response.js";
import { RequireApiScopes } from "./api-scope.decorator.js";
import { ApiScopeGuard } from "./api-scope.guard.js";
import { ExternalCommandQueueService } from "./external-command-queue.service.js";
import { ExternalDataService } from "./external-data.service.js";

@Controller("v1")
@UseGuards(ApiKeyGuard, ApiScopeGuard)
@UseInterceptors(ApiAuditInterceptor)
@UseFilters(ExternalApiErrorFilter)
export class ExternalLocationsController {
  constructor(
    @Inject(GoogleService) private readonly google: GoogleService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(ExternalDataService) private readonly data: ExternalDataService,
    @Inject(ApiIdempotencyService) private readonly idempotency: ApiIdempotencyService,
    @Inject(ExternalCommandQueueService) private readonly commands: ExternalCommandQueueService
  ) {}

  @Get("locations")
  @RequireApiScopes("locations:read")
  async listLocations(@Req() request: ExternalApiRequest) {
    return apiList(request, await this.data.listLocations(principal(request)), null);
  }

  @Get("google-accounts")
  @RequireApiScopes("locations:read")
  async listAccounts(@Req() request: ExternalApiRequest) {
    return apiList(request, await this.data.listAccounts(principal(request)), null);
  }

  @Get("sync/status")
  @RequireApiScopes("system:read")
  async syncStatus(@Req() request: ExternalApiRequest) {
    return apiData(request, await this.notifications.getReviewSyncStatus());
  }

  @Post("google-accounts/:accountId/location-discoveries")
  @RequireApiScopes("locations:manage")
  async discover(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("accountId") accountId: string) {
    const apiPrincipal = principal(request);
    await this.data.assertAccountAccess(apiPrincipal, accountId);
    const result = await this.idempotency.execute({
      principal: apiPrincipal,
      requestId: request.requestId!,
      idempotencyKey: request.header("idempotency-key"),
      action: "google.discover-locations",
      requestBody: { accountId },
      resourceType: "google-account",
      resourceId: accountId,
      handler: async () => {
        await this.google.discoverLocations(accountId);
        return { data: await this.data.listLocations(apiPrincipal) };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { locations: result.data, operation: result.operation, replayed: result.replayed });
  }

  @Patch("locations/:locationId")
  @RequireApiScopes("locations:manage")
  async updateLocation(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("locationId") locationId: string, @Body() body: unknown) {
    const input = parseBody(ExternalLocationPatchBodySchema, body);
    const apiPrincipal = principal(request);
    await this.data.getLocation(apiPrincipal, locationId);
    const result = await this.idempotency.execute({
      principal: apiPrincipal,
      requestId: request.requestId!,
      idempotencyKey: request.header("idempotency-key"),
      action: "location.update",
      requestBody: input,
      resourceType: "location",
      resourceId: locationId,
      locationId,
      handler: async () => {
        if (input.enabled !== undefined) await this.google.setLocationEnabled(locationId, input.enabled);
        if (input.notificationPhoneNumber !== undefined) await this.google.setLocationNotificationPhone(locationId, input.notificationPhoneNumber);
        return { data: await this.data.getLocation(apiPrincipal, locationId) };
      }
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }

  @Post("locations/:locationId/sync-runs")
  @RequireApiScopes("sync:run")
  async sync(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Param("locationId") locationId: string) {
    const apiPrincipal = principal(request);
    await this.data.getLocation(apiPrincipal, locationId);
    const result = await this.idempotency.execute({
      principal: apiPrincipal,
      requestId: request.requestId!,
      idempotencyKey: request.header("idempotency-key"),
      action: "location.sync",
      requestBody: { locationId },
      resourceType: "location",
      resourceId: locationId,
      locationId,
      handler: async (operationId) => {
        const queued = await this.commands.enqueueLocationSync({ operationId, apiClientId: apiPrincipal.clientId, locationId });
        return { data: { accepted: true, locationId }, asynchronous: true, queueJobId: queued.queueJobId };
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
