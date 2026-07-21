import { Controller, Get, Inject, Req, UseFilters, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma.service.js";
import { SettingsService } from "../settings/settings.service.js";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { currentEnvironment } from "./api-client.service.js";
import { ExternalApiErrorFilter } from "./api-error.filter.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { apiData } from "./api-response.js";
import { RequireApiScopes } from "./api-scope.decorator.js";
import { ApiScopeGuard } from "./api-scope.guard.js";

@Controller("v1/system")
@UseGuards(ApiKeyGuard, ApiScopeGuard)
@UseFilters(ExternalApiErrorFilter)
export class ExternalSystemController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SettingsService) private readonly settings: SettingsService
  ) {}

  @Get("status")
  @RequireApiScopes("system:read")
  async status(@Req() request: ExternalApiRequest) {
    const bootstrap = await this.settings.getBootstrap();
    await this.prisma.$queryRaw`SELECT 1`;
    return apiData(request, {
      ready: true,
      environment: currentEnvironment(),
      capabilities: {
        googleConfigured: bootstrap.googleConfigured,
        twilioConfigured: bootstrap.twilioConfigured,
        codexConfigured: bootstrap.codexConfigured,
        publishTestMode: bootstrap.publishTestMode,
        webhooks: true,
        idempotency: true
      },
      checkedAt: new Date().toISOString()
    });
  }
}
