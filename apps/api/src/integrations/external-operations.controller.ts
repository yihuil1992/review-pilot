import { Controller, Get, Inject, Param, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { ExternalApiRequest } from "./api-auth.types.js";
import { ExternalApiErrorFilter } from "./api-error.filter.js";
import { ApiKeyGuard } from "./api-key.guard.js";
import { ApiOperationsService } from "./api-operations.service.js";
import { apiData } from "./api-response.js";
import { RequireApiScopes } from "./api-scope.decorator.js";
import { ApiScopeGuard } from "./api-scope.guard.js";

@Controller("v1/operations")
@UseGuards(ApiKeyGuard, ApiScopeGuard)
@UseFilters(ExternalApiErrorFilter)
export class ExternalOperationsController {
  constructor(@Inject(ApiOperationsService) private readonly operations: ApiOperationsService) {}

  @Get(":operationId")
  @RequireApiScopes("operations:read")
  async get(@Req() request: ExternalApiRequest, @Param("operationId") operationId: string) {
    return apiData(request, await this.operations.get(request.apiPrincipal!, operationId));
  }
}
