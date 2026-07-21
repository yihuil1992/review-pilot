import { Body, Controller, ForbiddenException, Get, Inject, Patch, Req, Res, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { ExternalPublishModeBodySchema } from "@review-pilot/shared";
import type { Response } from "express";
import { SettingsService } from "../settings/settings.service.js";
import { parseBody } from "../validation.js";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { ApiAuditInterceptor } from "./api-audit.interceptor.js";
import { currentEnvironment } from "./api-client.service.js";
import { ExternalApiErrorFilter } from "./api-error.filter.js";
import { ApiIdempotencyService } from "./api-idempotency.service.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { apiData } from "./api-response.js";
import { RequireApiScopes } from "./api-scope.decorator.js";
import { ApiScopeGuard } from "./api-scope.guard.js";

@Controller("v1/settings")
@UseGuards(ApiKeyGuard, ApiScopeGuard)
@UseInterceptors(ApiAuditInterceptor)
@UseFilters(ExternalApiErrorFilter)
export class ExternalSettingsController {
  constructor(
    @Inject(SettingsService) private readonly settings: SettingsService,
    @Inject(ApiIdempotencyService) private readonly idempotency: ApiIdempotencyService
  ) {}

  @Get()
  @RequireApiScopes("settings:read")
  async get(@Req() request: ExternalApiRequest) {
    return apiData(request, safeSettings(await this.settings.getBootstrap()));
  }

  @Patch()
  @RequireApiScopes("publish-mode:manage")
  async update(@Req() request: ExternalApiRequest, @Res({ passthrough: true }) response: Response, @Body() body: unknown) {
    const input = parseBody(ExternalPublishModeBodySchema, body);
    const principal = request.apiPrincipal!;
    if (!input.publishTestMode && (!input.confirmLive || currentEnvironment() !== "live" || principal.environment !== "live")) {
      throw new ForbiddenException("Disabling test mode requires a live deployment/client and confirmLive=true");
    }
    const result = await this.idempotency.execute({
      principal,
      requestId: request.requestId!,
      idempotencyKey: request.header("idempotency-key"),
      action: "settings.publish-mode",
      requestBody: input,
      resourceType: "settings",
      resourceId: "publish-mode",
      handler: async () => ({ data: await this.settings.savePublishMode(input.publishTestMode) })
    });
    response.status(result.statusCode);
    return apiData(request, { ...result.data, operation: result.operation, replayed: result.replayed });
  }
}

function safeSettings(bootstrap: Awaited<ReturnType<SettingsService["getBootstrap"]>>) {
  return {
    publishTestMode: bootstrap.publishTestMode,
    configured: {
      owner: bootstrap.ownerConfigured,
      publicBaseUrl: bootstrap.publicBaseUrlConfigured,
      google: bootstrap.googleConfigured,
      codex: bootstrap.codexConfigured,
      twilio: bootstrap.twilioConfigured
    }
  };
}
